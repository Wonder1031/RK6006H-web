# RK6006H Web 上位机

基于 **Web Bluetooth + Modbus RTU** 的 Riden RK6006H 直流电源浏览器上位机。
零后端、零安装——Chrome / Edge 打开即用。

> 协议依据：[`../RK6006H_Bluetooth_Protocol_Analysis.md`](../RK6006H_Bluetooth_Protocol_Analysis.md)
> 实现规划：[`../WebConsole_Implementation_Plan.md`](../WebConsole_Implementation_Plan.md)

## 功能

- 🔵 **蓝牙直连**：Web Bluetooth API 直连 `ffe0/ffe1` 透传 UART，无需驱动
- 📊 **实时监测**：电压 / 电流 / 功率仪表 + 滚动趋势曲线（ECharts）
- 🎛️ **控制**：输出开关、V/I 设定、预设组 M0~M2（FC06 / FC10）
- 🛡️ **保护设置**：OVP / OCP / OAH / OPH / 超时 读出
- 🧾 **报文控制台**：TX/RX 十六进制 + CRC 校验状态 + CSV 导出
- 🔁 **自动重连**：意外断连指数退避重连（用户主动断开不重连）
- 🧪 **Mock 设备**：无硬件时可勾选离线演示
- ⚙️ **持久化**：解码模式 / Mock 偏好存 localStorage

## 快速开始

```bash
npm install
npm run dev      # 浏览器打开 http://127.0.0.1:5173
```

> Web Bluetooth 需安全上下文：`127.0.0.1` / `localhost` 或 HTTPS。

### 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | 运行单测（vitest） |
| `npm run typecheck` | 仅类型检查 |

## 部署（GitHub Pages，自动）

推送到 `main` 分支后，[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 会自动构建并部署到：

**https://wonder1031.github.io/RK6006H-web/**

### 一次性启用（只需做一次）

1. 打开仓库 → **Settings** → **Pages**
2. **Build and deployment** → **Source** 选择 **`GitHub Actions`**（不是 Deploy from a branch）
3. 保存。下次推 `main` 即自动部署

### 手动触发

仓库 → **Actions** → **Deploy to GitHub Pages** → **Run workflow**

### 子路径说明

本仓库名为 `RK6006H-web`（非 `<user>.github.io`），Pages 挂在子路径 `/RK6006H-web/`。
Workflow 通过 [`actions/configure-pages`](https://github.com/actions/configure-pages) 自动检测子路径并以 `--base` 传给 Vite，
资源/Service Worker/manifest 路径都会自动改写，无需手动维护。

### 访问约束

- **必须 Chromium 内核浏览器**（Chrome / Edge / Opera / Brave）——Web Bluetooth API 仅它们实现
- **必须 HTTPS**（Pages 自带 HTTPS，已满足）——HTTP 下 `navigator.bluetooth` 不存在
- **需 PC 蓝牙**：手机 Chrome 也不完全支持 Web Bluetooth

## 架构

```
L4 表现层  React 组件（Dashboard / Console / 控制面板）
L3 应用层  Zustand Store（状态机 + 轮询 + 重连）
L2 协议层  Modbus 帧 + CRC-16 + 寄存器编解码   ← 68 单测覆盖
L1 传输层  BleAdapter + 串行队列 + 通知重组
L0 平台层  Web Bluetooth / Mock / (可扩展 WebSocket 桥接)
```

关键设计：
- **请求串行化**：写与通知共用 `ffe1`、无帧分隔，传输层用 Promise 链保证一问一答。
- **通知重组**：按 `expectedFrameLength` 累积判定完整帧，兼容 BLE 分片。
- **CRC 强校验**：每帧响应校验，错误仍解析但标记 `crcOk=false`。

## 目录结构

```
src/
├── ble/          BleAdapter 接口 + WebBluetooth / Mock 实现
├── modbus/       crc16 / frames / transport（+ 单测）
├── registers/    map / scaling / decode / encode（+ 单测）
├── store/        deviceStore（Zustand）（+ 集成测试）
├── components/   Dashboard / Gauge / Console / TrendChart / 控制面板
├── config/       常量（UUID / 轮询 / 寄存器）
├── types/        modbus / device 类型
└── utils/        hex / format / storage
```

## ⚠️ 已知限制

详见协议文档 §7.6 / §12（2026-06-27 真机写入验证）：

- ✅ **已确认**：设定/实测/输出地址、标准 Riden 缩放（V/100、I/1000、温度/100）、FC06 写入路径（输出开关 + 电压设定，面板双向对照通过）。
- ⚠️ **实测电流/功率**（`0x000B`/`0x000C`）：空载未验证缩放，功率当前由 V×I 计算得。
- ⚠️ **预设组 `0x0030`**（FC10）：地址来自静态提取，未真机验证。
- ⚠️ **保护阈值**：`0x0037~0x0040` 的工程值含义待确认，当前仅显示原始读数。
- 写入操作在真机模式会二次确认；Mock 模式无确认。

## 真机复测脚本

`../verify_protocol.py`（Bleak）可独立验证设备寄存器与 CRC，详见协议文档 §7.5。
