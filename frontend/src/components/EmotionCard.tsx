/**
 * 当前情绪识别结果卡片：大字情绪 + Emoji + 置信度 + 真实标签对比 + 来源标注。
 * 结果来自后端真实 SVM 模型（训练自 emotions.csv）。
 * 额外提供：各类情绪概率分布（真实模型输出）、置信度解释、以及基于当前特征与
 * 近期窗口的"特征观察"（辅助理解，非模型内部逻辑——SVM 是黑盒）。
 */
import { Card, Collapse, Progress, Space, Tag, Typography } from 'antd';
import type { EmotionLabel, EmotionResult } from '../types';
import { featureMeta, windowStats } from '../featureMeta';

interface EmotionCardProps {
  result: EmotionResult | null;
  recognizing: boolean;
  stopped: boolean;
  eegData: Record<string, number[]>;
  featureNames: string[];
}

/** 情绪视觉规范（主色 / 进度条副色 / Emoji） */
const EMOTION_META: Record<EmotionLabel, { emoji: string; color: string; barColor: string }> = {
  positive: { emoji: '😊', color: '#52C41A', barColor: '#73D13D' },
  neutral: { emoji: '😌', color: '#1677FF', barColor: '#4096FF' },
  negative: { emoji: '😢', color: '#F5222D', barColor: '#FF7875' },
};

/** 情绪中文名（与后端 EMOTION_KEY 一致） */
const EMOTION_ZH_LABEL: Record<EmotionLabel, string> = {
  positive: '高兴',
  neutral: '平静',
  negative: '悲伤',
};

/** 由当前特征序列 + 窗口计算"频段观察"（真实数据，不造假） */
interface BandObs {
  latest: number;    // 该频段各通道"最新值"的平均
  mean: number;      // 该频段各通道"窗口均值"的平均
  strong: boolean;   // 当前是否高于近期均值
}

function computeBandObs(eegData: Record<string, number[]>, featureNames: string[]): {
  alpha: BandObs | null;
  beta: BandObs | null;
  top: { label: string; value: number } | null;
} {
  const sum = { α: { latest: 0, mean: 0, n: 0 }, β: { latest: 0, mean: 0, n: 0 } };
  let top: { label: string; value: number } | null = null;
  let topVal = -Infinity;
  for (const name of featureNames) {
    const meta = featureMeta(name);
    const stats = windowStats(eegData[name] ?? []);
    if (!meta || !stats) continue;
    const bucket = sum[meta.band];
    bucket.latest += stats.latest;
    bucket.mean += stats.mean;
    bucket.n += 1;
    if (stats.latest > topVal) {
      topVal = stats.latest;
      top = { label: `通道${meta.channel}·${meta.band}`, value: stats.latest };
    }
  }
  const toObs = (k: 'α' | 'β'): BandObs | null => {
    const b = sum[k];
    if (b.n === 0) return null;
    const latest = b.latest / b.n;
    const mean = b.mean / b.n;
    return { latest, mean, strong: latest > mean };
  };
  return { alpha: toObs('α'), beta: toObs('β'), top };
}

export default function EmotionCard({ result, recognizing, stopped, eegData, featureNames }: EmotionCardProps) {
  const renderBody = () => {
    // 已停止：显示"识别已停止"
    if (stopped) {
      return (
        <>
          <div className="emotion-big" style={{ color: '#86909C' }}>
            识别已停止
          </div>
          <Typography.Paragraph type="secondary">当前不再更新识别结果</Typography.Paragraph>
        </>
      );
    }

    // 无结果（初始状态）
    if (!result) {
      return (
        <>
          <div className="emotion-big" style={{ color: '#C9CDD4' }}>暂无识别结果</div>
          <Typography.Paragraph type="secondary">
            {recognizing ? '正在识别，请稍候…' : '点击「开始识别」开始真实情绪识别'}
          </Typography.Paragraph>
        </>
      );
    }

    const meta = EMOTION_META[result.emotion];
    const percent = Math.round(result.confidence * 100);
    const obs = computeBandObs(eegData, featureNames);

    return (
      <>
        <div className="emotion-big" style={{ color: meta.color }}>
          {meta.emoji} {result.emotion_zh}
        </div>
        <Space wrap>
          <Tag color={result.emotion === 'neutral' ? 'blue' : result.emotion === 'positive' ? 'green' : 'red'}>
            置信度 {percent}%
          </Tag>
          <Tag>{result.model_name}</Tag>
          {result.true_label_zh && (
            <Tag>真实标签：{result.true_label_zh}</Tag>
          )}
          {recognizing && <Tag color="processing">识别中</Tag>}
        </Space>
        <Progress
          percent={percent}
          strokeColor={{ '0%': meta.barColor, '100%': meta.color }}
          style={{ margin: '8px 0' }}
        />

        {/* 各类情绪概率（真实模型输出） */}
        {result.probabilities && (
          <div style={{ marginBottom: 4 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>📊 各类情绪概率（真实模型输出）</Typography.Text>
            {(['positive', 'neutral', 'negative'] as EmotionLabel[]).map((k) => {
              const p = result.probabilities?.[k] ?? 0;
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ width: 64, fontSize: 12 }}>
                    {EMOTION_META[k].emoji} {EMOTION_ZH_LABEL[k]}
                  </span>
                  <Progress
                    percent={Math.round(p * 100)}
                    size="small"
                    strokeColor={EMOTION_META[k].color}
                    style={{ flex: 1, marginBottom: 0 }}
                    format={() => `${(p * 100).toFixed(1)}%`}
                  />
                </div>
              );
            })}
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4, marginTop: 4 }}>
              📈 置信度 {percent}% = 模型判断为「{result.emotion_zh}」的把握程度；三个概率之和为 100%。
            </Typography.Paragraph>
          </div>
        )}

        {/* 特征观察（真实计算，辅助理解） */}
        <Collapse ghost size="small" style={{ marginTop: 4 }}>
          <Collapse.Panel header="🔍 特征观察（辅助理解，非模型内部逻辑）" key="1">
            {obs.alpha && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 2 }}>
                🔵 α 频段当前均值 {obs.alpha.latest.toFixed(2)}（近期均值 {obs.alpha.mean.toFixed(2)}，
                整体{obs.alpha.strong ? '偏强' : '偏弱'}）→ α 偏向{obs.alpha.strong ? '强' : '弱'}，通常对应{obs.alpha.strong ? '平静/放松' : '平静度偏低'}（科普）
              </Typography.Paragraph>
            )}
            {obs.beta && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 2 }}>
                🟠 β 频段当前均值 {obs.beta.latest.toFixed(2)}（近期均值 {obs.beta.mean.toFixed(2)}，
                整体{obs.beta.strong ? '偏强' : '偏弱'}）→ β 偏向{obs.beta.strong ? '强' : '弱'}，通常对应{obs.beta.strong ? '专注/警觉' : '专注度偏低'}（科普）
              </Typography.Paragraph>
            )}
            {obs.top && (
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
                当前最强特征：<b>{obs.top.label}</b>（原始值 {obs.top.value.toFixed(2)}）
              </Typography.Paragraph>
            )}
          </Collapse.Panel>
        </Collapse>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          来源：{result.data_source} ｜ 时间：{new Date(result.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
        </Typography.Text>
      </>
    );
  };

  return (
    <Card size="small" title="D · 当前情绪识别结果">
      {renderBody()}
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        ⚠️ 结果由真实 SVM 模型（训练自 Kaggle emotions.csv）预测；本系统仅用于教学与算法演示，
        不用于医疗诊断。
      </Typography.Paragraph>
    </Card>
  );
}
