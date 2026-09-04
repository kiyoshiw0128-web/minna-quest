/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Worker が dist をそのまま静的配信するので、サブパスに置かない。
  base: '/',
  plugins: [react()],
  build: {
    // apps/worker 側が参照する出力先。動かすと配信設定と食い違う。
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
