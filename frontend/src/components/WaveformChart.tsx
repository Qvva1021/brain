/**
 * 实时特征流图：8 条真实特征线（4 通道 × α/β 频段均值）上下错位、横向滚动。
 * 每条线 = 某通道某频段的活动均值，值越大 → 该频段活动越强。
 * 因为真实特征量纲差异很大（如 mean_2_a 可达 -356），这里对每条线做 min-max 归一化，
 * 只用于"看趋势"；每条线的原始数值见「特征强度指示」。
 */
import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import { Collapse, Typography } from 'antd';
import { featureMeta } from '../featureMeta';

interface WaveformChartProps {
  channels: string[];                          // 特征名（如 mean_0_a）
  data: Record<string, number[]>;              // 每个特征的数值序列
  height?: number;
}

/** 每条线的纵向步长（归一化后每条线占一个小带） */
const OFFSET = 10;
/** 每条线带内的高度 */
const STEP = 8;

/** tooltip 参数的最小类型（避免引入 echarts 内部类型） */
interface TooltipParam {
  seriesName?: string | number;
  value?: number | string;
  data?: { original?: number };
}

export default function WaveformChart({ channels, data, height = 300 }: WaveformChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = echarts.init(containerRef.current);
    return () => {
      chartRef.current?.dispose();
    };
  }, []);

  // 数据更新时刷新曲线
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 对每条特征线做 min-max 归一化，映射到它自己的小带；颜色按频段区分（α 蓝系 / β 橙系）
    const series = channels.map((name, i) => {
      const vals = data[name] ?? [];
      const meta = featureMeta(name);
      const color = meta?.color ?? '#1677FF';
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 1;
      const span = max - min || 1;
      const base = i * OFFSET;
      const line = vals.map((v) => base + ((v - min) / span) * STEP);
      return {
        name,                                   // 保留原始特征名，便于 tooltip / 图例解析
        type: 'line' as const,
        showSymbol: false,
        // 数据项同时携带归一化值（value）和原始值（original），tooltip 里展示真实数值
        data: line.map((v, idx) => ({ value: v, original: vals[idx] })),
        lineStyle: { color, width: 1.2 },
        itemStyle: { color },
      };
    });

    const first = data[channels[0]] ?? [];
    chart.setOption({
      animation: false,
      grid: { left: 8, right: 8, top: 8, bottom: 30 },
      legend: {
        bottom: 0,
        itemWidth: 12,
        textStyle: { fontSize: 11 },
        type: 'scroll',
        // 图例只显示"通道·频段"，如 通道0·α
        formatter: (name: string) => featureMeta(name)?.label ?? name,
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = (Array.isArray(params) ? params : [params]) as TooltipParam[];
          return list
            .map((p) => {
              const name = String(p.seriesName ?? '');
              const meta = featureMeta(name);
              const norm = typeof p.value === 'number' ? p.value.toFixed(2) : String(p.value);
              const orig = p.data?.original;
              if (!meta) return `${name}: ${norm}`;
              const head = orig !== undefined
                ? `<b>${meta.label}</b> 归一化 ${norm} ｜ 原始值 ${orig.toFixed(2)}`
                : `<b>${meta.label}</b> 归一化 ${norm}`;
              return `${head}<br/><span style="color:#86909c">${meta.meaning}</span>`;
            })
            .join('<br/><br/>');
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: first.map((_, i) => i),
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'value',
        min: -OFFSET,
        max: channels.length * OFFSET,
        show: false,
      },
      series,
    });
  }, [data, channels]);

  const hasData = channels.some((ch) => (data[ch]?.length ?? 0) > 0);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />
      {!hasData && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86909c' }}>
          等待数据…
        </div>
      )}
      <Collapse ghost size="small" style={{ marginTop: 4 }}>
        <Collapse.Panel header="📖 如何解读特征流图" key="1">
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            8 条线 = <b>4 个通道</b> × <b>2 个频段</b>的活动均值（通道0–3，数据集的 Muse 头带通道编号）。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            🔵 <b>α 频段</b>（8–13Hz）：通常与放松、平静、闭眼休息相关（科普）；<b>值越大 → α 活动越强</b>。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            🟠 <b>β 频段</b>（13–30Hz）：通常与专注、思考、警觉相关（科普）；<b>值越大 → β 活动越强</b>。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            本图对每条线做了 min-max 归一化，只用于看趋势；悬停可看原始值，每行实时数值见「特征强度指示」。
          </Typography.Paragraph>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
