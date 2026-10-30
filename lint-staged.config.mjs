// Runs on staged files only (see .claude/rules/git-conventions.md).
export default {
  '*.{ts,tsx,js,mjs}': ['eslint --fix', 'prettier --write'],
  '*.css': ['prettier --write'], // stylelint --fix joins when Stylelint is scaffolded
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
