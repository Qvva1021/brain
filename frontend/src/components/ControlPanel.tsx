/**
 * 左侧控制面板：A 数据源 / B 特征与模型 / C 任务控制。
 * 本版本使用真实 emotions.csv + 真实 SVM，信息全部来自后端 /api/config。
 */
import { useState } from 'react';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import type { RunState, SystemConfig } from '../types';

interface ControlPanelProps {
  config: SystemConfig | null;
  backendConnected: boolean;
  runState: RunState;
  onStart: () => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: () => Promise<void>;
  onReset: () => Promise<void>;
}

export default function ControlPanel(props: ControlPanelProps) {
  const { config, backendConnected, runState } = props;

  // 由 runState 派生按钮可用状态（状态唯一来自后端，前端不本地造假）
  const isRecognizing = runState === 'recognizing' || runState === 'paused';
  const isPaused = runState === 'paused';

  // 正在执行的按钮 key（用于 loading 反馈，防止重复点击）
  const [busy, setBusy] = useState<string>('');
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy('');
    }
  };

  const modelInfo = config?.model_info;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* A 数据源 */}
      <Card size="small" title="A · 数据源">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Typography.Text type="secondary">
            数据集：{config?.data_source ?? '未加载'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            样本数 <b>{config?.n_rows ?? '—'}</b> ｜ 特征维数 <b>{config?.n_features ?? '—'}</b>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            标签映射：
          </Typography.Text>
          <Space wrap size={4}>
            {(Object.entries(config?.emotion_labels ?? {}) as [string, string][]).map(([key, zh]) => (
              <Tag key={key} color="blue">{key} → {zh}</Tag>
            ))}
          </Space>
        </Space>
      </Card>

      {/* B 特征与模型 */}
      <Card size="small" title="B · 特征与模型">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Typography.Paragraph style={{ fontSize: 12, marginBottom: 4 }}>
            <b>特征：</b>{config?.available_features?.[0] ?? '—'}
            （Muse 4 通道头带统计特征，α/β 频段，来自 Kaggle EEG 数据集）
          </Typography.Paragraph>
          <Typography.Paragraph style={{ fontSize: 12, marginBottom: 4 }}>
            <b>模型：</b>{config?.available_models?.[0] ?? '—'}
          </Typography.Paragraph>
          {modelInfo ? (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                测试集准确率 <b>{Math.round(modelInfo.accuracy * 100)}%</b> ｜ F1(macro) <b>{modelInfo.f1_macro}</b>
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                训练样本 {modelInfo.n_train} / 测试 {modelInfo.n_test} ｜ 训练于 {modelInfo.trained_at}
              </Typography.Text>
            </>
          ) : (
            <Alert type="warning" showIcon message="模型尚未加载（数据可能缺失）" />
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            提示：删除 backend/../models/emotion_svm.pkl 后重启后端，即可重新训练。
          </Typography.Text>
        </Space>
      </Card>

      {/* C 任务控制 */}
      <Card size="small" title="C · 任务控制">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Button
            type="primary"
            block
            disabled={!backendConnected || isRecognizing}
            loading={busy === 'start'}
            onClick={() => run('start', props.onStart)}
          >
            开始识别
          </Button>
          <Space style={{ width: '100%' }} direction="vertical">
            <Button
              block
              disabled={!isRecognizing || isPaused}
              loading={busy === 'pause'}
              onClick={() => run('pause', props.onPause)}
            >
              暂停回放
            </Button>
            <Button
              block
              disabled={!isPaused}
              loading={busy === 'resume'}
              onClick={() => run('resume', props.onResume)}
            >
              继续回放
            </Button>
          </Space>
          <Button
            danger
            block
            disabled={!isRecognizing}
            loading={busy === 'stop'}
            onClick={() => run('stop', props.onStop)}
          >
            停止识别
          </Button>
          <Button block loading={busy === 'reset'} onClick={() => run('reset', props.onReset)}>
            重置演示
          </Button>
          {!backendConnected && (
            <Alert type="error" showIcon message="无法连接到后端，请确认后端已启动" />
          )}
        </Space>
      </Card>
    </div>
  );
}
