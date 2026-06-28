# RK6006H Web 上位机 — 能力升级方案

> 把现有 Web 上位机从「能用的显示器」升级为「生产级、带保护、可离线、可安装」的智能电源上位机。
> 文档位置:`docs/RK6006H_Web_Upgrade_Plan.md`,配合 `docs/WebConsole_Implementation_Plan.md`(实现规划)与 `docs/RK6006H_Bluetooth_Protocol_Analysis.md`(协议逆向)阅读。

---

## 0. 背景与目标 (Context)

**现状基线很高,不是"业余上位机"**:`rk6006h-web-console/` 是纯前端单页(React 18 + TS strict + Vite 5 + Zustand 5 + ECharts 5 + Tailwind 3),架构分 5 层(BleAdapter 抽象 → Modbus 传输 → 协议编解码 → Store 状态机 → React),已经做到:自动重连(指数退避)、CRC 收发双向校验、串行请求队列 + 帧重组 + 超时守护、HM-10 实战调优(writeWithoutResponse / 首帧 300ms 稳定窗 / 4 次建链重试)、Mock 设备离线演示、写入二次确认、Playwright E2E、协议文档 + 真机验证记录。

**为什么要升级**:基线虽高,但有三类"硬伤"和大量"成品感"缺口 ——
1. **可靠性硬伤**:写入失败用户无感知、Modbus 异常帧被静默丢弃、轮询周期写死、无断连心跳兜底。
2. **专业功能空白**:能读 OVP/OCP 但不做联动校验、无校准、无 Ah/Wh 能量积分、设备序列号寄存器定义了却没解码。
3. **成品感缺口**:非 PWA(无法离线/安装)、无主题切换、无快捷键、历史只存内存 120 点(断开即失)、图表无缩放/暂停/双 Y 轴、告警无声光。

**预期成果**:分 P0/P1/P2 三阶段,先补齐通信可靠性与高频交互痛点(P0),再做体验跃迁(PWA/主题/长历史/告警,P1),最后上专业高级功能(校准/Ah 积分/脚本,P2)。本次侧重:**通信鲁棒性、专业电源功能、体验与工程化、UI 交互**(自动化脚本弱化为 P2 备选)。

---

## 1. 升级全景(一图速览)

| 维度 | P0(基础打磨) | P1(体验跃迁) | P2(高级功能) |
|---|---|---|---|
| **A 通信鲁棒性** | 写入错误反馈、异常帧处理、CRC 失败契约、输出开关确认 | 自适应轮询、断连心跳兜底、脏数据清洗 | 保护寄存器写入(需先逆向) |
| **B UI/UX 交互** | 抽 maybeConfirm、自定义确认弹窗、OVP/OCP 联动校验 | 浅色主题、图表双Y轴/dataZoom/暂停、快捷键、骨架屏 | 移动端打磨、a11y、撤销/重做 |
| **C 专业电源功能** | OVP/OCP 联动告警 | 设备序列号/运行时间、Ah/Wh 积分 | 校准(线性拟合) |
| **D 数据持久化** | 记住最后设定/预设 | IndexedDB 长会话 + 回放、报文/遥测导出 | 配置导入导出 |
| **E 体验与工程化** | 抽重复常量/工具 | **PWA**(manifest+SW)、ESLint/Prettier/CI | 主题持久化、性能优化(环形缓冲/差量图表) |
| **F 自动化/架构** | — | — | 脚本引擎(可选)、多设备 SessionManager |

> 阶段定义:**P0** = 投入小、修硬伤、无新依赖,1~2 天可落地;**P1** = 引入新能力(PWA/IndexedDB/ECharts 增强),带来"成品感"跃迁;**P2** = 大功能,部分依赖协议逆向,长期演进。

---

## 2. 分阶段路线图

### P0 — 通信可靠性 + 高频交互痛点(立即可做,无新依赖)

| # | 事项 | 改哪里 | 复用 |
|---|---|---|---|
| P0-1 | **写入失败必须有错误反馈**:`setOutput/setVoltage/setCurrent` 加 try/catch,失败 `set({error})` 并在 UI 提示 | `store/deviceStore.ts:244-265`、`components/OutputSwitch.tsx:14-22` | 现有 `error` 状态 + `ConnectionPanel` 错误条 |
| P0-2 | **处理 Modbus 异常帧**:`pollOnce`/`refreshProtection` 识别 `resp.kind==='exception'`,记录异常码并提示 | `store/deviceStore.ts` pollOnce、`modbus/frames.ts:113-121` | `parseResponse` 已能解析异常 |
| P0-3 | **CRC 失败契约收紧**:传输层对 `crcOk=false` 默认 reject(可配置),调用方不再每次手判 | `modbus/transport.ts` settleParsed、`frames.ts:103-109` | `verifyCrc` |
| P0-4 | **输出开关加确认**:关输出前 confirm(尤其带载场景) | `components/OutputSwitch.tsx:14` | `maybeConfirm` |
| P0-5 | **OVP/OCP 联动校验**:设定电压/电流 > 保护阈值时警告 | `components/SetpointControl.tsx:31` apply() | `protection` 已在 store |
| P0-6 | **抽 `maybeConfirm` 到 `utils/confirm.ts`**(现两份重复) | `utils/confirm.ts`(新)、`SetpointControl.tsx:8-11`、`PresetPanel.tsx:31-34` | — |
| P0-7 | **Mock FC 常量复用 `FunctionCode` 枚举**(现重复定义) | `ble/MockBleAdapter.ts:14-16` | `types/modbus.ts` FunctionCode |
| P0-8 | **持久化最后设定值/预设组**:刷新后保留 | `utils/storage.ts` SettingKey 扩展、`SetpointControl`/`PresetPanel` state | 现有 `saveSetting/loadSetting` |
| P0-9 | **轮询失败计数 + 可见性**:连续失败累计,达到阈值 UI 标"通信不稳" | `store/deviceStore.ts` pollOnce catch | 现有轮询 |

**P0 验收**:Mock 模式下制造写入失败/异常帧/CRC 错,UI 有明确提示;关输出有确认;设定超 OVP 有警告;刷新页面设定值保留;`npm run build` + `npm test` + `npx playwright test` 全绿。

---

### P1 — 体验跃迁(引入 PWA / IndexedDB / 图表增强 / 主题 / 告警)

| # | 事项 | 关键点 |
|---|---|---|
| P1-1 | **PWA(离线 + 安装到桌面)** | `vite-plugin-pwa`:manifest + service worker(预缓存 app shell)。**注意**:Web Bluetooth 需用户手势,SW 不影响;离线可打开历史配置但重连仍需在线+手势。契合"零安装"卖点 |
| P1-2 | **浅色/深色主题切换** | 现有 token 化已做好(`tailwind.config.js` surface/accent),加 `prefers-color-scheme` + 手动 toggle + 持久化。改 `global.css` 用 CSS 变量驱动 token |
| P1-3 | **长会话历史 + 曲线回放** | 新增 `store/sessionStore` + IndexedDB(Dexie 或原生 IDB):每次连接开 session,轮询点全部落库。TrendChart 支持 dataZoom 缩放、时间轴、暂停/冻结、回放历史 session |
| P1-4 | **图表双 Y 轴 + 增强** | `TrendChart.tsx`:电压/电流左轴、功率右轴;加 dataZoom、tooltip 增强、导出 PNG。解决"功率压扁电流"问题 |
| P1-5 | **告警声光/桌面通知** | `pollOnce` 对比 `telemetry` 与 `protection` 阈值,越限触发 `new Notification()` + `AudioContext` beep + UI 闪烁。复用 P0-5 的联动逻辑 |
| P1-6 | **报文 Console 过滤/搜索** | `Console.tsx`:按 direction(TX/RX)/CRC/地址过滤 + 文本搜索;`[...log].reverse()` 改 useMemo,避免每帧重建数组 |
| P1-7 | **设备信息补全** | `decode.ts:34-40` `decodeDeviceInfo` 补解码 `SERIAL_1/SERIAL_3`(`map.ts:21-23` 已定义未用);显示序列号、固件、运行时间 |
| P1-8 | **连接/加载骨架屏** | `ConnectionPanel`:首帧读取(系统信息/保护)期间显示骨架/步骤进度,替代单一"连接中…" |
| P1-9 | **导出增强** | 遥测历史导出 CSV/JSON(**带 BOM** 防中文乱码);报文 CSV 加 BOM;预设组 JSON 导入导出 |
| P1-10 | **ESLint + Prettier + CI** | 加配置(项目里已有 `eslint-disable` 注释却无 eslint),GitHub Actions 跑 `tsc+test+build` |
| P1-11 | **快捷键** | 空格切输出、Enter 应用设定、数字键切 Tab;集中到 `useHotkeys` hook |

**P1 验收**:可"安装到桌面"且离线打开;主题切换生效且记忆;长会话(>1000 点)曲线流畅可缩放/暂停/回放;越限有桌面通知+声音;Console 可过滤;CSV 用 Excel 打开无乱码;CI 在 PR 上跑通。

---

### P2 — 高级功能(部分依赖协议逆向,长期演进)

| # | 事项 | 前置/风险 |
|---|---|---|
| P2-1 | **电压/电流校准(线性拟合)** | 2 点校准(设定 vs 实测),算 k/b 存 localStorage,decode 时套用。纯上位机侧,无协议风险 |
| P2-2 | **保护设置写入** | `ProtectionPanel` 当前只读(`decode.ts:89` threshold 工程值"待确认")。**需先逆向确认 0x0037~0x0040 写入语义与编码**,再上写入 UI |
| P2-3 | **脚本引擎(序列控制/定时输出)** | 可视化步骤编辑器(设定 V/I→延时→读数→条件跳转),导出 JSON,定时执行。本次为弱化项,可延后 |
| P2-4 | **多设备/多通道** | 需把 `deviceStore.ts:66-71` 模块级 session 重构为 `SessionManager` 实例 + registry。改动面大,建议在 P0/P1 稳定后再做 |
| P2-5 | **寄存器表 schema 化 + 文档自动生成** | REG 表从 JSON schema 生成,反向产文档与 Mock 内存,消除"代码注释 vs 文档 vs Mock"三方漂移(已受害:`transport.test.ts:10-16` 陈旧注释) |
| P2-6 | **性能优化(可选)** | `history`/`log` 改真环形缓冲(固定数组+head);TrendChart 用 `appendData` 差量更新替代全量 `setOption`;Console 虚拟滚动 |
| P2-7 | **a11y / 移动端打磨** | 滑块 thumb 加 `aria-label`/`aria-valuetext`;开关加 `role="switch"`/`aria-checked`;图标按钮加 `aria-label`;触屏 thumb 放大;仪表盘窄屏自适应 |

---

## 3. 重点维度详述

### 3.1 通信鲁棒性(P0 核心,务必先做)

现有传输层(`modbus/transport.ts`)串行队列 + 超时 + 帧重组已很扎实,但**应用层把错误吞了**,这是最大体验漏洞:

- **写入静默失败**:`deviceStore.ts:244-265` 的 `setOutput/setVoltage/setCurrent` 仅复位 `pending`,失败无反馈 → 用户以为成功了。**改**:包裹 try/catch,失败 `set({error: <友好信息>})`。
- **异常帧丢弃**:`pollOnce`/`refreshProtection` 只判 `resp.kind==='read'`,异常帧被当"无数据"扔掉 → 设备回的 Modbus 异常码(非法地址/非法值/从机忙)用户看不到。**改**:新增 `resp.kind==='exception'` 分支,记录 `exceptionCode` 并提示。
- **轮询失败静默**:`deviceStore.ts` pollOnce 的 `catch {}` 完全静默。**改**:累计连续失败计数,达阈值(如 5 次)在 UI 标"通信不稳定",并触发断连心跳兜底。
- **断连心跳兜底**:现有重连依赖 `gattserverdisconnected` 事件;BLE 静默掉线(无事件无数据)时无兜底。**改**(P1):连续 N 次轮询超时 → 主动判连接失效并触发重连。
- **CRC 契约**:`transport.ts` settleParsed 不区分 CRC 失败直接 resolve,调用方每次手判 `crcOk`(契约脆弱)。**改**(P0-3):传输层默认对 CRC 失败 reject,提供 `transport.request(..., {allowCrcFail:true})` 逃生口。
- **脏数据清洗**:`transport.ts:153-154` 溢出字节留到下次,若残留污染下一帧无校验。**改**(P1):按 slave addr/FC 校验首字节合法性丢弃脏数据。
- **轮询周期可配**:`POLL_INTERVAL_MS=1000`(`constants.ts:28`)写死。**改**(P1):从 `loadSetting` 读 + UI 暴露 + 通信频繁失败时自适应拉长。

### 3.2 UI/UX 交互(本次重点)

- **自定义确认弹窗替代 `window.confirm`**:`maybeConfirm`(P0-6 抽取)当前用原生 `confirm`,移动端体验差、不可定制。**改**:做一个 `ConfirmDialog` 组件(基于现有 token),支持危险操作红色强调、带"不再提醒"。
- **OVP/OCP 联动**(P0-5):`SetpointControl.apply()` 在设定电压时对比 `protection.ovp`,设定电流对比 `protection.ocp`,超阈值弹警告 + 二次确认。**数据已就绪**,几十行即可。
- **图表增强**(P1-4):现 3 条线共一 Y 轴,功率把电流压扁。改双 Y 轴 + dataZoom + tooltip;加"暂停/冻结"按钮冻结实时刷新便于细看;导出 PNG。
- **连接过程可见化**(P1-8):首帧读取期间(系统信息/保护/首遥测)现在只有"连接中…"。改骨架屏 + 步骤进度(读取系统信息 → 读取保护 → 实时遥测),让用户知道在干嘛。
- **快捷键**(P1-11):空格切输出、Enter 应用设定、`1/2/3` 切保护/预设/控制台 Tab。集中 `useHotkeys` hook,连接断开时禁用危险键。
- **主题切换**(P1-2):现有 `tailwind.config.js` 已 token 化,加 `prefers-color-scheme` 媒体查询 + 顶部 toggle + 持久化(`SettingKey.theme`)。
- **a11y / 移动端**(P2-7):滑块/开关/图标按钮补 ARIA;触屏 thumb 放大;仪表盘窄屏自适应。

### 3.3 专业电源功能

- **Ah/Wh 能量积分**(P1):基于 `currentActual × dt` 在 store 累计,显示当前会话的 Ah/Wh;落 IndexedDB 可跨会话累计。寄存器有 OAH/OPH 阈值但无实时积分,这里补上。
- **设备信息补全**(P1-7):`map.ts:21-23` 的 `SERIAL_1/SERIAL_3` 定义了却没解码,`decodeDeviceInfo`(`decode.ts:34-40`)只取 model+firmware。补序列号、固件、运行时间。
- **校准**(P2-1):2 点线性拟合(输入"设定 vs 实测"两组),算 `k/b` 存 localStorage,decode 时套用。纯上位机侧,无协议风险,安全可做。
- **保护写入**(P2-2):**先逆向**,确认 0x0037~0x0040 写入语义再上 UI(避免误写触发保护误动作)。

### 3.4 数据持久化

- 现状:`storage.ts` 只存 2 个 key(`mock`/`decodeMode`)。
- P0-8:加 `lastSetpoint`/`presets`,刷新保留。
- P1-3:IndexedDB 长会话(每连接一个 session,轮询点全落库),支持曲线回放。Dexie 或原生 IDB。
- P1-9:遥测/报文/预设导出,**CSV 必带 BOM**(防中文乱码)。
- **安全**:`storage.ts:13` `JSON.parse(raw) as T` 是不安全断言,localStorage 被篡改可能写入危险值。**改**(P0 顺手):用 zod 或手写校验函数对恢复的预设/校准值做范围校验后再用。

---

## 4. 技术风险与约束

| 风险/约束 | 说明 | 应对 |
|---|---|---|
| **Web Bluetooth 无法持久设备 ID** | API 限制,每次连接需用户手势选设备 | 记 `deviceName`/`namePrefix` 下次默认过滤(P0-8 扩展),但重连仍需手势 |
| **PWA + BLE 兼容** | SW 预缓存 app shell 不影响蓝牙;离线可看历史配置 | 重连必须在线 + 用户手势,文档说明 |
| **浏览器限制** | 仅 Chromium(Chrome/Edge),Firefox/iOS Safari 不支持 Web Bluetooth | UI 做浏览器检测并友好提示 |
| **协议未验证项** | 保护阈值工程值"待确认"(`decode.ts:89`)、预设地址 `0x0030` 未验证(`PresetPanel.tsx:128`) | 保护写入(P2-2)先逆向;预设写入保持二次确认 + Mock 验证 |
| **Mock 与真机漂移** | `transport.test.ts:10-16` 注释陈旧,Mock 内存模型需随真机验证更新 | P2-5 寄存器表 schema 化统一 |
| **Web Bluetooth 仅 HTTPS/localhost** | Vite dev 已用 127.0.0.1(安全上下文) | PWA 部署须 HTTPS |

---

## 5. 关键文件清单(改动落点)

| 文件 | 涉及事项 |
|---|---|
| `src/store/deviceStore.ts` | P0-1/2/5/8/9、P1-5/7、断连心跳、自适应轮询 |
| `src/modbus/transport.ts` | P0-3 CRC 契约、P1 脏数据清洗 |
| `src/components/SetpointControl.tsx` | P0-5 联动、P0-6/8 |
| `src/components/OutputSwitch.tsx` | P0-1/4 |
| `src/components/TrendChart.tsx` | P1-3/4 |
| `src/components/Console.tsx` | P1-6/9 |
| `src/components/ProtectionPanel.tsx` | P2-2 |
| `src/registers/decode.ts` + `map.ts` | P1-7 序列号、P2-1 校准、P2-2 保护写入 |
| `src/utils/storage.ts` | P0-8 扩展 SettingKey + 安全反序列化 |
| `src/utils/confirm.ts`(新) | P0-6 抽取 |
| `src/utils/format.ts` | 合并 `formatFirmware`(现 `types/device.ts`) |
| `tailwind.config.js` + `global.css` | P1-2 主题 |
| `vite.config.ts` + `index.html` | P1-1 PWA(manifest/SW) |
| 新增:`store/sessionStore.ts`(IndexedDB)、`hooks/useHotkeys.ts`、`components/ConfirmDialog.tsx`、`components/Skeleton.tsx` | P1 |

---

## 6. 验收方式(端到端)

1. **P0 单测/集成**:`npm test`(Vitest)加用例 —— 异常帧处理、CRC 失败 reject、写入失败反馈、Mock FC 常量一致性;`npx playwright test` 扩场景 —— 模拟写入失败/异常帧/CRC 错,断言 UI 提示。
2. **P0 手测(Mock)**:Mock 模式制造各类通信故障,确认每类都有可见提示;关输出有确认;设定超 OVP 警告;刷新保留设定。
3. **P1 手测**:浏览器安装 PWA + 断网打开;主题切换 + 刷新记忆;长会话(>1000 点)曲线缩放/暂停/回放流畅;越限收到桌面通知 + 蜂鸣;CSV 用 Excel 打开无乱码。
4. **真机回归**:RK6006H 真机连接,确认 P0 通信改进未破坏现有遥测/写入;P1-7 序列号读取正确;P2 校准后实测值与万用表一致。
5. **CI 绿**:`tsc --noEmit && npm test && npm run build` 全通过(P1-10 引入)。

---

## 7. 推荐起步顺序

**第一周(P0)**:P0-1/2/3(通信硬伤)→ P0-6/7(去重)→ P0-4/5(交互)→ P0-8/9(持久化/计数)。
**第二周(P1 核心)**:P1-1 PWA → P1-2 主题 → P1-4 图表 → P1-3 IndexedDB 长历史 → P1-5 告警。
**后续(P1 收尾 + P2)**:P1-7/8/9/10/11 → 按 P2 优先级(校准先行,保护写入需逆向)。

> **最值得先动手的 3 件事**
> ① **P0-1/2/3** 通信可靠性硬伤 —— 修体验最大漏洞(写入失败无反馈 / 异常帧丢弃 / CRC 契约脆弱);
> ② **P0-5 + P1-5** OVP/OCP 联动 + 声光告警 —— 从"显示器"升级为"带保护的智能上位机";
> ③ **P1-1 / P1-2** PWA + 主题切换 —— 低投入换"成品感"跃迁。
