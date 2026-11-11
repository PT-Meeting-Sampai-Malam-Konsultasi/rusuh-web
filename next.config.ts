import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export: `next build` writes plain HTML/CSS/JS to `out/`, served from S3 + CloudFront (TRD §2).
  // Cache Components and Partial Prefetching need a Next.js server, so they stay off in export mode.
  output: 'export',
  // next/image has no optimizer in export mode: serve images as-is (sized, WebP/AVIF) from public/.
  images: { unoptimized: true },
  turbopack: {
    root: __dirname,
    // Tailwind runs on every CSS file. CSS Modules must stay modules (scoped class names), so they get their own
    // rule; the generator's single '*.css' → '*.css' rule turned them into plain global CSS.
    rules: {
      '*.css': [
        {
          condition: { path: /\.module\.css$/ },
          loaders: ['@tailwindcss/turbopack'],
          as: '*.module.css',
        },
        {
          condition: { not: { path: /\.module\.css$/ } },
          loaders: ['@tailwindcss/turbopack'],
          as: '*.css',
        },
      ],
    },
  },
};

export default nextConfig;
