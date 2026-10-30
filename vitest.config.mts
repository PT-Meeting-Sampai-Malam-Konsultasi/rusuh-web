import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Vite resolves the tsconfig path aliases natively.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Route files are thin server components (covered by the build); types and test files hold no logic.
      exclude: ['src/app/**', 'src/**/*.d.ts', 'src/**/__tests__/**', 'src/**/*.types.ts'],
      thresholds: { branches: 85, functions: 85, lines: 85, statements: 85 },
    },
  },
});
