import { useEffect } from 'react';
import type { TFunction } from 'i18next';

import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface NotFoundControllerInterface {
  t: TFunction;
  homeHref: string;
}

/** Reference controller: hooks come from DI, the screen gets only what it renders. */
const NotFoundController = ({
  analyticsAdapter,
  useTranslation,
}: Pick<AwilixRegistry, 'analyticsAdapter' | 'useTranslation'>): NotFoundControllerInterface => {
  const { t } = useTranslation();

  useEffect(() => {
    analyticsAdapter.trackPageView('not_found');
  }, [analyticsAdapter]);

  return { t, homeHref: '/' };
};

export default NotFoundController;
