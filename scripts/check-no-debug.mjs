import { execSync } from 'node:child_process';

const PATTERNS = [
  { re: /console\.(log|debug|info|warn|error|trace|dir|table|group|groupEnd|time|timeEnd)\s*\(/, label: 'console.*()' },
  { re: /\bdebugger\b/, label: 'debugger' },
  { re: /\bconsole\.assert\s*\(/, label: 'console.assert()' },
];
const staged = execSync('git diff --cached --name-only --diff-filter=ACM')
  .toString()
  .trim()
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !f.startsWith('scripts/'));

let failed = false;
for (const file of staged) {
  let content;
  try {
    content = execSync(`git show :${file}`).toString();
  } catch {
    continue;
  }
  content.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    for (const { re, label } of PATTERNS) {
      if (re.test(line)) {
        process.stderr.write(`Debug code [${label}] in ${file}:${i + 1}\n`);
        failed = true;
      }
    }
  });
}
if (failed) {
  process.stderr.write('Pre-commit blocked: remove debug statements.\n');
  process.exit(1);
}
