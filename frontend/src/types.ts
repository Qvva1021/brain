/**
 * 前后端共享的类型定义（真实模型版）。
 * 注意：本版本的数据是 Kaggle emotions.csv（2548 维统计特征，3 类情绪），
 * 不再是模拟波形，因此类型与"模拟版"相比有较大变化。
 */

/** 情绪内部标签（小写英文 key，后端把 POSITIVE/NEUTRAL/NEGATIVE 归一化到这里） */
export type EmotionLabel = "positive" | "neutral" | "negative";

/** 运行状态 */
export type RunState = "idle" | "streaming" | "recognizing" | "paused" | "stopped";

/** 日志级别 */
export type LogLevel = "info" | "success" | "warning" | "error";

/** 模型评估信息（后端训练时记录） */
export interface ModelInfo {
  accuracy: number;
  f1_macro: number;
  n_train: number;
  n_test: number;
  trained_at: string;
}

/** 前端特征流图展示的单个特征 */
export interface DisplayFeature {
  name: string;   // 列名，如 mean_0_a
  label: string;  // 中文标签，如 均值·通道0·α
}

/** 系统配置（GET /api/config 响应） */
export interface SystemConfig {
  data_source: string;
  n_rows: number;         // 数据样本数
  n_features: number;     // 特征维数
  feature_cols: string[]; // 全部特征列名
  display_features: DisplayFeature[];
  fft_features: string[];
  emotion_labels: Record<EmotionLabel, string>;
  available_models: string[];
  available_features: string[];
  model_info: ModelInfo;
}

/** 单条识别结果（真实 SVM 输出；true_label 为数据集给的"标准答案"） */
export interface EmotionResult {
  emotion: EmotionLabel;
  emotion_zh: string;
  confidence: number;
  probabilities?: Record<EmotionLabel, number>;
  model_name: string;
  data_source: string;
  timestamp: string;
  true_label?: string;
  true_label_zh?: string;
}

/** /ws/eeg-stream 的"一行真实数据"消息（type: "eeg"） */
export interface EEGStreamMessage {
  type: "eeg";
  data: {
    row_index: number;      // 当前回放到第几行
    total_rows: number;     // 数据总行数
    feature_names: string[];              // 特征流图用的特征名
    values: Record<string, number>;       // 当前行的这些特征值
    fft_bins: number[];                   // FFT 图的横坐标（0..249）
    fft_values: number[];                 // 当前行的 FFT 特征值
    true_label: string;                   // 真实标签（英文）
    true_label_zh: string;                // 真实标签（中文）
    prediction: EmotionResult | null;     // 识别中才有值，否则为 null
  };
}

/** /ws/eeg-stream 的状态快照消息（type: "status"，每 N 条数据发一次） */
export interface EEGStatusMessage {
  type: "status";
  data: {
    data_source: string;
    recognition_running: boolean;
    paused: boolean;
    run_state: RunState;
  };
}

/** WebSocket 消息联合类型（前端按 type 做类型守卫） */
export type WSMessage = EEGStreamMessage | EEGStatusMessage;

/** 日志条目 */
export interface LogItem {
  time: string;
  level: LogLevel;
  message: string;
}

/* ---------- 以下为各 REST 接口的响应类型 ---------- */

/** GET /api/status 响应 */
export interface StatusResponse {
  data_source: string;
  model_loaded: boolean;
  model_info: ModelInfo | null;
  train_log: string;
  recognition_running: boolean;
  paused: boolean;
  run_state: RunState;
  current_result: EmotionResult | null;
  history_count: number;
}

/** POST /api/predict 响应（与 EmotionResult 一致） */
export type PredictResponse = EmotionResult;

export interface StartRecognitionResponse {
  status: string;
  recognizing: boolean;
  model: string;
  feature_type: string;
  message: string;
}

export interface StopRecognitionResponse {
  status: string;
  recognizing: boolean;
  message: string;
}

export interface PauseResponse {
  status: string;
  paused: boolean;
  message: string;
}

export interface ResetResponse {
  status: string;
  recognizing: boolean;
  paused: boolean;
  current_result: EmotionResult | null;
  history_count: number;
}

export interface CurrentResultResponse {
  current_result: EmotionResult | null;
}

export interface HistoryResponse {
  count: number;
  items: EmotionResult[];
}
