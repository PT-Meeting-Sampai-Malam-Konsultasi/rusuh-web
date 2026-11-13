import { useEffect, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';
import type { TFunction } from 'i18next';

import type { User } from '@core/entities/auth/auth.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import type { FormatLocale } from '@utils/format/date';
import { mainNav, type NavItem } from '@utils/navigation';

export interface AccountNameForm {
  editing: boolean;
  field: UseFormRegisterReturn<'fullName'>;
  /** Translated; '' when the name is fine. */
  error: string;
  saving: boolean;
  edit: () => void;
  cancel: () => void;
  onSubmit: () => void;
}

export interface AccountControllerInterface {
  t: TFunction;
  status: 'loading' | 'ready' | 'error';
  /** Who is signed in: the name as on the KTP (or '' before the profile step) and the sign-in e-mail. */
  profile: { name: string; email: string } | null;
  nameForm: AccountNameForm;
  signOut: () => void;
  signingOut: boolean;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  retry: () => void;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  /** The analytics cookie switch (NFR-09-W2); null while NEXT_PUBLIC_ANALYTICS_ENABLED is off. */
  privacy: { analytics: boolean; setAnalytics: (granted: boolean) => void } | null;
  nav: NavItem[];
}

type AccountControllerDeps = Pick<
  AwilixRegistry,
  | 'accountService'
  | 'signOutUseCase'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useQueryClientTanstack'
  | 'useRouterNext'
  | 'useLoading'
  | 'usePopupError'
  | 'useConsent'
>;

const nameSchema = z.object({
  fullName: z.string().check(z.trim(), z.minLength(1, 'login_name_required'), z.maxLength(200, 'login_name_too_long')),
});
type NameValues = z.infer<typeof nameSchema>;

const NAME_FIELD_CODES = new Set(['VALIDATION_FAILED', 'BAD_REQUEST']);
const SIGN_IN_HERE = `${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.ACCOUNT)}`;

/** NFR-07-W3: who you are and how you sign in. The account holds no NIK (ADR-0007, D17): it is entered per ticket. */
const AccountController = ({
  accountService,
  signOutUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useMutationTanstack,
  useQueryClientTanstack,
  useRouterNext,
  useLoading,
  usePopupError,
  useConsent,
}: AccountControllerDeps): AccountControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const queryClient = useQueryClientTanstack();
  const { toggleLoading } = useLoading();
  const { openPopupError } = usePopupError();
  const consent = useConsent();
  const [editing, setEditing] = useState(false);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    analyticsAdapter.trackPageView('account');
  }, [analyticsAdapter]);

  const meQuery = useQueryTanstack<User, HttpError>({
    queryKey: [QUERY_KEYS.ME],
    queryFn: async () => (await accountService.getMe()).data,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // No session, or it could not be renewed: sign in, then come back here.
  const signedOut = meQuery.error?.status === 401;
  useEffect(() => {
    if (signedOut) router.replace(SIGN_IN_HERE);
  }, [signedOut, router]);

  const formApi = useForm<NameValues>({ resolver: zodResolver(nameSchema), defaultValues: { fullName: '' } });

  const popup = (error: HttpError) =>
    openPopupError({
      message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
      reference: error.requestId,
    });

  const saveName = useMutationTanstack<User, HttpError, NameValues>({
    mutationFn: async ({ fullName }) => {
      toggleLoading();
      return (await accountService.updateProfile({ fullName: fullName.trim(), locale })).data;
    },
    onSuccess: (user) => {
      toggleLoading();
      queryClient.setQueryData([QUERY_KEYS.ME], user);
      analyticsAdapter.trackEvent('account_name_saved', {});
      setEditing(false);
    },
    onError: (error) => {
      toggleLoading();
      if (NAME_FIELD_CODES.has(error.code)) return setNameError(t('login_name_invalid'));
      if (error.status === 401) return router.replace(SIGN_IN_HERE);
      popup(error);
    },
  });

  const signOut = useMutationTanstack<{ revoked: boolean }, HttpError, void>({
    mutationFn: () => {
      toggleLoading();
      return signOutUseCase.execute();
    },
    onSuccess: ({ revoked }) => {
      toggleLoading();
      queryClient.removeQueries({ queryKey: [QUERY_KEYS.ME] });
      analyticsAdapter.trackEvent('account_sign_out', { revoked });
      analyticsAdapter.setUser(null);
      router.replace(ROUTES.HOME);
    },
    onError: (error) => {
      toggleLoading();
      popup(error);
    },
  });

  const user = meQuery.data;
  const status = user ? 'ready' : meQuery.isError && !signedOut ? 'error' : 'loading';
  const errorKey = meQuery.error?.code;
  const nameMessage = formApi.formState.errors.fullName?.message;

  return {
    t,
    status,
    profile: user ? { name: user.fullName?.trim() ?? '', email: user.email } : null,
    nameForm: {
      editing,
      field: formApi.register('fullName', { onChange: () => setNameError('') }),
      error: nameError || (nameMessage ? t(nameMessage) : ''),
      saving: saveName.isPending,
      edit: () => {
        formApi.reset({ fullName: user?.fullName ?? '' });
        setNameError('');
        setEditing(true);
      },
      cancel: () => setEditing(false),
      onSubmit: formApi.handleSubmit((values) => saveName.mutate(values)),
    },
    signOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
    errorMessage: status === 'error' && errorKey ? t(ERROR_CODE_MAP[errorKey] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '',
    retry: () => {
      void meQuery.refetch();
    },
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    privacy: consent.enabled
      ? { analytics: consent.analytics === 'granted', setAnalytics: consent.setAnalytics }
      : null,
    nav: mainNav(t, 'account'),
  };
};

export default AccountController;
