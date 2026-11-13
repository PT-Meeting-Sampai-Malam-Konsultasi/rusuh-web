import { useEffect } from 'react';
import type { TFunction } from 'i18next';

import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { ROUTES } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import type { FormatLocale } from '@utils/format/date';
import { mainNav, type NavItem } from '@utils/navigation';

export type InfoTopic = 'terms' | 'privacy' | 'refund' | 'help';

export interface InfoSection {
  id: string;
  title: string;
  /** One string per paragraph. */
  paragraphs: string[];
}

export interface InfoLink {
  href: string;
  label: string;
  current: boolean;
}

export interface InfoControllerInterface {
  t: TFunction;
  topic: InfoTopic;
  title: string;
  lead: string;
  /** "Diperbarui 13 November 2026" */
  updated: string;
  sections: InfoSection[];
  /** The four pages, for the side list and "see also". */
  links: InfoLink[];
  contactEmail: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}

const TOPIC_ROUTES: Record<InfoTopic, string> = {
  terms: ROUTES.TERMS,
  privacy: ROUTES.PRIVACY,
  refund: ROUTES.REFUND,
  help: ROUTES.HELP,
};

/** Sections per page; the copy lives in the locale files as `info_{topic}_{n}_title` / `_body`. */
const SECTION_COUNT: Record<InfoTopic, number> = { terms: 7, privacy: 6, refund: 4, help: 6 };

const TOPICS = Object.keys(TOPIC_ROUTES) as InfoTopic[];

/** The topic from the path (`/privacy` → privacy); an unknown path falls back to help. */
const topicOf = (pathname: string | null): InfoTopic =>
  TOPICS.find((topic) => TOPIC_ROUTES[topic] === pathname?.replace(/\/$/, '')) ?? 'help';

export const CONTACT_EMAIL = 'bantuan@rusuh-tiket.web.id';

type InfoControllerDeps = Pick<AwilixRegistry, 'analyticsAdapter' | 'storage' | 'useTranslation' | 'usePathnameNext'>;

/** Static pages linked from the footer: terms, privacy, refund and help. One screen, the copy per topic. */
const InfoController = ({
  analyticsAdapter,
  storage,
  useTranslation,
  usePathnameNext,
}: InfoControllerDeps): InfoControllerInterface => {
  const { t, i18n } = useTranslation();
  const topic = topicOf(usePathnameNext());
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';

  useEffect(() => {
    analyticsAdapter.trackPageView(`info_${topic}`);
  }, [analyticsAdapter, topic]);

  const sections = Array.from({ length: SECTION_COUNT[topic] }, (_, i) => {
    const key = `info_${topic}_${i + 1}`;
    return {
      id: `${topic}-${i + 1}`,
      title: t(`${key}_title`),
      paragraphs: t(`${key}_body`, { email: CONTACT_EMAIL }).split('\n').filter(Boolean),
    };
  });

  return {
    t,
    topic,
    title: t(`info_${topic}_title`),
    lead: t(`info_${topic}_lead`, { email: CONTACT_EMAIL }),
    updated: t('info_updated'),
    sections,
    links: TOPICS.map((other) => ({
      href: TOPIC_ROUTES[other],
      label: t(`info_${other}_title`),
      current: other === topic,
    })),
    contactEmail: CONTACT_EMAIL,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    nav: mainNav(t, null),
  };
};

export default InfoController;
