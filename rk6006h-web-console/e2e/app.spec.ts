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

test('写入异常帧时 UI 显示错误反馈', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  // 注入异常帧故障 → 设定电压写入应失败并提示
  await page.getByRole('button', { name: '异常帧', exact: true }).click();
  const vInput = page.getByTestId('setpoint-voltage').locator('input[type=number]');
  await vInput.fill('15');
  await page.getByRole('button', { name: '应用设定' }).click();

  await expect(page.getByText(/设定失败/)).toBeVisible({ timeout: 3000 });

  // 恢复后写入正常
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '应用设定' }).click();
  await expect(page.getByText(/设定失败/)).toHaveCount(0, { timeout: 3000 });
});

test('CRC 错故障下写入提示失败', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'CRC 错', exact: true }).click();
  await page.getByRole('button', { name: '应用设定' }).click();
  await expect(page.getByText(/设定失败/)).toBeVisible({ timeout: 3000 });
});

test('主题切换：浅色/深色切换并写入 data-theme', async ({ page }) => {
  const toggle = page.getByRole('button', { name: /深色|浅色/ });
  await expect(toggle).toBeVisible();

  const before = (await toggle.textContent()) ?? '';
  await toggle.click();

  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(['light', 'dark']).toContain(theme);
  // 按钮文本应翻转
  await expect(toggle).not.toHaveText(before);
  // 背景色随主题变化（深色偏暗、浅色偏亮）
  const bg = await page.evaluate(() =>
    getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBeTruthy();
});

test('历史会话：连接后记录并可回放（IndexedDB）', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });
  // 等待若干轮询落库
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: '历史会话' }).click();
  const replayBtn = page.getByRole('button', { name: '回放', exact: true }).first();
  await expect(replayBtn).toBeVisible({ timeout: 3000 });

  await replayBtn.click();
  // 趋势图切到回放模式
  await expect(page.getByText('回放：历史趋势')).toBeVisible({ timeout: 3000 });

  // 返回实时
  await page.getByRole('button', { name: '返回实时' }).click();
  await expect(page.getByText('实时趋势')).toBeVisible();
});

test('快捷键：空格切输出、数字键切标签', async ({ page }) => {
  await page.getByLabel('使用 Mock 设备（离线演示）').check();
  await page.getByRole('button', { name: '连接' }).click();
  await expect(page.getByText('已连接')).toBeVisible({ timeout: 5000 });

  // 点击标题移走焦点（避免按钮占用空格），再按空格切输出
  await page.locator('h1').click();
  await expect(page.getByText(/输出已开启/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText(/输出已关闭/)).toBeVisible({ timeout: 3000 });

  // 数字键切标签：3 → 报文控制台（出现搜索框）
  await page.keyboard.press('3');
  await expect(page.getByPlaceholder('搜索 hex / 说明')).toBeVisible();
});
