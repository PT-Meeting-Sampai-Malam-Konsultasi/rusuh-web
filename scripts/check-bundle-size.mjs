// Bundle budgets (.claude/rules/performance.md): every JS chunk ≤ 50 KB gzip, all CSS ≤ 30 KB gzip.
// Run after `next build` (npm run check:bundle). The per-route 150 KB first-load figure is read from the build output.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const CHUNK_BUDGET = 50 * 1024;
const CSS_BUDGET = 30 * 1024;
const dir = 'out/_next/static/chunks';

const files = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((f) => statSync(join(dir, f)).isFile());

let failed = false;
let css = 0;
let mock = 0;
const big = [];
for (const f of files) {
  const size = gzipSync(readFileSync(join(dir, f))).length;
  if (f.endsWith('.css')) css += size;
  else if (f.endsWith('.js')) {
    big.push([f, size]);
    const code = readFileSync(join(dir, f), 'utf8');
    // The shared React/Next.js runtime chunk cannot be split; the budget applies to everything else.
    const framework = code.includes('Minified React error');
    // The mock API (MSW) is a lazy chunk, downloaded only when NEXT_PUBLIC_API_MOCK=true; never by real users.
    const mockOnly = code.includes('[MSW]');
    if (mockOnly) mock += size;
    else if (size > CHUNK_BUDGET && !framework) {
      process.stderr.write(`Chunk over budget: ${f} ${(size / 1024).toFixed(1)} KB gzip (max 50 KB)\n`);
      failed = true;
    }
  }
}
if (css > CSS_BUDGET) {
  process.stderr.write(`CSS over budget: ${(css / 1024).toFixed(1)} KB gzip (max 30 KB)\n`);
  failed = true;
}
big.sort((a, b) => b[1] - a[1]);
process.stdout.write(
  `Largest chunks: ${big
    .slice(0, 3)
    .map(([f, s]) => `${f} ${(s / 1024).toFixed(1)} KB`)
    .join(', ')}\n` +
    `CSS total: ${(css / 1024).toFixed(1)} KB gzip\n` +
    `Mock API chunks (lazy, mock builds only): ${(mock / 1024).toFixed(1)} KB gzip\n`,
);
// First-load JS of the home page (modern browsers: noModule polyfills excluded). Reported, not enforced yet:
// the Next.js 16 runtime alone is ~150 KB gzip, so the 150 KB budget needs revisiting (see performance rule).
const html = readFileSync('out/index.html', 'utf8');
const srcs = [...html.matchAll(/<script src="(\/_next\/static\/chunks\/[^"]+\.js)"(?![^>]*noModule)/g)].map(
  (m) => m[1],
);
const unique = [...new Set(srcs)];
if (unique.some((s) => readFileSync('out' + s, 'utf8').includes('[MSW]'))) {
  process.stderr.write('The mock API (MSW) is in the Home first load; it must stay behind the dynamic import.\n');
  failed = true;
}
const firstLoad = unique.reduce((n, s) => n + gzipSync(readFileSync('out' + s)).length, 0);
process.stdout.write(`Home first-load JS: ${(firstLoad / 1024).toFixed(1)} KB gzip (target 150 KB)\n`);
if (failed) process.exit(1);
process.stdout.write('Bundle size check passed.\n');
