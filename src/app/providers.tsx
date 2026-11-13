'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';

import { ConsentProvider, useConsentPrompt } from '@contexts/consent.context';
import { LoadingProvider, useLoading } from '@contexts/loading.context';
import { NetworkStatusProvider, useNetworkStatus } from '@contexts/network-status.context';
import { PopupErrorProvider, useCurrentPopupError } from '@contexts/popup-error.context';
import container from '@infrastructure/di/container';
import { registerAll } from '@infrastructure/di';
import i18n from '@infrastructure/i18n';
import ConsentBanner from '@presentation/components/ConsentBanner';
import ConsentSettings from '@presentation/components/ConsentSettings';
import ErrorPopup from '@presentation/components/ErrorPopup';
import LoadingOverlay from '@presentation/components/LoadingOverlay';
import MockBadge from '@presentation/components/MockBadge';
import OfflineBanner from '@presentation/components/OfflineBanner';
import { ROUTES } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { supportCode } from '@utils/format/support';

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

/**
 * With NEXT_PUBLIC_API_MOCK=true, starts the MSW worker before anything renders, so the first query is already mocked.
 * The import is dynamic: without the flag the mock code is never downloaded.
 */
function MockApiGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => !container.resolve('config').apiMock);
  useEffect(() => {
    if (ready) return;
    let active = true;
    const start = async () => {
      const { startMockApi } = await import('@infrastructure/mocks/browser');
      await startMockApi(container.resolve('config'));
      if (active) setReady(true);
    };
    void start();
    return () => {
      active = false;
    };
  }, [ready]);
  return ready ? children : null;
}

/**
 * The analytics cookie question and its settings (NFR-09-W2), only with NEXT_PUBLIC_ANALYTICS_ENABLED. In the waiting
 * room the question is one short line, so it never covers the number.
 */
function ConsentOverlays() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { bannerVisible, analytics, setAnalytics, settingsOpen, openSettings, closeSettings } = useConsentPrompt();
  const compact = pathname === ROUTES.QUEUE;
  return (
    <>
      <ConsentBanner
        visible={bannerVisible}
        compact={compact}
        labels={{
          title: t(compact ? 'consent_title_short' : 'consent_title'),
          body: t(compact ? 'consent_body_short' : 'consent_body'),
          more: t('consent_more'),
          accept: t('consent_accept'),
          decline: t('consent_decline'),
        }}
        onAccept={() => setAnalytics(true)}
        onDecline={() => setAnalytics(false)}
        onMore={openSettings}
      />
      <ConsentSettings
        open={settingsOpen}
        analytics={analytics === 'granted'}
        labels={{
          title: t('consent_settings_title'),
          intro: t('consent_settings_intro'),
          requiredTitle: t('consent_required_title'),
          requiredOn: t('consent_required_on'),
          requiredBody: t('consent_required_body'),
          analyticsTitle: t('consent_analytics_title'),
          analyticsBody: t('consent_analytics_body'),
          note: t('consent_errors_note'),
          on: t('switch_on'),
          off: t('switch_off'),
          save: t('consent_save'),
          cancel: t('action_cancel'),
        }}
        onSave={setAnalytics}
        onClose={closeSettings}
      />
    </>
  );
}

/** App-wide overlays driven by the contexts: loading, the error popup and the offline banner. */
function GlobalOverlays() {
  const { t } = useTranslation();
  const { isLoading } = useLoading();
  const { popup, closePopupError } = useCurrentPopupError();
  const { isOnline } = useNetworkStatus();
  const { apiMock, analyticsEnabled } = container.resolve('config');
  return (
    <>
      {analyticsEnabled && <ConsentOverlays />}
      {apiMock && <MockBadge label={t('mock_badge')} hint={t('mock_badge_hint')} />}
      <OfflineBanner visible={!isOnline} message={t('offline_banner')} />
      <LoadingOverlay visible={isLoading} label={t('state_loading')} />
      <ErrorPopup
        open={popup !== null}
        title={popup?.title}
        message={popup?.message ?? ''}
        actionLabel={popup?.actionLabel}
        onAction={popup?.onAction}
        closeLabel={t('action_close')}
        reference={
          popup?.reference
            ? {
                label: t('error_reference', { code: supportCode(popup.reference) }),
                value: popup.reference,
                copyLabel: t('error_reference_copy'),
                copiedLabel: t('error_reference_copied'),
              }
            : undefined
        }
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
              <ConsentProvider
                enabled={container.resolve('config').analyticsEnabled}
                store={container.resolve('consentStore')}
              >
                <LocaleSync />
                <MockApiGate>{children}</MockApiGate>
                <GlobalOverlays />
              </ConsentProvider>
            </PopupErrorProvider>
          </LoadingProvider>
        </NetworkStatusProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
