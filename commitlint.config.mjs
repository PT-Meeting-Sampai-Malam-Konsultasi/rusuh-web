// Conventional commits with the ticket in the subject: `feat(login): [FR-06] add otp code step`.
// Rules: .claude/rules/git-conventions.md
const EXEMPT = ['chore', 'ci', 'docs', 'style', 'revert'];
const TICKETS = /^((\[(FR|NFR|BR)-\d{2}\])+) \S/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-ticket': ({ type, subject }) => {
          const s = subject ?? '';
          if (TICKETS.test(s)) return [true];
          if (EXEMPT.includes(type ?? '') && !s.startsWith('[')) return [true];
          return [
            false,
            'start the subject with the ticket, e.g. "[FR-06] add otp code step" (FR-xx, NFR-xx, BR-xx; several: [FR-13][FR-15])',
          ];
        },
      },
    },
  ],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      [
        'home',
        'queue',
        'login',
        'order',
        'payment',
        'ticket',
        'account',
        'scaffold',
        'deps',
        'ci',
        'steering',
        'i18n',
        'style',
        'docs',
      ],
    ],
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'style', 'chore', 'ci', 'revert']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'subject-ticket': [2, 'always'],
  },
};
