# Add a controller

Always delegate to `controller-writer`. Rules: `.claude/rules/controller.md`.

## Steps

1. `src/controllers/{page-name}.controller.ts`: interface (named) + factory (default).
2. `src/controllers/__tests__/{page-name}.controller.test.ts`.
3. Register in `controllers.registry.ts` as `asFunction(Controller)` — no `.singleton()`.
4. Add the interface to `AwilixRegistry`; check every destructured key is registered.

## Template

```ts
// src/controllers/sign-in.controller.ts
import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface SignInControllerInterface {
  t: TFunction;
  step: 'email' | 'code' | 'profile';
  isSending: boolean;
  submitEmail: (email: string) => void;
}

const SignInController = ({
  authService,
  analyticsAdapter,
  ERROR_CODE_MAP,
  useTranslation,
  useMutationTanstack,
  useLoading,
  usePopupError,
}: Pick<
  AwilixRegistry,
  | 'authService'
  | 'analyticsAdapter'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useMutationTanstack'
  | 'useLoading'
  | 'usePopupError'
>): SignInControllerInterface => {
  const { t } = useTranslation();
  const { toggleLoading } = useLoading();
  const { openPopupError } = usePopupError();
  const [step, setStep] = useState<SignInControllerInterface['step']>('email');

  useEffect(() => {
    analyticsAdapter.trackPageView('sign_in');
  }, [analyticsAdapter]);

  const requestCode = useMutationTanstack({
    mutationFn: (email: string) => {
      toggleLoading();
      return authService.requestOtp({ email, locale: 'id' });
    },
    onSuccess: () => {
      toggleLoading();
      setStep('code');
    },
    onError: (error: HttpError) => {
      toggleLoading();
      openPopupError({ message: t(ERROR_CODE_MAP[error.code] ?? 'error_unknown') });
    },
  });

  return { t, step, isSending: requestCode.isPending, submitEmail: (email) => requestCode.mutate(email) };
};

export default SignInController;
```

## Test template

```ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SignInController from '../sign-in.controller';

describe('SignInController', () => {
  let options: any;
  const toggleLoading = vi.fn();
  const openPopupError = vi.fn();
  const deps = {
    authService: { requestOtp: vi.fn() },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn() },
    ERROR_CODE_MAP: { RATE_LIMITED: 'error_rate_limited' },
    useTranslation: () => ({ t: (k: string) => k }),
    useMutationTanstack: (o: unknown) => { options = o; return { mutate: vi.fn(), isPending: false }; },
    useLoading: () => ({ toggleLoading }),
    usePopupError: () => ({ openPopupError }),
  };

  it('toggles loading in every mutation path', async () => {
    renderHook(() => SignInController(deps as never));
    await options.mutationFn('a@b.c');
    options.onSuccess();
    options.onError({ status: 429, code: 'RATE_LIMITED' });
    expect(toggleLoading).toHaveBeenCalledTimes(3);
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_rate_limited' });
  });
});
```

Controllers call `useState`/`useEffect`, so always run them inside `renderHook`; read the returned interface from
`result.current`. Fake hooks (`useMutationTanstack`, `useTranslation`, …) are plain functions passed as deps.
