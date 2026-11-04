# Step 3 — DI container

## Files

| File | Content |
| --- | --- |
| `src/infrastructure/di/container.ts` | `'use client'`; `createContainer<AwilixRegistry>({ injectionMode: InjectionMode.PROXY, strict: true })`, default export |
| `src/infrastructure/di/registry.types.ts` | `AwilixRegistry` interface (adapters, config, hooks, constants; grows per feature) |
| `src/infrastructure/di/infrastructure.registry.ts` | adapters, `config`, framework and context hooks |
| `src/infrastructure/di/services.registry.ts` | services and use cases (empty at first) |
| `src/infrastructure/di/helpers.registry.ts` | `ERROR_CODE_MAP`, context-bridge helpers, pure utilities |
| `src/infrastructure/di/controllers.registry.ts` | controllers (empty at first) |
| `src/infrastructure/di/index.ts` | `registerAll()` calling the four in order, idempotent (guard against double registration in dev) |

## `infrastructure.registry.ts` (initial)

```ts
'use client';
import { asFunction, asValue } from 'awilix';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import container from './container';
import { config } from '@infrastructure/config';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';
import { createStorageAdapter } from '@infrastructure/adapters/storage.adapter';
import { createAnalyticsAdapter } from '@infrastructure/adapters/analytics.adapter';
import { useLoading } from '@contexts/loading.context';
import { usePopupError } from '@contexts/popup-error.context';
import { useNetworkStatus } from '@contexts/network-status.context';

export function registerInfrastructure() {
  container.register({
    config: asValue(config),
    storage: asFunction(createStorageAdapter).singleton(),
    analyticsAdapter: asFunction(createAnalyticsAdapter).singleton(),
    queueHttp: asFunction(({ config }) => createHttpAdapter({ baseUrl: config.queueApiUrl, /* … */ })).singleton(),
    coreHttp: asFunction(({ config }) => createHttpAdapter({ baseUrl: config.coreApiUrl, /* … */ })).singleton(),

    useTranslation: asValue(useTranslation),
    useQueryTanstack: asValue(useQuery),
    useMutationTanstack: asValue(useMutation),
    useQueryClientTanstack: asValue(useQueryClient),
    useRouterNext: asValue(useRouter),
    usePathnameNext: asValue(usePathname),
    useSearchParamsNext: asValue(useSearchParams),
    useParamsNext: asValue(useParams),

    useLoading: asValue(useLoading),
    usePopupError: asValue(usePopupError),
    useNetworkStatus: asValue(useNetworkStatus),
  });
}
```

Contexts are created in step 5; until then, register placeholders with a `// TODO: replace in step 5` comment and make
step 5's tasks replace them.

## Rules

- Strict order; later registries depend on earlier ones only.
- Hooks are `asValue(realHook)` — never `asValue(null)`, never `asFunction`.
- Controllers: no `.singleton()`. Adapters, services, use cases: `.singleton()`.
- After every change: keys in `AwilixRegistry` = `container.register` keys across the four files.

## Gate

```bash
npx tsc --noEmit
```
