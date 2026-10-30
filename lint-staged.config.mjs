// Runs on staged files only (see .claude/rules/git-conventions.md).
const config = {
  '*.{ts,tsx,js,mjs}': ['eslint --fix', 'prettier --write'],
  '*.css': ['stylelint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};

export default config;
