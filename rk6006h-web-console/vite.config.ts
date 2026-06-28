/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA：预缓存 app shell 实现离线打开（升级方案 P1-1）。
    // 注意：Web Bluetooth 重连仍需在线 + 用户手势，离线仅能查看已加载界面。
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "RK6006H Web 上位机",
        short_name: "RK6006H",
        description:
          "RK6006H 直流电源 Web 上位机（Web Bluetooth + Modbus RTU）",
        theme_color: "#3b82f6",
        background_color: "#0f1419",
        display: "standalone",
        orientation: "any",
        lang: "zh-CN",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      },
      // dev 下不注入 SW，避免影响 HMR / E2E；preview / 生产构建生效
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Web Bluetooth 需在 HTTPS 或 localhost 下运行；127.0.0.1 属于安全上下文。
  },
  build: {
    rollupOptions: {
      output: {
        // 拆分大体积依赖，改善缓存命中（函数形式，vite 8 / rolldown 要求）
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            if (id.includes("echarts")) return "echarts";
            if (id.includes("react") || id.includes("scheduler"))
              return "react";
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/modbus/**", "src/registers/**"],
    },
  },
});
