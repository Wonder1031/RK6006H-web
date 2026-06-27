/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Web Bluetooth 需在 HTTPS 或 localhost 下运行；127.0.0.1 属于安全上下文。
  },
  build: {
    rollupOptions: {
      output: {
        // 拆分大体积依赖，改善缓存命中
        manualChunks: {
          react: ['react', 'react-dom'],
          echarts: ['echarts'],
          vendor: ['zustand'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/modbus/**', 'src/registers/**'],
    },
  },
});
