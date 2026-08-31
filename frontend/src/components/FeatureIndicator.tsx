/**
 * 特征强度指示：实时展示当前 8 个特征（4 通道 × α/β 均值）的
 * 最新值、相对"近期窗口"的强弱条与偏强/偏弱标注。
 * 所有数值来自前端收到的真实回放数据，不造假。
 * 底部"情绪倾向"为科普规则（α/β 相对强弱 → 一般对应），非模型结果；
 * 模型结果以「当前情绪识别结果」卡片为准。
 */
import { Typography } from 'antd';
import type { DisplayFeature } from '../types';
import { featureMeta } from '../featureMeta';

interface FeatureIndicatorProps {
  features: DisplayFeature[];              // 展示特征（name + label）
  data: Record<string, number[]>;          // 每个特征的数值序列
}

/** 一行特征（latest/mean 已保证非空） */
interface Row {
  name: string;
  label: string;
  band: 'α' | 'β' | null;
  color: string;
  latest: number;
  mean: number;
  vals: number[];
}

/** 计算最新值在窗口 [min, max] 中的相对位置（0–100） */
function strengthPct(values: number[]): number {
  if (values.length < 2) return 0;
  const latest = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return Math.max(0, Math.min(100, ((latest - min) / span) * 100));
}

export default function FeatureIndicator({ features, data }: FeatureIndicatorProps) {
  const rows: Row[] = features
    .map((f) => {
      const vals = data[f.name] ?? [];
      const meta = featureMeta(f.name);
      const latest = vals.length ? vals[vals.length - 1] : null;
      const mean = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      return { name: f.name, label: meta?.label ?? f.label, band: meta?.band ?? null, color: meta?.color ?? '#1677FF', latest, mean, vals };
    })
    .filter((r): r is Row => r.latest !== null && r.mean !== null);

  const hasData = rows.length > 0;

  // 情绪倾向（科普规则）：α 频段当前均值 vs β 频段当前均值
  let alphaAvg = 0;
  let betaAvg = 0;
  let alphaN = 0;
  let betaN = 0;
  for (const r of rows) {
    if (r.band === 'α') { alphaAvg += r.latest; alphaN += 1; }
    if (r.band === 'β') { betaAvg += r.latest; betaN += 1; }
  }
  const tendency = alphaN && betaN
    ? (alphaAvg / alphaN >= betaAvg / betaN ? '平静 / 放松（α 主导）' : '专注 / 警觉（β 主导）')
    : null;

  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        实时显示当前 8 个特征的最新值与"相对近期窗口"的强弱（绿色=偏强，红色=偏弱）。
      </Typography.Text>

      {!hasData && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
          等待数据…
        </Typography.Paragraph>
      )}

      {hasData && (
        <>
          {rows.map((r) => {
            const strong = r.latest > r.mean;
            return (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: r.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ width: 76, fontSize: 12 }}>{r.label}</span>
                <span style={{ width: 78, fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {r.latest.toFixed(2)}
                </span>
                <div style={{ flex: 1, height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${strengthPct(r.vals)}%`,
                      height: 6,
                      background: strong ? '#52C41A' : '#F5222D',
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ width: 96, fontSize: 12, color: strong ? '#52C41A' : '#F5222D' }}>
                  {strong ? '偏强' : '偏弱'}
                </span>
              </div>
            );
          })}

          {tendency && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
              🧭 当前倾向：<b>{tendency}</b>
              <span style={{ color: '#86909c' }}>
                （科普规则：α 均值强于 β 通常对应平静/放松，β 强于 α 通常对应专注/警觉；
                非模型结果，请以识别卡片为准）
              </span>
            </Typography.Paragraph>
          )}
        </>
      )}
    </div>
  );
}
