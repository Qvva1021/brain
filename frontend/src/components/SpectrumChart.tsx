/**
 * α 频段 FFT 能量分布图：展示"当前一行真实样本"的 FFT 系数（fft_0_a .. fft_249_a）。
 * 这 250 个点全是 α 频段的系数，所以标题如实标注为"α 频段能量分布"；
 * 横轴是 FFT 系数序号，不是绝对频率刻度（数据集未提供采样率，不臆造 Hz 数值）。
 * 图内用虚线标出当前样本的真实能量峰值位置。
 */
import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import { Collapse, Typography } from 'antd';

interface SpectrumChartProps {
  bins: number[];    // 横坐标（0..249）
  values: number[];  // 当前行的 FFT 系数
  height?: number;
}

export default function SpectrumChart({ bins, values, height = 220 }: SpectrumChartProps) {
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

  // 数据更新时刷新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bins.length === 0) return;

    // 真实能量峰值位置（argmax）
    let peakIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[peakIdx]) peakIdx = i;
    }
    const peakBin = bins[peakIdx];

    chart.setOption({
      animation: false,
      grid: { left: 48, right: 24, top: 16, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = (Array.isArray(params) ? params : [params]) as { axisValue?: number; value?: number[] }[];
          const first = list[0];
          if (!first) return '';
          const bin = first.axisValue;
          const v = Array.isArray(first.value) ? first.value[1] : first.value;
          return `FFT 系数序号 ${bin}<br/>α 频段能量（系数值）：${typeof v === 'number' ? v.toFixed(2) : v}`;
        },
      },
      xAxis: { type: 'value', min: bins[0], max: bins[bins.length - 1], name: 'FFT 系数序号（0–249）' },
      yAxis: { type: 'value', name: '系数值（能量）' },
      series: [
        {
          type: 'line',
          data: bins.map((b, i) => [b, values[i]]),
          showSymbol: false,
          lineStyle: { color: '#1677FF', width: 1.5 },
          areaStyle: { color: 'rgba(22, 119, 255, 0.15)' },
          // 真实峰值：虚线标注序号，不臆造频率
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#FF7A45', width: 1.5 },
            label: { formatter: `峰值 @${peakBin}` },
            data: [{ xAxis: peakBin }],
          },
        },
      ],
    });
  }, [bins, values]);

  const hasData = bins.length > 0;

  // 计算真实峰值（供图下方说明使用）
  let peakBin = 0;
  let peakVal = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > values[peakBin]) {
      peakBin = i;
      peakVal = values[i];
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />
      {!hasData && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86909c' }}>
          等待数据…
        </div>
      )}
      {hasData && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          当前样本 α 频段能量峰值：序号 <b>{peakBin}</b>（系数值 {peakVal.toFixed(2)}），已用橙色虚线标出。
        </Typography.Text>
      )}
      <Collapse ghost size="small" style={{ marginTop: 4 }}>
        <Collapse.Panel header="🧠 科普：EEG 频段 ↔ 情绪（一般脑电知识）" key="1">
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 4 }}>
            δ（1–4Hz）深睡/困倦 ｜ θ（4–8Hz）放松/冥想 ｜ α（8–13Hz）平静/闭眼休息 ｜
            β（13–30Hz）专注/思考 ｜ γ（30Hz+）高度认知。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            ⚠️ 本图展示的是数据集里的 <b>α 频段</b> 250 个 FFT 系数（fft_0_a…fft_249_a），
            横轴是系数序号而非绝对频率；上述五频段仅作为一般 EEG 科普参考，不代表本图坐标刻度。
          </Typography.Paragraph>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
}
