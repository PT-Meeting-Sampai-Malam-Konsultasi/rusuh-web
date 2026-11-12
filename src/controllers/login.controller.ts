import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';
import type { TFunction } from 'i18next';

import type { User } from '@core/entities/auth/auth.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { RequestSignInCodeResult } from '@core/use_case/auth/request-sign-in-code.use-case';
import type { VerifySignInCodeResult } from '@core/use_case/auth/verify-sign-in-code.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import {
  DEFAULT_TIME_ZONE,
  formatEventDate,
  formatPosterDate,
  formatTime,
  zoneAbbr,
  type FormatLocale,
} from '@utils/format/date';
import { posterToneFor, type PosterTone } from '@utils/format/event-card';
import { ANALYTICS_EVENTS, signInFrom } from '@utils/analytics';
import { eventIdFromPath, loginReturnOf, safeNextPath, secondsLeft } from '@utils/format/login';
import { findHomeEvent, formatCountdown } from '@utils/format/queue';

export type LoginStep = 'email' | 'code' | 'profile';
/** States of the code field (HiFi `otp`, `wrong`, `expired`, plus `locked` after five wrong codes). */
export type CodeState = 'idle' | 'wrong' | 'expired' | 'locked';

const CODE_LENGTH = 6;
/** ADR-0006: a code is valid for 10 minutes. `requestOtp` has no `serverNow`, so this counts from the answer. */
const CODE_VALID_SECONDS = 600;
const EVENTS_STALE_MS = 5_000;

/** "Setelah masuk, Anda lanjut ke": the event the buyer returns to. */
export interface LoginEventView {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  posterTone: PosterTone;
  posterDate: string;
  posterPlace: string;
  dateLine: string;
  venueLine: string;
  kicker: string;
}

export interface LoginEmailForm {
  field: UseFormRegisterReturn<'email'>;
  onSubmit: () => void;
  /** Translated; '' when there is none. */
  error: string;
  submitting: boolean;
}

export interface LoginCodeView {
  email: string;
  /** Digits in a code (6). */
  length: number;
  value: string;
  onChange: (value: string) => void;
  state: CodeState;
  /** Translated; '' while `idle`. */
  message: string;
  /** "0:42" until a new code may be sent; null when it may. */
  resendIn: string | null;
  /** Translated error of the last resend (rate limit), or ''. */
  resendError: string;
  /** "9:12". */
  validFor: string;
  onResend: () => void;
  onChangeEmail: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export interface LoginProfileForm {
  email: string;
  field: UseFormRegisterReturn<'fullName'>;
  onSubmit: () => void;
  error: string;
  submitting: boolean;
  submitLabel: string;
}

export interface LoginControllerInterface {
  t: TFunction;
  step: LoginStep;
  event: LoginEventView | null;
  emailForm: LoginEmailForm;
  code: LoginCodeView;
  profileForm: LoginProfileForm;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  homeHref: string;
}

interface Challenge {
  challengeId: string;
  email: string;
  resendAfterSeconds: number;
  /** Client time the answer arrived; the timers count from here. */
  receivedAt: number;
}

type LoginControllerDeps = Pick<
  AwilixRegistry,
  | 'requestSignInCodeUseCase'
  | 'verifySignInCodeUseCase'
  | 'accountService'
  | 'getHomeEventsUseCase'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useSearchParamsNext'
  | 'useRouterNext'
  | 'useLoading'
  | 'usePopupError'
>;

const emailSchema = z.object({
  email: z.pipe(z.string().check(z.trim()), z.email('login_email_invalid')),
});
const profileSchema = z.object({
  fullName: z.string().check(z.trim(), z.minLength(1, 'login_name_required'), z.maxLength(200, 'login_name_too_long')),
});
type EmailValues = z.infer<typeof emailSchema>;
type ProfileValues = z.infer<typeof profileSchema>;

const PROFILE_FIELD_CODES = new Set(['VALIDATION_FAILED', 'BAD_REQUEST']);
const SUBMIT_LABELS = { queue: 'login_continue_queue', order: 'login_continue_order', other: 'login_continue' };

const LoginController = ({
  requestSignInCodeUseCase,
  verifySignInCodeUseCase,
  accountService,
  getHomeEventsUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useMutationTanstack,
  useSearchParamsNext,
  useRouterNext,
  useLoading,
  usePopupError,
}: LoginControllerDeps): LoginControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const { toggleLoading } = useLoading();
  const { openPopupError } = usePopupError();
  const next = safeNextPath(useSearchParamsNext().get('next'));
  const eventId = eventIdFromPath(next);

  const [step, setStep] = useState<LoginStep>('email');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  const [attemptsLeft, setAttemptsLeft] = useState(0);
  const [emailError, setEmailError] = useState('');
  const [resendError, setResendError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const verifiedCode = useRef<string | null>(null);

  useEffect(() => {
    analyticsAdapter.trackPageView('login');
  }, [analyticsAdapter]);

  const emailFormApi = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const profileFormApi = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '' },
  });

  const popup = (error: HttpError) =>
    openPopupError({
      message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
      reference: error.requestId,
    });

  const rateLimitText = (seconds: number | null) =>
    seconds !== null ? t('login_rate_limited_wait', { seconds }) : t('login_rate_limited');

  const requestCode = useMutationTanstack<RequestSignInCodeResult, HttpError, string>({
    mutationFn: (email) => {
      toggleLoading();
      return requestSignInCodeUseCase.execute({ email, locale, ...(eventId ? { eventId } : {}) });
    },
    onSuccess: (result) => {
      toggleLoading();
      if (result.kind === 'sent') {
        setChallenge({
          challengeId: result.challengeId,
          email: result.email,
          resendAfterSeconds: result.resendAfterSeconds,
          receivedAt: Date.now(),
        });
        setCode('');
        setCodeState('idle');
        setEmailError('');
        setResendError('');
        verifiedCode.current = null;
        setStep('code');
        analyticsAdapter.trackEvent('login_code_requested', { fromEvent: eventId !== null });
        return;
      }
      const message =
        result.kind === 'rate-limited' ? rateLimitText(result.retryAfterSeconds) : t('login_email_invalid');
      if (step === 'code') setResendError(message);
      else setEmailError(message);
    },
    onError: (error) => {
      toggleLoading();
      popup(error);
    },
  });

  const verify = useMutationTanstack<VerifySignInCodeResult, HttpError, { challengeId: string; code: string }>({
    mutationFn: (input) => {
      toggleLoading();
      return verifySignInCodeUseCase.execute(input);
    },
    onSuccess: (result) => {
      toggleLoading();
      if (result.kind === 'signed-in') {
        // Tracking plan §2 step 6: a new account is a sign_up, any other a login.
        analyticsAdapter.trackEvent(result.isNewAccount ? ANALYTICS_EVENTS.SIGN_UP : ANALYTICS_EVENTS.LOGIN, {
          method: 'email_code',
          from: signInFrom(next),
          ...(eventId ? { event_id: eventId } : {}),
        });
        if (result.isNewAccount) {
          setUser(result.user);
          profileFormApi.reset({ fullName: result.user.fullName ?? '' });
          setStep('profile');
          return;
        }
        router.replace(next);
        return;
      }
      if (result.kind === 'wrong-code') setAttemptsLeft(result.attemptsLeft);
      setCodeState(result.kind === 'wrong-code' ? 'wrong' : result.kind);
    },
    onError: (error) => {
      toggleLoading();
      verifiedCode.current = null;
      popup(error);
    },
  });

  const saveProfile = useMutationTanstack<unknown, HttpError, ProfileValues>({
    mutationFn: ({ fullName }) => {
      toggleLoading();
      return accountService.updateProfile({ fullName: fullName.trim(), locale });
    },
    onSuccess: () => {
      toggleLoading();
      analyticsAdapter.trackEvent('login_profile_saved', {});
      router.replace(next);
    },
    onError: (error) => {
      toggleLoading();
      if (PROFILE_FIELD_CODES.has(error.code)) return setProfileError(t('login_name_invalid'));
      if (error.status === 401) {
        // The session ended before the name was saved: sign in again (the account exists already).
        setEmailError(t('login_session_ended'));
        return setStep('email');
      }
      popup(error);
    },
  });

  // Timers: server-given durations counted from the answer, ticking only on the code step.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (step !== 'code') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);
  const resendLeft = challenge ? secondsLeft(challenge.resendAfterSeconds, challenge.receivedAt, now) : 0;
  const validLeft = challenge ? secondsLeft(CODE_VALID_SECONDS, challenge.receivedAt, now) : 0;
  const shownCodeState: CodeState = codeState === 'idle' && challenge && validLeft === 0 ? 'expired' : codeState;

  const submitCode = (value: string) => {
    if (!challenge || value.length !== CODE_LENGTH || verifiedCode.current === value || verify.isPending) return;
    verifiedCode.current = value;
    verify.mutate({ challengeId: challenge.challengeId, code: value });
  };

  const eventsQuery = useQueryTanstack<HomeEvents, HttpError>({
    queryKey: [QUERY_KEYS.EVENTS],
    queryFn: () => getHomeEventsUseCase.execute(),
    enabled: eventId !== null,
    staleTime: EVENTS_STALE_MS,
  });
  const summary = eventId ? findHomeEvent(eventsQuery.data, eventId) : null;

  const event = useMemo((): LoginEventView | null => {
    if (!summary) return null;
    const timeZone = summary.timezone ?? DEFAULT_TIME_ZONE;
    const opens = summary.saleOpensAt;
    return {
      name: summary.name,
      subtitle: summary.subtitle,
      imageUrl: summary.imageUrl,
      posterTone: posterToneFor(summary.eventId),
      posterDate: formatPosterDate(summary.startsAt, timeZone),
      posterPlace: [summary.venueShort ?? summary.venue, summary.city].filter(Boolean).join(' · ').toUpperCase(),
      dateLine: formatEventDate(summary.startsAt, locale, timeZone),
      venueLine: [summary.venue, summary.city].filter(Boolean).join(', '),
      kicker:
        summary.state === 'waiting_room_open' && opens
          ? t('queue_kicker_prequeue', { time: `${formatTime(opens, locale, timeZone)} ${zoneAbbr(timeZone)}` })
          : t('queue_kicker_open'),
    };
  }, [summary, locale, t]);

  const codeMessages: Record<CodeState, string> = {
    idle: '',
    wrong: t('login_code_wrong', { attempts: attemptsLeft }),
    expired: t('login_code_expired'),
    locked: t('login_code_locked'),
  };

  const fieldError = (key: string | undefined) => (key ? t(key) : '');

  return {
    t,
    step,
    event,
    emailForm: {
      field: emailFormApi.register('email', { onChange: () => setEmailError('') }),
      onSubmit: emailFormApi.handleSubmit(({ email }) => requestCode.mutate(email)),
      error: emailError || fieldError(emailFormApi.formState.errors.email?.message),
      submitting: requestCode.isPending,
    },
    code: {
      email: challenge?.email ?? '',
      length: CODE_LENGTH,
      value: code,
      onChange: (value) => {
        const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
        setCode(digits);
        if (codeState === 'wrong') setCodeState('idle');
        submitCode(digits);
      },
      state: shownCodeState,
      message: codeMessages[shownCodeState],
      resendIn: resendLeft > 0 ? formatCountdown(resendLeft, t) : null,
      resendError,
      validFor: formatCountdown(validLeft, t),
      onResend: () => {
        if (challenge) requestCode.mutate(challenge.email);
      },
      onChangeEmail: () => {
        emailFormApi.reset({ email: challenge?.email ?? '' });
        setStep('email');
      },
      onSubmit: () => submitCode(code),
      submitting: verify.isPending,
    },
    profileForm: {
      email: user?.email ?? challenge?.email ?? '',
      field: profileFormApi.register('fullName', { onChange: () => setProfileError('') }),
      onSubmit: profileFormApi.handleSubmit((values) => saveProfile.mutate(values)),
      error: profileError || fieldError(profileFormApi.formState.errors.fullName?.message),
      submitting: saveProfile.isPending,
      submitLabel: t(SUBMIT_LABELS[loginReturnOf(next)]),
    },
    locale,
    setLocale: (nextLocale) => {
      storage.set(STORAGE_KEYS.LANGUAGE, nextLocale);
      void i18n.changeLanguage(nextLocale);
    },
    homeHref: ROUTES.HOME,
  };
};

export default LoginController;
