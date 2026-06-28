import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/** PWA 图标生成配置：从 public/favicon.svg 生成 192/512 + maskable + apple touch。 */
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
