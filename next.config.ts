import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export: `next build` writes plain HTML/CSS/JS to `out/`, served from S3 + CloudFront (TRD §2).
  // Cache Components and Partial Prefetching need a Next.js server, so they stay off in export mode.
  output: 'export',
  // next/image has no optimizer in export mode: serve images as-is (sized, WebP/AVIF) from public/.
  images: { unoptimized: true },
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    root: __dirname,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
