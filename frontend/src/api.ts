/**
 * API 封装层：REST 请求（原生 fetch）+ WebSocket 连接（指数退避自动重连）。
 * REST 走相对路径 /api/...，由 vite 代理到后端 8000；
 * WebSocket 直连 ws://localhost:8000。
 */
import type {
  CurrentResultResponse,
  HistoryResponse,
  PauseResponse,
  PredictResponse,
  ResetResponse,
  StartRecognitionResponse,
  StatusResponse,
  StopRecognitionResponse,
  SystemConfig,
  WSMessage,
} from './types';

/** WebSocket 基础地址（本机演示固定 localhost:8000） */
const WS_BASE = 'ws://localhost:8000';

/** 统一 REST 请求封装：非 200 时抛出后端 detail 或通用错误 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `请求失败（HTTP ${res.status}）`);
  }
  return res.json() as Promise<T>;
}

/** REST 接口封装 */
export const api = {
  getHealth: () => request<{ status: string; model: string; timestamp: string }>('/api/health'),
  getConfig: () => request<SystemConfig>('/api/config'),
  getStatus: () => request<StatusResponse>('/api/status'),
  /** 用一条样本的 2548 个特征请求真实情绪预测 */
  predictEmotion: (features: number[]) =>
    request<PredictResponse>('/api/predict', {
      method: 'POST',
      body: JSON.stringify({ features }),
    }),
  startRecognition: (model: string, featureType: string) =>
    request<StartRecognitionResponse>('/api/recognition/start', {
      method: 'POST',
      body: JSON.stringify({ model, feature_type: featureType }),
    }),
  pauseRecognition: () =>
    request<PauseResponse>('/api/recognition/pause', { method: 'POST' }),
  resumeRecognition: () =>
    request<PauseResponse>('/api/recognition/resume', { method: 'POST' }),
  stopRecognition: () =>
    request<StopRecognitionResponse>('/api/recognition/stop', { method: 'POST' }),
  resetRecognition: () =>
    request<ResetResponse>('/api/recognition/reset', { method: 'POST' }),
  getCurrentResult: () => request<CurrentResultResponse>('/api/recognition/current'),
  getHistory: () => request<HistoryResponse>('/api/history'),
  clearHistory: () =>
    request<{ status: string; deleted: number }>('/api/history', { method: 'DELETE' }),
};

/**
 * 建立一条 WebSocket 连接并自动重连。
 * @param path         路径，如 '/ws/eeg-stream'
 * @param onMessage    收到消息的回调（前端按 type 守卫处理）
 * @param onStatusChange 连接建立/断开回调（可选）
 * @returns 关闭连接的函数（供组件卸载时调用）
 */
export function connectWebSocket(
  path: string,
  onMessage: (msg: WSMessage) => void,
  onStatusChange?: (connected: boolean) => void,
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${WS_BASE}${path}`);

    ws.onopen = () => {
      retry = 0; // 收到任意连接即重置退避
      onStatusChange?.(true);
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data) as WSMessage);
      } catch {
        // 忽略无法解析的消息
      }
    };
    ws.onclose = () => {
      onStatusChange?.(false);
      if (closed) return;
      // 指数退避：1s → 2s → 4s → ... 封顶 30s
      const delay = Math.min(30_000, 1000 * 2 ** retry);
      retry += 1;
      setTimeout(connect, delay);
    };
    ws.onerror = () => ws?.close();
  };

  connect();
  return () => {
    closed = true;
    ws?.close();
  };
}
