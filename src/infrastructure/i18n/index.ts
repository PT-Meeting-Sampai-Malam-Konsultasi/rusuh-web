import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

export type Locale = 'id' | 'en';
export const LOCALES: readonly Locale[] = ['id', 'en'];

/** Bahasa Indonesia is the default and the fallback (ADR-0014). The saved choice is applied on the client after mount. */
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { id: { translation: id }, en: { translation: en } },
    lng: 'id',
    fallbackLng: 'id',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
