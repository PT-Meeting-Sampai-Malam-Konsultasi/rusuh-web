'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';

import { LoadingProvider, useLoading } from '@contexts/loading.context';
import { NetworkStatusProvider, useNetworkStatus } from '@contexts/network-status.context';
import { PopupErrorProvider, useCurrentPopupError } from '@contexts/popup-error.context';
import container from '@infrastructure/di/container';
import { registerAll } from '@infrastructure/di';
import i18n from '@infrastructure/i18n';
import ErrorPopup from '@presentation/components/ErrorPopup';
import LoadingOverlay from '@presentation/components/LoadingOverlay';
import OfflineBanner from '@presentation/components/OfflineBanner';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

// Wiring only: register the container once, before any provider renders. No service calls here.
registerAll();

/** Applies the saved language after mount and keeps <html lang> in step with it. */
function LocaleSync() {
  useEffect(() => {
    const saved = container.resolve('storage').get(STORAGE_KEYS.LANGUAGE);
    if ((saved === 'id' || saved === 'en') && i18n.language !== saved) void i18n.changeLanguage(saved);
    const apply = (lng: string) => {
      document.documentElement.lang = lng;
    };
    apply(i18n.language);
    i18n.on('languageChanged', apply);
    return () => i18n.off('languageChanged', apply);
  }, []);
  return null;
}

/** App-wide overlays driven by the contexts: loading, the error popup and the offline banner. */
function GlobalOverlays() {
  const { t } = useTranslation();
  const { isLoading } = useLoading();
  const { popup, closePopupError } = useCurrentPopupError();
  const { isOnline } = useNetworkStatus();
  return (
    <>
      <OfflineBanner visible={!isOnline} message={t('offline_banner')} />
      <LoadingOverlay visible={isLoading} label={t('state_loading')} />
      <ErrorPopup
        open={popup !== null}
        title={popup?.title}
        message={popup?.message ?? ''}
        actionLabel={popup?.actionLabel}
        onAction={popup?.onAction}
        closeLabel={t('action_close')}
        onClose={closePopupError}
      />
    </>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <NetworkStatusProvider>
          <LoadingProvider>
            <PopupErrorProvider>
              <LocaleSync />
              {children}
              <GlobalOverlays />
            </PopupErrorProvider>
          </LoadingProvider>
        </NetworkStatusProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
