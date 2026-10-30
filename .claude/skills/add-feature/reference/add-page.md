# Add a page

Route file + screen + sections + styles + translations. Delegate to `presentation-writer`. Rules:
`.claude/rules/presentation.md`, `.claude/rules/design-system.md`, `.claude/rules/error-handling.md`.

## File structure

```
src/app/{route}/
├── page.tsx                      ← route file (server component)
└── error.tsx                     ← segment fallback ('use client', { error, retry })

src/presentation/pages/{Domain}/{Page}/
├── __tests__/index.test.tsx      ← page shell test
├── components/
│   └── {Section}/
│       ├── __tests__/index.test.tsx
│       ├── index.tsx
│       └── {section}.module.css
├── index.tsx                     ← page shell ('use client')
└── {page}.module.css
```

## Route file

```tsx
// src/app/masuk/page.tsx
import SignInScreen from '@presentation/pages/Auth/SignIn';

export const metadata = { title: 'Masuk' };

export default function Page() {
  return <SignInScreen />;
}
```

Wrap the screen in `<Suspense>` when its controller reads search params (see the presentation rule).

## Page shell

```tsx
// src/presentation/pages/Auth/SignIn/index.tsx
'use client';
import container from '@infrastructure/di/container';
import type { SignInControllerInterface } from '@controllers/sign-in.controller';
import EmailStep from './components/EmailStep';
import styles from './sign-in.module.css';

export default function SignInScreen() {
  const { t, step, isSending, submitEmail } = container.resolve<SignInControllerInterface>('signInController');

  return (
    <main className={styles.page}>
      {step === 'email' && <EmailStep t={t} isSending={isSending} onSubmit={submitEmail} />}
    </main>
  );
}
```

Showing one section per state (`step === …`) is prop passing, not logic; anything more goes in the controller.

## Section

```tsx
// src/presentation/pages/Auth/SignIn/components/EmailStep/index.tsx
import type { TFunction } from 'i18next';
import styles from './email-step.module.css';

interface EmailStepProps {
  t: TFunction;
  isSending: boolean;
  onSubmit: (email: string) => void;
}

export default function EmailStep({ t, isSending, onSubmit }: EmailStepProps) {
  return (
    <section className={styles.step} aria-labelledby="sign-in-title">
      <h1 id="sign-in-title" className={styles.title}>{t('sign_in_title')}</h1>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(String(new FormData(e.currentTarget).get('email') ?? ''));
        }}
      >
        <label className={styles.label} htmlFor="email">{t('common_email')}</label>
        <input className={styles.input} id="email" name="email" type="email" autoComplete="email" required />
        <button className={styles.button} type="submit" disabled={isSending}>{t('sign_in_send_code')}</button>
      </form>
    </section>
  );
}
```

## CSS module

```css
/* email-step.module.css */
@reference "../../../../../../styles/app.css";

.title {
  @apply font-display text-ink;
  font-size: clamp(56px, 9vw, 128px);
  font-stretch: 75%;
  line-height: 0.84;
}

.button {
  @apply min-h-14 border-[2.5px] border-ink bg-ink px-7 font-display text-paper;
  box-shadow: 4px 4px 0 var(--color-pink);
  transition: transform 90ms linear, box-shadow 90ms linear;

  &:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--color-pink); }
  &:focus-visible { @apply outline-3 outline-offset-3 outline-blue; }
  &:disabled { @apply cursor-not-allowed border-ink-3 bg-paper-2 text-ink-3; box-shadow: none; }
}
```

Count the `../` from the module to `src/styles/app.css` exactly.

## Translations

Add every key to `src/translation/locale/id.json` and `en.json` (flat `snake_case`, same keys). Include one key per
error code the screen can show.

## Tests

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EmailStep from '../index';

describe('EmailStep', () => {
  it('submits the typed email', async () => {
    const onSubmit = vi.fn();
    render(<EmailStep t={((k: string) => k) as never} isSending={false} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('common_email'), 'nadia@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: 'sign_in_send_code' }));
    expect(onSubmit).toHaveBeenCalledWith('nadia@gmail.com');
  });
});
```

Page shell test: `vi.mock('@infrastructure/di/container')`, return a fake controller interface, assert sections render.
