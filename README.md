# RK6006H Web 上位机

浏览器直连 Riden RK6006H 直流电源的 Web 上位机 —— 纯 Web Bluetooth + Modbus RTU，零后端、零安装。

## 功能

- 实时监测电压 / 电流 / 功率 / 温度（仪表 + 滚动曲线）
- 输出开关、电压/电流设定、预设组 M0~M2（滑块高级控件）
- 保护设置读出、报文控制台（TX/RX + CRC）、CSV 导出
- 意外断连自动重连、Mock 设备离线演示

## 快速开始

```bash
cd rk6006h-web-console
npm install
npm run dev      # http://127.0.0.1:5173（Chrome / Edge）
```

无硬件时在连接面板勾选「Mock 设备」即可完整演示。
真机使用前请**关闭手机 APP**（BLE 仅允许一个主机）。

## 协议

RK6006H 蓝牙为 **Modbus RTU over BLE 透传 UART**（`ffe0/ffe1`）。
设定/实测/输出寄存器经真机写入验证，缩放为标准 Riden 编码（V/100、I/1000、温度/100）。

- 完整逆向分析与真机验证：[docs/RK6006H_Bluetooth_Protocol_Analysis.md](docs/RK6006H_Bluetooth_Protocol_Analysis.md)
- 实现规划：[docs/WebConsole_Implementation_Plan.md](docs/WebConsole_Implementation_Plan.md)

## 技术栈

Vite + React 18 + TypeScript（strict）+ Zustand + ECharts + Tailwind + Vitest + Playwright。

## 测试

```bash
npm test            # 单测（协议层 / 传输层 / Store）
npm run test:e2e    # Playwright E2E（Mock 模式全流程）
```
