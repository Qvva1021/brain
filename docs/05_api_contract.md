# 文档 05：API 契约（API Contract）

> 适用读者：要动手写前后端代码的初学者。本文件是**前后端之间的"合同"**：后端按这份格式返回，前端按这份格式解析。写代码时，前端 `types.ts` 必须与本文件保持一致。

**先解释两个词：**
| 术语 | 中文 | 英文 | 人话解释 |
|---|---|---|---|
| JSON | JSON 数据格式 | JavaScript Object Notation | 一种用 `{"键": 值}` 表达数据的文本格式，人和程序都能看懂，前后端用它传数据 |
| 状态码 | HTTP 状态码 | HTTP Status Code | 服务器返回的三位数字，表示请求结果，如 200 表示成功、404 表示找不到 |

---

## 1. 约定总览

| 项 | 约定 |
|---|---|
| 基础地址 | 后端 `http://localhost:8000`；所有 REST 以 `/api/` 开头 |
| WebSocket | `ws://localhost:8000/ws/...` |
| 数据格式 | 请求/响应均为 JSON（`application/json`）；文件上传暂不涉及 |
| 时间戳 | ISO 8601 字符串，如 `2026-08-28T15:20:10+08:00`；波形数据内的浮点时间用 Unix 秒 |
| 情绪标签 | 内部恒用 `positive / neutral / negative`；中文 `高兴 / 平静 / 悲伤` 由后端映射返回 |
| 错误格式 | 统一 `{"detail": "错误描述"}`（FastAPI 默认） |
| 模拟模式 | `positive / neutral / negative`，见文档 06 |
| 第一版状态 | 每个接口都标注：✅ 已实现 / 🟡 占位（预留接口，返回提示） |

**统一响应字段说明：** 每个接口都会返回其约定字段，另有通用约定——`status` 取值 `ok`（成功）或 `error`（失败，配合 HTTP 状态码）。

---

## 2. REST API 完整契约

### 2.1 健康检查 `GET /api/health`
- **作用**：前端轮询判断后端是否在线（建议每秒或每 2 秒一次）。
- **请求参数**：无。
- **成功响应（200）**：
```json
{
  "status": "ok",
  "backend_version": "0.1.0",
  "backend_name": "EEG Emotion Recognition Backend",
  "timestamp": "2026-08-28T15:20:01+08:00"
}
```
- **调用组件**：`App.tsx`（启动时 + 定时轮询）；`api.ts` 封装。
- **第一版状态**：✅ 已实现。

### 2.2 获取配置 `GET /api/config`
- **作用**：前端拿到采样率、通道、频段、情绪标签、可选模型等一次性配置。
- **请求参数**：无。
- **成功响应（200）**：
```json
{
  "sample_rate": 250,
  "block_samples": 25,
  "block_interval_ms": 100,
  "total_channels": 62,
  "representative_channels": ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "O1", "O2"],
  "frequency_bands": {
    "delta":  { "name_zh": "δ", "range": [1, 4] },
    "theta":  { "name_zh": "θ", "range": [4, 8] },
    "alpha":  { "name_zh": "α", "range": [8, 13] },
    "beta":   { "name_zh": "β", "range": [13, 30] },
    "gamma":  { "name_zh": "γ", "range": [30, 50] }
  },
  "emotion_labels": {
    "positive": "高兴",
    "neutral": "平静",
    "negative": "悲伤"
  },
  "available_models": ["模拟分类器", "SVM（预留模型接口）", "CNN（占位）", "CNN-LSTM（占位）"],
  "available_features": ["raw", "psd", "de"],
  "data_source": "模拟数据"
}
```
- **调用组件**：`App.tsx`（挂载时初始化）；`ControlPanel.tsx`（下拉框选项）。
- **第一版状态**：✅ 已实现。

### 2.3 设置模拟情绪模式 `POST /api/simulation/mode`
- **作用**：切换后端模拟波形对应的情绪模式（影响波形频段强度与分类结果基准）。
- **请求参数（body）**：
```json
{ "mode": "positive" }
```
- **校验**：`mode` 必须是 `positive | neutral | negative` 之一，否则 422。
- **成功响应（200）**：
```json
{ "status": "ok", "simulation_mode": "positive", "mode_zh": "高兴" }
```
- **调用组件**：`ControlPanel.tsx`（模式切换）。
- **第一版状态**：✅ 已实现。

### 2.4 开始识别 `POST /api/recognition/start`
- **作用**：让后端开始周期性执行识别，并把结果推送到 `/ws/emotion-stream`。
- **请求参数（body，均可选）**：
```json
{ "model": "模拟分类器", "feature_type": "psd" }
```
- **行为**：若 `model` 不是「模拟分类器」，后端仍以模拟分类器运行，并在响应中提示。
- **成功响应（200）**：
```json
{
  "status": "ok",
  "recognizing": true,
  "model": "模拟分类器",
  "feature_type": "psd",
  "message": "识别已开始；所选模型若为占位，将提示并回退到模拟分类器"
}
```
- **失败**：已处于识别中可返回 409 `{"detail": "already recognizing"}`（第一版也可直接幂等返回 ok）。
- **调用组件**：`ControlPanel.tsx`（开始识别按钮）。
- **第一版状态**：✅ 已实现。

### 2.5 停止识别 `POST /api/recognition/stop`
- **作用**：停止识别循环，不再推送情绪结果。
- **请求参数**：无（可带 body 但忽略）。
- **成功响应（200）**：
```json
{ "status": "ok", "recognizing": false, "message": "识别已停止" }
```
- **调用组件**：`ControlPanel.tsx`（停止按钮）。
- **第一版状态**：✅ 已实现。

### 2.6 重置演示 `POST /api/recognition/reset`
- **作用**：停止识别、解除暂停、清空当前结果与历史，回到初始状态。
- **请求参数**：无。
- **成功响应（200）**：
```json
{
  "status": "ok",
  "recognizing": false,
  "paused": false,
  "current_result": null,
  "history_count": 0
}
```
- **调用组件**：`ControlPanel.tsx`（重置按钮）。
- **第一版状态**：✅ 已实现。

### 2.7 获取当前识别结果 `GET /api/recognition/current`
- **作用**：前端重连/刷新后拉取最近一次结果。
- **请求参数**：无。
- **成功响应（200，无结果时 `current_result` 为 `null`）**：
```json
{
  "current_result": {
    "emotion": "neutral",
    "emotion_zh": "平静",
    "confidence": 0.82,
    "model_name": "模拟分类器",
    "data_source": "模拟数据",
    "timestamp": "2026-08-28T15:20:10+08:00"
  }
}
```
- **调用组件**：`EmotionCard.tsx`（挂载时初始化）。
- **第一版状态**：✅ 已实现。

### 2.8 获取识别历史 `GET /api/history`
- **作用**：前端读取最近 10 条识别历史。
- **请求参数**：可选 `?limit=10`（默认 10）。
- **成功响应（200）**：
```json
{
  "count": 3,
  "items": [
    {
      "emotion": "positive",
      "emotion_zh": "高兴",
      "confidence": 0.88,
      "model_name": "模拟分类器",
      "data_source": "模拟数据",
      "timestamp": "2026-08-28T15:20:10+08:00"
    }
  ]
}
```
- **调用组件**：`App.tsx` / `HistoryTable.tsx`（挂载时 + 收到新结果时）。
- **第一版状态**：✅ 已实现。

### 2.9 清空识别历史 `DELETE /api/history`
- **作用**：清空内存中的历史记录。
- **请求参数**：无。
- **成功响应（200）**：
```json
{ "status": "ok", "deleted": 3 }
```
- **调用组件**：`HistoryTable.tsx`（清空历史按钮）。
- **第一版状态**：✅ 已实现。

### 2.10 数据加载接口 `POST /api/data/load`
- **作用**：未来加载 SEED `.mat` 文件的人口。第一版**不解析**，只返回占位提示。
- **请求参数（body，第一版忽略）**：
```json
{ "file_path": "optional/path/to/file.mat" }
```
- **成功响应（200，占位）**：
```json
{
  "status": "placeholder",
  "loaded": false,
  "message": "真实 SEED 数据解析功能待接入；第一版仅支持模拟数据。"
}
```
- **调用组件**：`ControlPanel.tsx`（加载文件按钮）。
- **第一版状态**：🟡 占位（接口存在，返回提示，不做解析）。

> 说明：第一版前端上传按钮不会真的发送文件字节（REST 不传二进制），只演示"点击 → 占位提示"的交互。

---

## 3. WebSocket 消息协议

### 3.1 `/ws/eeg-stream`
**作用**：后端每 100 ms 推送一个波形数据块，并周期性推送状态快照。

**消息类型 `type` 取值：** `eeg`（波形块）、`status`（状态快照）。

**`type: "eeg"`** —— 波形数据：
```json
{
  "type": "eeg",
  "data": {
    "timestamp": 1785295200.1,
    "sample_rate": 250,
    "channels": ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "O1", "O2"],
    "samples_per_channel": 25,
    "values": {
      "Fp1": [1.20, 1.51, 0.98, 0.42, ...],
      "Fp2": [0.80, 1.10, 1.35, 1.02, ...]
    }
  }
}
```

**`type: "status"`** —— 状态快照（可每 1 秒或状态变化时推送）：
```json
{
  "type": "status",
  "data": {
    "data_source": "模拟数据",
    "simulation_mode": "neutral",
    "recognition_running": false,
    "paused": false,
    "run_state": "streaming"
  }
}
```

`run_state` 取值：`idle`（空闲）/ `streaming`（波形播放中）/ `recognizing`（识别中）/ `paused`（已暂停）/ `stopped`（已停止）。

**消费方**：`WaveformChart.tsx`（`eeg` 更新曲线）、`SpectrumChart.tsx`（`eeg` 用于 PSD 更新或独立 PSD 推送，见 3.3）、`App.tsx`（`status` 同步全局状态）。
**第一版状态**：✅ 已实现。

### 3.2 `/ws/emotion-stream`
**作用**：识别进行时，每 2–5 秒推送一条情绪结果。

```json
{
  "type": "emotion",
  "data": {
    "emotion": "neutral",
    "emotion_zh": "平静",
    "confidence": 0.82,
    "model_name": "模拟分类器",
    "data_source": "模拟数据",
    "timestamp": "2026-08-28T15:20:10+08:00"
  }
}
```

**消费方**：`EmotionCard.tsx`、历史记录、运行日志。
**第一版状态**：✅ 已实现。

### 3.3 PSD 数据推送方案（选择其一，文档必须写明）
> 二选一，第一版**推荐方案 A**，实现最简。

- **方案 A（推荐）**：PSD 不在 WebSocket 单独推送。前端用最近一个 `eeg` 块的某代表通道数据，**由后端接口计算 PSD**…… 但为保证"计算在后端"，实际采用 **A'**：
  - **A'（本项目采用）**：后端在 `/ws/eeg-stream` 的 `eeg` 消息里**同时携带该通道的 PSD 数组**字段 `psd_freqs`、`psd_values`（可选，供频谱图直接使用）。这样"PSD 计算"在后端，前端只画图。
```json
{
  "type": "eeg",
  "data": {
    "timestamp": 1785295200.1,
    "sample_rate": 250,
    "channels": ["Fp1", "Fp2", "F3", "F4", "C3", "C4", "O1", "O2"],
    "samples_per_channel": 25,
    "values": { "Fp1": [1.20, ...], ... },
    "psd_freqs": [1.0, 1.2, 1.4, "...", 50.0],
    "psd_values": [0.35, 0.33, "...", 0.01]
  }
}
```
- **方案 B（备选）**：单独增加 `REST GET /api/spectrum?channel=Fp1`，前端按需轮询。第一版不采用，避免额外请求。
- **方案 C**：前端自行用 FFT 算 PSD —— **不使用**，违反"计算在后端"的边界铁律。

> 文档声明：第一版 PSD 图采用 **方案 A′**，即后端用 `scipy.signal.welch` 对最近窗口的代表通道数据计算 1–50 Hz PSD，随 `eeg` 消息一起推送。

### 3.4 WebSocket 客户端约定（前端）
1. 连接 URL：`ws://localhost:8000/ws/eeg-stream` 与 `/ws/emotion-stream`（或后端合并为单连接后取其一，第一版建议保持两条，前端 `api.ts` 管理）；
2. 断线后**指数退避重连**：1s → 2s → 4s → 8s … 封顶 30s；
3. 收到任何一帧即重置退避；连接状态通过 `App.tsx` 的 `backendConnected` 反映；
4. 前端对收到的帧做类型守卫（`type === "eeg"` / `"status"` / `"emotion"`），忽略未知类型。

---

## 4. 数据对象定义（JSON Schema 风格）

以下对象为全系统共用，字段名前后端必须一致：

### 4.1 `EmotionResult`
```json
{
  "emotion": "positive | neutral | negative",
  "emotion_zh": "高兴 | 平静 | 悲伤",
  "confidence": 0.60-0.95 (float),
  "model_name": "模拟分类器 | ...",
  "data_source": "模拟数据 | 已加载文件 | ...",
  "timestamp": "ISO 8601"
}
```

### 4.2 `SystemStatus`
```json
{
  "data_source": "模拟数据 | 真实数据（占位）",
  "sample_rate": 250,
  "displayed_channels": 8,
  "current_model": "模拟分类器",
  "run_state": "idle | streaming | recognizing | paused | stopped",
  "backend_connected": true
}
```

### 4.3 `LogItem`
```json
{ "time": "15:20:01", "level": "info | success | warning | error", "message": "..." }
```

---

## 5. 前端 TypeScript 接口草案（`types.ts`）

```typescript
/** 情绪标签与中文映射 */
export type EmotionLabel = "positive" | "neutral" | "negative";

/** 运行状态 */
export type RunState = "idle" | "streaming" | "recognizing" | "paused" | "stopped";

/** 后端健康检查响应 */
export interface HealthResponse {
  status: "ok";
  backend_version: string;
  timestamp: string;
}

/** 系统配置（GET /api/config 响应） */
export interface SystemConfig {
  sample_rate: number;
  block_samples: number;
  block_interval_ms: number;
  total_channels: number;
  representative_channels: string[];
  frequency_bands: Record<string, { name_zh: string; range: [number, number] }>;
  emotion_labels: Record<EmotionLabel, string>;
  available_models: string[];
  available_features: string[];
  data_source: string;
}

/** 单条识别结果 */
export interface EmotionResult {
  emotion: EmotionLabel;
  emotion_zh: string;
  confidence: number;
  model_name: string;
  data_source: string;
  timestamp: string;
}

/** 历史记录条目（与 EmotionResult 同构） */
export type HistoryItem = EmotionResult;

/** /ws/eeg-stream 的波形块消息 */
export interface EEGStreamMessage {
  type: "eeg";
  data: {
    timestamp: number;
    sample_rate: number;
    channels: string[];
    samples_per_channel: number;
    values: Record<string, number[]>;
    psd_freqs?: number[];
    psd_values?: number[];
  };
}

/** /ws/eeg-stream 的状态消息 */
export interface EEGStatusMessage {
  type: "status";
  data: {
    data_source: string;
    simulation_mode: EmotionLabel;
    recognition_running: boolean;
    paused: boolean;
    run_state: RunState;
  };
}

/** /ws/emotion-stream 的情绪结果消息 */
export interface EmotionStreamMessage {
  type: "emotion";
  data: EmotionResult;
}

/** 日志条目 */
export interface LogItem {
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

/** 系统整体状态（App.tsx 维护） */
export interface SystemStatus {
  backendConnected: boolean;
  dataSource: string;
  sampleRate: number;
  displayedChannels: number;
  currentModel: string;
  runState: RunState;
}
```

> **约定**：任何接口响应都尽量用上述类型描述；遇到后端新字段时先更新 `types.ts` 再使用，禁止 `any`。

---

## 6. HTTP 状态码说明

| 状态码 | 含义 | 出现场景 |
|---|---|---|
| 200 | 成功 | 所有正常响应 |
| 409 | 冲突 | 重复开始识别（第一版可放宽为幂等成功） |
| 422 | 参数校验失败 | `mode`/`model`/`feature_type` 值非法 |
| 404 | 找不到资源 | 路径写错 |
| 500 | 服务器内部错误 | 未捕获异常（第一版应极少出现） |

WebSocket 无 HTTP 状态码；连接失败/断开由前端重连机制处理。

---

## 7. 每个接口的第一版状态汇总

| 接口 | 状态 |
|---|---|
| GET /api/health | ✅ 已实现 |
| GET /api/config | ✅ 已实现 |
| POST /api/simulation/mode | ✅ 已实现 |
| POST /api/recognition/start | ✅ 已实现 |
| POST /api/recognition/stop | ✅ 已实现 |
| POST /api/recognition/reset | ✅ 已实现 |
| GET /api/recognition/current | ✅ 已实现 |
| GET /api/history | ✅ 已实现 |
| DELETE /api/history | ✅ 已实现 |
| POST /api/data/load | 🟡 占位（返回待接入提示） |
| WS /ws/eeg-stream | ✅ 已实现（eeg + status 消息） |
| WS /ws/emotion-stream | ✅ 已实现（emotion 消息） |
| GET /api/spectrum（备选） | 不采用（用方案 A′） |

---

> 下一篇：**`docs/06_data_model_algorithm_plan.md`（数据模型与算法方案）**，解释数据怎么设计、算法怎么算。
