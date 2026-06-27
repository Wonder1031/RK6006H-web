import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 配置 —— E2E 自测。
 *
 * 通过 vite dev server 提供应用；测试在 Mock BLE 模式下运行（无需真机/蓝牙），
 * 覆盖连接、遥测显示、输出开关、报文控制台、断开等完整流程。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 共享设备状态，串行更稳定
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
