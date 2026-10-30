// Conventional commits with the ticket in the subject: `feat(login): [FR-06] add otp code step`.
// Rules: .claude/rules/git-conventions.md
const EXEMPT = ['chore', 'ci', 'docs', 'style', 'revert'];
// Ticket = TOR code, or a sub-issue code: platform W (web) / M (mobile) / B (backend) + sequence.
const TICKETS = /^((\[(FR|NFR|BR)-\d{2}(-(W|M|B)\d+)?\])+) \S/;

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
            'start the subject with the ticket, e.g. "[FR-06-W1] add otp code step" (FR-xx or sub-issue FR-xx-W1 / -M1 / -B1; several: [FR-13-W1][FR-15-W1])',
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
