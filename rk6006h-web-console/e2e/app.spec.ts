/**
 * RK6006H Web 上位机 E2E 自测（Mock BLE 模式）。
 *
 * 不依赖真实蓝牙——勾选「Mock 设备」后用 MockBleAdapter 驱动整个应用流程。
 * 覆盖：连接 → 遥测显示 → 输出开关 → 报文控制台 → 设定写入 → 断开。
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('连接 Mock 设备后显示遥测与状态', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();

  // 状态变为已连接
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });
  // 设备名
  await expect(page.getByText('RK6006-MOCK')).toBeVisible();
  // 仪表显示 Mock 初值：电压实测 11.98V、设定 12.00V
  await expect(page.getByText('设定电压').locator('..').getByText(/12\.00/)).toBeVisible();
});

test('输出开关可切换', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  const sw = page.getByRole('button', { name: /输出已开启|输出已关闭/ });
  await expect(sw).toBeVisible();
  // 初始 Mock 输出为 ON
  await expect(sw).toContainText('已开启');
  await sw.click();
  await expect(sw).toContainText('已关闭');
});

test('报文控制台记录 TX/RX', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: '报文控制台' }).click();
  // 至少有一条 TX 和 RX
  await expect(page.locator('text=TX').first()).toBeVisible();
  await expect(page.locator('text=RX').first()).toBeVisible();
  await expect(page.locator('text=CRC✓').first()).toBeVisible();
});

test('设定电压写入并刷新', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  // 用高级控件设定电压（Mock 模式无 confirm 弹窗）
  const vInput = page.getByTestId('setpoint-voltage').locator('input[type=number]');
  await vInput.fill('20');
  await page.getByRole('button', { name: '应用设定' }).click();

  // 设定电压应刷新为 20.00 V
  await expect(page.getByText('设定电压').locator('..').getByText(/20\.00/)).toBeVisible({
    timeout: 3000,
  });
});

test('预设组快捷模板与滑块可调', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: '预设组' }).click();
  // 快捷模板「24V/3A」填充后，M0 电压滑块值应为 24
  await page.getByRole('button', { name: '24V/3A' }).click();
  await expect(page.getByTestId('preset-0-voltage').locator('input[type=number]')).toHaveValue(
    '24',
  );
});

test('断开后回到未连接占位', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: '断开' }).click();
  await expect(page.getByText('请先连接设备')).toBeVisible();
});
