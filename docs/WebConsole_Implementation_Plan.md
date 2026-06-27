# RK6006H Web 上位机实现规划

> **文档版本**：1.0
> **规划日期**：2026-06-27
> **依据**：`RK6006H_Bluetooth_Protocol_Analysis.md`（协议 100% 已验证）
> **目标平台**：Windows 11 / Chrome 或 Edge 浏览器
> **协议要点**：BLE 透传 UART（`ffe0`/`ffe1`）+ 标准 Modbus RTU（从机 `0x01`，FC 03/06/10，CRC-16/MODBUS）

---

## 目录

- [1. 目标与范围](#1-目标与范围)
- [2. 架构决策](#2-架构决策)
- [3. 技术栈选型](#3-技术栈选型)
- [4. 关键技术风险与对策](#4-关键技术风险与对策)
- [5. 分层模块设计](#5-分层模块设计)
- [6. 项目结构](#6-项目结构)
- [7. 寄存器映射与解码策略](#7-寄存器映射与解码策略)
- [8. 通信时序与并发控制](#8-通信时序与并发控制)
- [9. UI 功能清单](#9-ui-功能清单)
- [10. 分阶段实施计划](#10-分阶段实施计划)
- [11. 验收标准与测试](#11-验收标准与测试)
- [12. 待确认项](#12-待确认项)

---

## 1. 目标与范围

### 1.1 目标
构建一个**纯浏览器**驱动的 RK6006H 直流电源上位机，通过蓝牙直连设备，实现：

- 实时监测（电压 / 电流 / 功率 / 能量 / 温度）
- 输出开关控制
- 电压 / 电流设定
- 保护阈值配置（OVP / OCP / OAH / OPH）
- 预设组管理（M0~M2）
- 实时曲线 + 数据导出
- Modbus 报文调试控制台

### 1.2 范围边界
| 范围内 | 范围外 |
|--------|--------|
| Web Bluetooth 直连（Chrome/Edge） | Firefox / iOS Safari（不支持 Web Bluetooth） |
| 单设备连接（BLE 仅支持 1 路） | 多设备同步管理 |
| 本地运行（localhost / HTTPS） | 云端部署、远程控制 |
| 配置持久化（localStorage） | 用户账号 / 服务端存储 |

---

## 2. 架构决策

### 2.1 三种候选架构对比

| 方案 | 描述 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| **A. 纯 Web Bluetooth** ⭐推荐 | 浏览器通过 `navigator.bluetooth` 直连 BLE | 零安装、无后端、跨平台、最轻量 | 仅 Chromium 内核浏览器；需 HTTPS 或 localhost | **本项目主选** |
| B. Web + 本地桥接 | 浏览器 ↔ WebSocket ↔ 本地 Python(Bleak)/Node(noble) 桥 | 兼容所有浏览器；可复用现有 `ble_*.py` | 需额外运行本地服务；部署复杂 | 浏览器不支持 Web Bluetooth 时 |
| C. Electron 封装 | Web UI 打包为桌面应用，内嵌原生 BLE | 体验统一、可离线分发 | 体积大、维护成本高 | 需要正式产品化分发时 |

### 2.2 推荐：方案 A（纯 Web Bluetooth）

**理由**：
1. 协议已 100% 验证，Web Bluetooth 的 GATT 能力完全覆盖需求（connect / write / notify）。
2. 用户环境为 Windows 11 + Chrome/Edge，原生支持 Web Bluetooth。
3. 协议文档第 11 节已有 Bleak 脚本，若日后需 Firefox 兼容，可平滑切换到方案 B（桥接层接口预留）。

**架构图**：
```
┌─────────────────────────────────────────────────┐
│                Browser (Chrome/Edge)            │
│  ┌───────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ React UI  │→ │ 设备状态  │→ │ Modbus 协议层 │ │
│  │ Dashboard │  │  Store   │  │ CRC/帧/队列   │ │
│  └───────────┘  └──────────┘  └──────┬───────┘ │
│                                      │          │
│                            ┌─────────▼────────┐ │
│                            │ Web Bluetooth    │ │
│                            │ Adapter          │ │
│                            │ (navigator.bluetooth)│
│                            └─────────┬────────┘ │
└──────────────────────────────────────┼──────────┘
                                       │ BLE GATT
                              ┌────────▼────────┐
                              │  RK6006H 设备    │
                              │  ffe0 / ffe1    │
                              └─────────────────┘
```

> **预留**：将 BLE 访问抽象为 `BleAdapter` 接口，方案 A 用 Web Bluetooth 实现；若切换方案 B，仅需替换为 WebSocket 实现同一接口，上层零改动。

---

## 3. 技术栈选型

| 层 | 选型 | 理由 |
|----|------|------|
| 构建工具 | **Vite 5** | 极速 HMR、原生 TS、零配置 |
| 框架 | **React 18 + TypeScript** | 组件化、生态丰富、类型安全 |
| 状态管理 | **Zustand** | 轻量、无样板代码、适合设备状态 |
| 图表 | **ECharts**（或 Chart.js） | 实时滚动曲线性能好 |
| 样式 | **Tailwind CSS** + 组件 | 快速构建工业风 UI |
| 测试 | **Vitest** | 单测 CRC / 帧解析 / 解码 |
| BLE 类型 | `@types/web-bluetooth` | Web Bluetooth API 类型声明 |

> 备选：若希望零依赖、零构建，可用 Vanilla JS 单文件实现 MVP；但 Dashboard 类应用推荐 React。

---

## 4. 关键技术风险与对策

| # | 风险 | 影响 | 对策 |
|---|------|------|------|
| R1 | **请求/响应复用同一特征值** `ffe1`，无帧分隔 | 并发请求会串扰 | 请求串行队列：一次只发一帧，等响应或超时再发下一帧（见第 8 节） |
| R2 | **BLE 通知可能分片**（文档称未观察到，但不保证） | 帧不完整导致解析失败 | 接收缓冲区 + 期望长度判定：FC03 响应长度 = `3 + byteCount + 2`；FC06/FC10 = 8 字节；累积到长度后校验 CRC |
| R3 | **缩放系数语义未完全确认**（见协议 §12.2） | 电压/电流显示可能错误 | 系数从设备寄存器动态读取（`0x0008`/`0x0009`）；解码公式做成可配置；UI 提供原始值显示开关 |
| R4 | **BLE 断连**（距离/干扰/超时） | 通信中断 | `ongattserverdisconnected` 监听 + 自动重连策略（指数退避）+ UI 状态提示 |
| R5 | **Web Bluetooth 需用户手势** | 不能自动连接 | 所有连接操作绑定到按钮点击事件 |
| R6 | **写命令风险**（过压/误配置） | 损坏设备或负载 | 设定值前二次确认；保护阈值修改前读取当前值；输出 ON 前检查设定是否合理 |
| R7 | **CRC 校验失败** | 数据可信度 | 每帧响应强制 CRC 校验，失败丢弃 + 计数 + UI 告警 |
| R8 | **requestDevice 过滤** | 找不到设备 | 使用 `namePrefix: 'RK6006'` + `optionalServices: ['ffe0...']` 双保险 |

---

## 5. 分层模块设计

### 5.1 层次划分

```
┌──────────────────────────────────────────────┐
│  L4  表现层 (React Components)                │
├──────────────────────────────────────────────┤
│  L3  应用层 (Store / Hooks / Polling)         │
├──────────────────────────────────────────────┤
│  L2  协议层 (Modbus 帧 + CRC + 寄存器编解码)   │
├──────────────────────────────────────────────┤
│  L1  传输层 (BleAdapter: 连接/读写/通知/队列)   │
├──────────────────────────────────────────────┤
│  L0  平台层 (Web Bluetooth API / WebSocket)    │
└──────────────────────────────────────────────┘
```

### 5.2 L1 — 传输层（`ble/WebBluetoothAdapter.ts`）

**职责**：封装 `navigator.bluetooth`，向上暴露统一 BLE 接口。

**接口**：
```ts
interface BleAdapter {
  requestAndConnect(filters: RequestDeviceFilter): Promise<DeviceInfo>;
  write(data: Uint8Array, withResponse: boolean): Promise<void>;
  onData(cb: (data: Uint8Array) => void): void;       // 订阅 ffe1 notify
  onDisconnect(cb: () => void): void;
  disconnect(): Promise<void>;
  readonly connected: boolean;
}
```

**常量**：
```ts
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHAR_UUID    = '0000ffe1-0000-1000-8000-00805f9b34fb';
const SLAVE_ADDR   = 0x01;
```

### 5.3 L2 — 协议层

#### 5.3.1 CRC-16（`modbus/crc16.ts`）
- 算法：多项式 `0xA001`、初值 `0xFFFF`、低字节在前（与协议 §4.3 一致）。
- 提供 `crc16(bytes): number` 与 `appendCrc(bytes): Uint8Array`。

#### 5.3.2 帧构建/解析（`modbus/frames.ts`）
```ts
buildReadHolding(addr: number, qty: number): Uint8Array;          // FC03
buildWriteSingle(addr: number, value: number): Uint8Array;        // FC06
buildWriteMulti(addr: number, values: number[]): Uint8Array;      // FC10

parseResponse(frame: Uint8Array): ParsedFrame;                     // 解析 + CRC 校验
// 返回: { fc, data, exception?, crcOk, expectedLen }
```

#### 5.3.3 传输队列（`modbus/transport.ts`）
- **核心**：Promise 串行队列 + 响应重组缓冲 + 超时。
- 详见第 8 节。

#### 5.3.4 寄存器编解码（`registers/`）
- `map.ts`：寄存器地址常量（来自协议 §5）。
- `decode.ts`：原始值 → 工程值（带缩放）。
- `encode.ts`：工程值 → 原始值（设定写入用）。

### 5.4 L3 — 应用层

#### 5.4.1 设备状态 Store（`store/deviceStore.ts`，Zustand）
```ts
interface DeviceState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  info: DeviceInfo;        // 序列号、固件版本、系数
  telemetry: Telemetry;    // V/I/P/E/T 实时值
  protection: Protection;  // OVP/OCP/OAH/OPH
  presets: Preset[];       // M0~M2
  log: FrameLogEntry[];    // 报文日志
  // actions...
}
```

#### 5.4.2 Hooks
- `useDevice()`：连接生命周期 + 状态。
- `usePolling(intervalMs)`：周期读 `0x0004 + 38 regs`，更新 telemetry。
- `useLogger()`：报文日志收集（环形缓冲，默认保留 1000 条）。

### 5.5 L4 — 表现层
组件清单见第 9 节。

---

## 6. 项目结构

```
rk6006h-web-console/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config/
│   │   ├── constants.ts          # UUID / 从机地址 / 轮询参数
│   │   └── deviceFilter.ts       # requestDevice 过滤器
│   ├── types/
│   │   ├── modbus.ts             # FC 枚举、ExceptionCode、ParsedFrame
│   │   └── device.ts             # DeviceInfo / Telemetry / Protection / Preset
│   ├── ble/
│   │   ├── BleAdapter.ts         # 接口定义
│   │   ├── WebBluetoothAdapter.ts# Web Bluetooth 实现
│   │   └── __mocks__/            # 模拟设备（开发/测试用）
│   ├── modbus/
│   │   ├── crc16.ts
│   │   ├── frames.ts
│   │   ├── transport.ts          # 串行队列 + 重组
│   │   ├── exceptions.ts
│   │   └── __tests__/
│   │       ├── crc16.test.ts     # 用协议 §7 真机样本校验
│   │       ├── frames.test.ts
│   │       └── transport.test.ts
│   ├── registers/
│   │   ├── map.ts                # 地址常量（§5）
│   │   ├── decode.ts             # 原始 → 工程值
│   │   ├── encode.ts             # 工程值 → 原始
│   │   └── scaling.ts            # 缩放系数逻辑
│   ├── store/
│   │   └── deviceStore.ts
│   ├── hooks/
│   │   ├── useDevice.ts
│   │   ├── usePolling.ts
│   │   └── useLogger.ts
│   ├── components/
│   │   ├── ConnectionPanel.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Gauge.tsx             # V/I/P 仪表
│   │   ├── OutputSwitch.tsx      # 0x0012 ON/OFF
│   │   ├── SetpointControl.tsx   # V/I 设定（FC06 写 0x0010/0x0011）
│   │   ├── ProtectionPanel.tsx   # OVP/OCP/OAH/OPH
│   │   ├── PresetPanel.tsx       # M0~M2（FC10 写 0x0030）
│   │   ├── TrendChart.tsx        # 实时曲线
│   │   ├── Console.tsx           # 报文调试
│   │   └── ui/                   # 通用组件（按钮/弹窗/开关）
│   └── styles/
│       └── global.css
└── docs/
    └── WebConsole_Implementation_Plan.md  ← 本文档
```

---

## 7. 寄存器映射与解码策略

### 7.1 地址常量（2026-06-27 真机写入验证确认，见协议 §7.6）

> ⚠️ 原计划此处基于 §5 推断（含 0x0008/0x0009 误判为系数、设定区误判为 0x0010~0x0019）。
>    真机写入验证已全部纠正，下表为**确认版**（代码 `src/registers/map.ts` 已据此实现）。

```ts
// 标准固定缩放（无"系数"寄存器，原 1200/5978 实为设定值）
export const V_DIVISOR = 100;     // 电压 /100
export const I_DIVISOR = 1000;    // 电流 /1000
export const TEMP_DIVISOR = 100;  // 温度 /100

export const REG = {
  // 系统信息（只读固定）
  MODEL_HIGH:   0x0000,
  FIRMWARE:     0x0002,
  // 设定 / 实测 / 状态（活值，主轮询覆盖）
  V_SETPOINT:   0x0008,   // ★ 电压设定（/100）—— 原 §5.1 误标为"电压系数"
  I_SETPOINT:   0x0009,   // ★ 电流设定（/1000）—— 原 §5.1 误标为"电流系数"
  V_ACTUAL:     0x000a,   // 实测电压（/100）
  I_ACTUAL:     0x000b,   // 实测电流（/1000，待负载验证）
  P_ACTUAL:     0x000c,   // 实测功率（原始；UI 用 V×I 计算）
  TEMPERATURE:  0x000e,   // 温度（/100）
  OUTPUT_ON:    0x0012,   // ★ 输出开关 1=ON/0=OFF（写验证通过）
  // 保护设置区（每项 2 寄存器：threshold + raw）
  OVP_THRESHOLD:0x0037, OVP_RAW: 0x0038,
  OCP_THRESHOLD:0x0039, OCP_RAW: 0x003A,
  OAH_THRESHOLD:0x003B, OAH_RAW: 0x003C,
  OPH_THRESHOLD:0x003D, OPH_RAW: 0x003E,
  OVT_THRESHOLD:0x003F, OVT_RAW: 0x0040,
  PRESET_BASE:  0x0030,   // ⚠️ 预设组（未真机验证）
} as const;

export const POLL = { START: 0x0004, QTY: 38 };  // 主轮询窗口（覆盖 0x0008~0x0012）
```

### 7.2 缩放策略（真机确认，已简化）

~~原计划推测 `0x0008/0x0009` 为缩放系数并提供两种可切换解码模式~~ —— 真机验证表明：
**缩放是标准 Riden 固定编码（V/100、I/1000、温度/100），与设备无关，无系数寄存器。**

代码实现（`scaling.ts`）已简化为固定除数：
```ts
export function toEngineering(raw, divisor) { return raw / divisor; }
export function toRaw(engineering, divisor) { return clampUint16(Math.round(engineering * divisor)); }
```
功率由 `V × I` 计算（比 `0x000C` 原始值可靠）。原 DecodeMode 抽象已移除。

### 7.3 轮询窗口解码（`0x0004` 起 38 寄存器）

```
偏移 0..37 对应 0x0004..0x0029，覆盖全部活值字段：
  [0x0008]=V设定  [0x0009]=I设定  [0x000A]=V实测
  [0x000B]=I实测  [0x000C]=P实测  [0x000E]=温度  [0x0012]=输出
均按 §7.6 确认地址 + 固定缩放解码。
```

---

## 8. 通信时序与并发控制（核心）

### 8.1 串行请求队列

由于写与通知共用 `ffe1`，**必须串行化**：发一帧 → 等响应 → 再发下一帧。

```ts
class ModbusTransport {
  private queue: Array<() => Promise<void>> = [];
  private busy = false;
  private rxBuffer = new Uint8Array(0);
  private pendingResolve?: (frame: Uint8Array) => void;

  constructor(private adapter: BleAdapter, private logger: Logger) {
    this.adapter.onData(chunk => this.onNotify(chunk));
  }

  /** 对外统一入口：发送请求并等待完整响应 */
  async request(req: Uint8Array, expectedLen: number, timeoutMs = 2000): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.pendingResolve = resolve;
        this.rxBuffer = new Uint8Array(0);
        await this.adapter.write(req, true);
        // 超时守护
        const timer = setTimeout(() => {
          this.pendingResolve = undefined;
          reject(new Error('Modbus 超时'));
          this.next();
        }, timeoutMs);
        this.pendingTimer = timer;
      };
      this.enqueue(task, reject);
    });
  }

  private onNotify(chunk: Uint8Array) {
    this.rxBuffer = concat(this.rxBuffer, chunk);
    const need = this.expectedLen;          // 由当前请求类型预计算
    if (this.rxBuffer.length >= need) {
      clearTimeout(this.pendingTimer);
      const frame = this.rxBuffer.slice(0, need);
      this.pendingResolve?.(frame);
      this.pendingResolve = undefined;
      this.next();
    }
  }

  private enqueue(task, reject) {
    this.queue.push(task);
    if (!this.busy) this.next();
  }
  private next() {
    const t = this.queue.shift();
    if (t) { this.busy = true; t().catch(()=>{}).finally(()=> this.busy = false); }
    else   { this.busy = false; }
  }
}
```

### 8.2 期望响应长度

| 功能码 | 请求 | 响应长度（含 CRC） |
|--------|------|---------------------|
| FC03 | 读 N 寄存器 | `3 + 2*N + 2`（slave, fc, byteCount, data, crc） |
| FC06 | 写单寄存器 | `8`（固定回显） |
| FC10 | 写多寄存器 | `8`（固定） |
| 异常 | FC\|0x80 | `5`（slave, fc\|0x80, excCode, crc） |

> 实现时：先读 `frame[1]`（FC），若 `& 0x80` 则异常帧（5 字节）；否则按 FC 计算期望长度。FC03 需先收齐 3 字节拿到 `byteCount` 才能确定总长，故采用「最小长度判定 + 动态扩展」。

### 8.3 轮询时序

```
连接成功 → 读 0x0000..0x000A（系统信息+系数，一次性）
        → 启动轮询：每 500ms~1s 读 0x0004+38（主状态）
控制命令 → 插队到队列（写操作优先于下一次轮询读）
断连     → 停止轮询，标记状态，等待重连
```

**节流**：控制类写命令（如拖动设定值滑块）做防抖（debounce 300ms），避免队列堆积。

---

## 9. UI 功能清单

### 9.1 页面布局（单页应用，工业仪表风格）

```
┌─────────────────────────────────────────────────────┐
│  顶栏: [连接设备]  状态: ●已连接  RSSI  ⚙设置       │
├──────────────┬──────────────────────────────────────┤
│              │  ┌──────┐ ┌──────┐ ┌──────┐          │
│  控制面板    │  │  V   │ │  I   │ │  P   │  仪表    │
│              │  │12.00V│ │2.000A│ │24.0W │          │
│  [输出 ON]   │  └──────┘ └──────┘ └──────┘          │
│              │                                      │
│  设定电压    │  ┌────────────────────────────┐      │
│  ──●──────  │  │   实时趋势曲线 (V/I/P)      │      │
│              │  │                            │      │
│  设定电流    │  └────────────────────────────┘      │
│  ──●──────  │                                      │
│              │  能量: 0.123 kWh   温度: 27.9℃      │
├──────────────┴──────────────────────────────────────┤
│  Tab: [保护设置] [预设组 M0~M2] [报文控制台] [日志] │
└─────────────────────────────────────────────────────┘
```

### 9.2 组件 → 功能 → 协议映射

| 组件 | 功能 | 协议命令 |
|------|------|----------|
| ConnectionPanel | 扫描/连接/断开/重连 | Web Bluetooth `requestDevice` |
| Gauge ×3 | 实时 V/I/P 显示 | 轮询 `01 03 00 04 00 26` |
| OutputSwitch | 输出开关 | FC06 写 `0x0012` = 0/1 |
| SetpointControl | 设定电压/电流 | FC06 写 `0x0010`/`0x0011` |
| ProtectionPanel | OVP/OCP/OAH/OPH/OVT | 读 `0x0037+10`；写待确认 raw 含义 |
| PresetPanel | M0~M2 预设组 | FC10 写 `0x0030` 共 6 寄存器 |
| TrendChart | 滚动曲线（60s 窗口） | 轮询数据采样 |
| Console | TX/RX 十六进制 + CRC 校验结果 | 全局报文日志 |
| ExportButton | 导出 CSV | 本地数据缓存 |
| SettingsModal | 解码模式切换 / 原始值显示 / 轮询频率 | localStorage |

### 9.3 安全 UX
- 输出 ON 前：若设定电压 > 阈值（如 30V），弹窗二次确认。
- 修改保护阈值：先读当前值显示，修改后确认写回。
- 危险写操作（设定值）：滑块松开后才发送（change 事件而非 input）。

---

## 10. 分阶段实施计划

### Phase 0 — 基础设施（0.5 天）
- [ ] Vite + React + TS 脚手架
- [ ] Tailwind 配置
- [ ] `@types/web-bluetooth` 引入
- [ ] 常量配置（UUID / 从机地址 / 寄存器表）
- [ ] Vitest 测试环境

### Phase 1 — 协议层（1 天）⭐ 可独立验证
- [ ] `crc16.ts` 实现 + 单测（用协议 §7 真机样本：`01 03 00 00 00 04` → `44 09` 等）
- [ ] `frames.ts` 构建器（FC03/06/10）+ 解析器（含异常帧）
- [ ] `registers/map.ts` + `decode.ts` + `encode.ts`
- [ ] 全部用协议 §7 实测样本做单测断言
- **交付物**：协议层 100% 单测通过，不依赖真机。

### Phase 2 — 传输层（1 天）
- [ ] `WebBluetoothAdapter.ts`（连接/写/通知/断连回调）
- [ ] `ModbusTransport`（串行队列 + 重组 + 超时）
- [ ] Mock 设备（用于无真机时的开发，回放协议 §7 样本）
- [ ] 真机联调：扫描 → 连接 → 读 `0x0004+38` → 控制台显示解析结果

### Phase 3 — 核心应用（1 天）
- [ ] Zustand store + 设备状态机
- [ ] `useDevice` / `usePolling` hooks
- [ ] ConnectionPanel（连接 UI）
- [ ] Dashboard + Gauge（实时 V/I/P）
- [ ] OutputSwitch（输出 ON/OFF）

### Phase 4 — 控制功能（1 天）
- [ ] SetpointControl（V/I 设定，防抖）
- [ ] ProtectionPanel（读 + 写保护阈值）
- [ ] PresetPanel（M0~M2，FC10）

### Phase 5 — 可视化与调试（0.5 天）
- [ ] TrendChart（ECharts 滚动曲线）
- [ ] Console（十六进制报文 + CRC 校验状态高亮）
- [ ] CSV 导出

### Phase 6 — 健壮性（0.5 天）
- [ ] 断连检测 + 自动重连（指数退避）
- [ ] 错误恢复 + UI 告警
- [ ] SettingsModal（解码模式/原始值/频率，localStorage 持久化）
- [ ] 端到端真机回归测试

**预估总工期：约 5 个工作日**（单人，含真机联调）。

---

## 11. 验收标准与测试

### 11.1 单元测试（Vitest）
- ✅ CRC16：对协议 §6/§7 全部 8 条读命令 + 实测响应做 CRC 校验断言。
- ✅ 帧构建：`buildReadHolding(0x0004, 38)` 输出 = `01 03 00 04 00 26 85 D1`。
- ✅ 帧解析：协议 §7.1 响应解析出 `0xEAA3/0x0000/0x0231/0x0072`。
- ✅ 解码：温度 `0x0AEB` → `27.95`。

### 11.2 集成测试（Mock 设备）
- 串行队列：连续 10 次读请求，响应无串扰、无丢失。
- 重组：模拟分片通知（一帧拆 2 包），仍能正确组装。
- 超时：设备不响应时，2s 后 reject 且队列继续。

### 11.3 真机验收
| 用例 | 预期 |
|------|------|
| 扫描连接 | 5s 内发现 `RK6006` 并连接 |
| 读系统信息 | 显示固件版本 `561`（`0x0231`） |
| 主轮询 | 持续刷新温度 ≈ 27.9℃（设备 OFF 时） |
| 输出 ON/OFF | 面板指示灯随 `0x0012` 写入变化 |
| 报文控制台 | TX/RX 十六进制正确，CRC 标绿 |
| 断连重连 | 拔电源/超出距离后自动重连 |

---

## 12. 待确认项

以下源自协议文档 §12，需在实施中配合面板实测逐步闭环：

> ✅ **2026-06-27 真机写入验证已完成**（方法见协议 §7.6 / §8）：设定/实测/输出地址与缩放全部确认，
>    FC06 写入路径双向验证通过。详见协议文档 §7.6。原"缩放系数待标定""设定区待确认"两项**已闭环**。

1. ~~缩放系数语义~~ → ✅ 标准 Riden 固定编码（V/100、I/1000、温度/100），无系数寄存器。
2. ~~设定区寄存器地址~~ → ✅ `0x0008`=V设定、`0x0009`=I设定、`0x000A`=V实测、`0x0012`=输出。
3. **实测电流/功率缩放**：`0x000B`/`0x000C` 需接负载复测（当前功率用 V×I 计算）。
4. **预设组 `0x0030`**：FC10 地址未真机验证（§5.2 其它地址已证伪），写入需谨慎。
5. **保护阈值工程值**：`0x0037~0x0040` 的 threshold/raw 含义待确认。

> **建议**：先用 Web 上位机完成「连接 + 读 + 显示 + 输出开关」（Phase 0~3），再利用其 Console 对照面板标定缩放公式，反向更新 `decode.ts`，形成闭环。

---

**规划完。** 进入 Phase 0 即可开始落地；协议层（Phase 1）可完全脱离真机先行开发与测试。
