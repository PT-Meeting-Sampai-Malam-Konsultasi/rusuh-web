import { http, HttpResponse, type HttpHandler } from 'msw';

import type { OtpChallenge, Session, User } from '@core/entities/auth/auth.entity';

import { failure, problem, problemWith, type MockContext } from './shared';

/** The code that signs in; `000000` answers expired; anything else is wrong. */
export const MOCK_OTP_CODE = '123456';
export const MOCK_EXPIRED_CODE = '000000';
/** An account that exists already, so the profile step is skipped. Every other e-mail is new until it has a name. */
export const MOCK_KNOWN_EMAIL = 'nadia.saputri@gmail.com';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_S = 60;
const MAX_ATTEMPTS = 5;

interface MockChallenge {
  email: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
  used: boolean;
}

/**
 * The core auth service as the sign-in page sees it (ADR-0006). Sessions live in this factory, so a page reload
 * signs out, as it does until the refresh cookie works across our domains.
 */
/** One @, no spaces, a dot inside the domain. Split, not a regex, so it cannot backtrack. */
const isEmailShaped = (email: string | undefined): email is string => {
  const [local, domain, ...rest] = (email ?? '').split('@');
  return !!local && !!domain && rest.length === 0 && !/\s/.test(email ?? '') && domain.slice(1, -1).includes('.');
};

export function authHandlers({ coreApiUrl, getScenario, now }: MockContext): HttpHandler[] {
  const challenges = new Map<string, MockChallenge>();
  const accounts = new Map<string, User>([
    [MOCK_KNOWN_EMAIL, { userId: 'usr_mock_nadia', email: MOCK_KNOWN_EMAIL, fullName: 'Nadia Saputri', locale: 'id' }],
  ]);
  const sessions = new Map<string, string>();
  let lastEmail: string | null = null;
  let issued = 0;

  const issue = (email: string, isNewAccount: boolean): Session => {
    issued += 1;
    const accessToken = `mock-at-${issued}`;
    sessions.set(accessToken, email);
    lastEmail = email;
    return { accessToken, expiresIn: 900, isNewAccount, user: accounts.get(email) as User };
  };

  const signedIn = (request: Request): User | null => {
    const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const email = sessions.get(token);
    return email ? (accounts.get(email) ?? null) : null;
  };

  return [
    http.post(`${coreApiUrl}/auth/otp`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!request.headers.get('X-Device-Token')) return problem(401, 'UNAUTHORIZED', 'Perangkat belum terdaftar');
      if (!request.headers.has('X-Turnstile-Token') && !request.headers.get('X-Queue-Token')) {
        return problem(400, 'VALIDATION_FAILED', 'Turnstile wajib');
      }
      const { email } = (await request.json()) as { email?: string };
      if (!isEmailShaped(email)) {
        return problem(400, 'VALIDATION_FAILED', 'Email tidak valid');
      }
      const time = now().getTime();
      if (email.includes('limit')) {
        return problemWith(429, 'RATE_LIMITED', 'Terlalu banyak permintaan', { retryAfter: 42 });
      }
      const latest = [...challenges.values()].filter((c) => c.email === email).at(-1);
      const waited = latest ? (time - latest.createdAt) / 1000 : Infinity;
      if (waited < RESEND_AFTER_S) {
        return problemWith(429, 'RATE_LIMITED', 'Tunggu sebelum meminta kode lagi', {
          retryAfter: Math.ceil(RESEND_AFTER_S - waited),
        });
      }
      // One active code per e-mail: older ones stop working.
      challenges.forEach((c) => {
        if (c.email === email) c.used = true;
      });
      const challengeId = `ch_mock_${challenges.size + 1}`;
      challenges.set(challengeId, { email, expiresAt: time + CODE_TTL_MS, createdAt: time, attempts: 0, used: false });
      return HttpResponse.json<OtpChallenge>(
        {
          challengeId,
          expiresAt: new Date(time + CODE_TTL_MS).toISOString(),
          resendAfterSeconds: RESEND_AFTER_S,
        },
        { status: 202 },
      );
    }),

    http.post(`${coreApiUrl}/auth/otp/verify`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!request.headers.get('X-Device-Token')) return problem(401, 'UNAUTHORIZED', 'Perangkat belum terdaftar');
      const { challengeId, code } = (await request.json()) as { challengeId: string; code: string };
      const challenge = challenges.get(challengeId);
      if (!challenge || challenge.used || challenge.expiresAt <= now().getTime() || code === MOCK_EXPIRED_CODE) {
        return problem(410, 'CHALLENGE_EXPIRED', 'Kode sudah kedaluwarsa');
      }
      if (challenge.attempts >= MAX_ATTEMPTS) return problem(410, 'CHALLENGE_LOCKED', 'Terlalu banyak percobaan');
      if (code !== MOCK_OTP_CODE) {
        challenge.attempts += 1;
        if (challenge.attempts >= MAX_ATTEMPTS) return problem(410, 'CHALLENGE_LOCKED', 'Terlalu banyak percobaan');
        return problemWith(409, 'WRONG_CODE', 'Kode salah', { attemptsLeft: MAX_ATTEMPTS - challenge.attempts });
      }
      challenge.used = true;
      const isNewAccount = !accounts.get(challenge.email)?.fullName;
      if (!accounts.has(challenge.email)) {
        accounts.set(challenge.email, { userId: `usr_mock_${accounts.size + 1}`, email: challenge.email });
      }
      return HttpResponse.json<Session>(issue(challenge.email, isNewAccount));
    }),

    http.post(`${coreApiUrl}/auth/refresh`, async () => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!lastEmail) return problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
      return HttpResponse.json<Session>(issue(lastEmail, false));
    }),

    http.post(`${coreApiUrl}/auth/logout`, () => {
      sessions.clear();
      lastEmail = null;
      return new HttpResponse(null, { status: 204 });
    }),

    // The profile lives at `GET /auth/profile`; the backend no longer uses `GET /me` (12 Nov).
    http.get(`${coreApiUrl}/auth/profile`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const user = signedIn(request);
      return user ? HttpResponse.json<User>(user) : problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
    }),

    http.put(`${coreApiUrl}/auth/profile`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const user = signedIn(request);
      if (!user) return problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
      const { fullName, locale } = (await request.json()) as { fullName?: string; locale?: 'id' | 'en' };
      const name = fullName?.trim() ?? '';
      if (!name || name.length > 200) return problem(400, 'VALIDATION_FAILED', 'Nama tidak valid');
      const updated: User = { ...user, fullName: name, locale: locale ?? user.locale };
      accounts.set(user.email, updated);
      return HttpResponse.json<User>(updated);
    }),
  ];
}
