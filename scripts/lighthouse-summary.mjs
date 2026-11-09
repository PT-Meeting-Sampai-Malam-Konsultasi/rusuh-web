// Prints a Markdown table of the Lighthouse CI scores (median of the runs per page) for the job summary.
// Reads .lighthouseci/lhr-*.json from the Lighthouse CI action and the report links from LINKS (its `links` output).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.lighthouseci';
// Same thresholds as the warnings in lighthouserc.json; SEO is shown only (previews are noindex).
const CATEGORIES = [
  ['performance', 'Performance', 85],
  ['accessibility', 'Accessibility', 95],
  ['best-practices', 'Best practices', 95],
  ['seo', 'SEO', null],
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const runs = readdirSync(DIR)
  .filter((file) => /^lhr-.*\.json$/.test(file))
  .map((file) => JSON.parse(readFileSync(join(DIR, file), 'utf8')));

const byUrl = new Map();
for (const lhr of runs) {
  const list = byUrl.get(lhr.requestedUrl) ?? [];
  list.push(lhr);
  byUrl.set(lhr.requestedUrl, list);
}

let links = {};
try {
  links = JSON.parse(process.env.LINKS || '{}');
} catch {
  links = {};
}

const cell = (score, min) => (min !== null && score < min ? `⚠️ ${score}` : `${score}`);

const lines = [
  '## Lighthouse (mobile, median of 3 runs)',
  '',
  `| Page | ${CATEGORIES.map(([, label]) => label).join(' | ')} | Report |`,
  `| --- | ${CATEGORIES.map(() => '---:').join(' | ')} | --- |`,
];
for (const [url, list] of byUrl) {
  const scores = CATEGORIES.map(([id, , min]) => {
    const score = median(list.map((lhr) => Math.round((lhr.categories[id]?.score ?? 0) * 100)));
    return cell(score, min);
  });
  const path = new URL(url).pathname + new URL(url).search;
  const report = links[url] ? `[open](${links[url]})` : '';
  lines.push(`| \`${path}\` | ${scores.join(' | ')} | ${report} |`);
}
if (byUrl.size === 0) lines.push('', 'No Lighthouse results found.');
lines.push('', '⚠️ = below the target in `lighthouserc.json` (a warning, not a failure). Previews run on mock data.');
process.stdout.write(`${lines.join('\n')}\n`);
