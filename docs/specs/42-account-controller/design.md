# Design Document

```ts
export interface AccountControllerInterface {
  t: TFunction;
  status: 'loading' | 'ready' | 'error';
  profile: { name: string; email: string } | null;
  nameForm: {
    editing: boolean;
    field: UseFormRegisterReturn<'fullName'>;
    error: string;
    saving: boolean;
    edit: () => void;
    cancel: () => void;
    onSubmit: () => void;
  };
  signOut: () => void;
  signingOut: boolean;
  errorMessage: string;
  retry: () => void;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}
```

Deps: `accountService`, `signOutUseCase`, `analyticsAdapter`, `storage`, `ERROR_CODE_MAP`, `useTranslation`,
`useQueryTanstack`, `useMutationTanstack`, `useQueryClientTanstack`, `useRouterNext`, `useLoading`, `usePopupError`.

## Layer Constraints

From `.claude/rules/controller.md`:

- `toggleLoading()` in **all three** mutation paths: `mutationFn`, `onSuccess`, `onError`. A missing one leaves the
  overlay stuck.
- `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
