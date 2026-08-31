/**
 * 主页面：整体布局（Header / Sider / Content / Footer）+ 全局状态 + 事件分发。
 * 真实模型版：后端把 emotions.csv 的样本一行一行经 WebSocket 回放，
 * 前端展示"特征流 + FFT 分布 + 真实 SVM 预测"。状态均来自后端，前端不本地造假。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Drawer, Layout, List, Space, Table, Tag, Typography } from 'antd';
import { api, connectWebSocket } from './api';
import type { EmotionResult, LogItem, LogLevel, RunState, SystemConfig } from './types';
import ControlPanel from './components/ControlPanel';
import WaveformChart from './components/WaveformChart';
import SpectrumChart from './components/SpectrumChart';
import EmotionCard from './components/EmotionCard';
import FeatureIndicator from './components/FeatureIndicator';

const { Header, Sider, Content, Footer } = Layout;

/** 与后端 DISPLAY_FEATURES 对应的特征名（未拉到 config 时的兜底）：4 通道 × α/β 均值 */
const DEFAULT_FEATURES = [
  'mean_0_a', 'mean_1_a', 'mean_2_a', 'mean_3_a',
  'mean_0_b', 'mean_1_b', 'mean_2_b', 'mean_3_b',
];

/** 前端保留的特征流长度（行数）；后端 300ms 推一行 */
const MAX_POINTS = 80;

/** 运行状态中文名 */
const RUN_STATE_LABEL: Record<RunState, string> = {
  idle: '空闲',
  streaming: '回放中',
  recognizing: '识别中',
  paused: '已暂停',
  stopped: '已停止',
};

/** 本版本固定的模型与特征（真实，不可切换） */
const MODEL_NAME = 'SVM（RBF 核）';

export default function App() {
  const { message } = AntApp.useApp();

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [runState, setRunState] = useState<RunState>('idle');
  const [currentResult, setCurrentResult] = useState<EmotionResult | null>(null);
  const [history, setHistory] = useState<EmotionResult[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [eegData, setEegData] = useState<Record<string, number[]>>({});
  const [fftData, setFftData] = useState<{ bins: number[]; values: number[] }>({ bins: [], values: [] });
  const [stopped, setStopped] = useState(false); // 是否刚停止识别（用于卡片显示"识别已停止"）
  const [helpOpen, setHelpOpen] = useState(false);

  /** 记录上一次日志的情绪，只在情绪变化时写日志（避免每 300ms 刷屏） */
  const lastLoggedEmotion = useRef<string>('');

  /** 追加一条运行日志（最多 50 条，新日志在最上） */
  const addLog = useCallback((level: LogLevel, text: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs((prev) => [{ time, level, message: text }, ...prev].slice(0, 50));
  }, []);

  const channels = config?.display_features.map((f) => f.name) ?? DEFAULT_FEATURES;
  const displayFeatures = config?.display_features
    ?? DEFAULT_FEATURES.map((n) => ({ name: n, label: n }));

  // 健康检查：每 2 秒轮询后端是否在线（连接状态不本地伪造）
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.getHealth();
        if (!cancelled) setBackendConnected(true);
      } catch {
        if (!cancelled) setBackendConnected(false);
      }
    };
    check();
    const id = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // 挂载时拉取配置、当前结果、历史
  useEffect(() => {
    (async () => {
      try {
        const [cfg, cur, hist] = await Promise.all([
          api.getConfig(),
          api.getCurrentResult(),
          api.getHistory(),
        ]);
        setConfig(cfg);
        setCurrentResult(cur.current_result);
        setHistory([...hist.items].reverse());
        addLog('success', `后端连接成功：${cfg.n_rows} 个真实样本，SVM 测试准确率 ${Math.round(cfg.model_info.accuracy * 100)}%`);
      } catch {
        addLog('error', '无法连接到后端，请确认后端已启动');
      }
    })();
  }, [addLog]);

  // WebSocket：真实数据回放 + 实时预测（自动重连）
  useEffect(() => {
    const closeEeg = connectWebSocket('/ws/eeg-stream', (msg) => {
      if (msg.type === 'eeg') {
        const d = msg.data;
        // 特征流：每个特征追加一个点
        setEegData((prev) => {
          const next: Record<string, number[]> = {};
          for (const name of d.feature_names) {
            const v = d.values[name];
            if (v === undefined) continue;
            next[name] = [...(prev[name] ?? []), v].slice(-MAX_POINTS);
          }
          return next;
        });
        setFftData({ bins: d.fft_bins, values: d.fft_values });

        // 识别中才会有预测结果
        if (d.prediction) {
          setCurrentResult(d.prediction);
          setStopped(false);
          setHistory((prev) => [d.prediction as EmotionResult, ...prev].slice(0, 10));
          if (d.prediction.emotion_zh !== lastLoggedEmotion.current) {
            lastLoggedEmotion.current = d.prediction.emotion_zh;
            addLog('success', `识别：${d.prediction.emotion_zh}（置信度 ${Math.round(d.prediction.confidence * 100)}%，真实标签 ${d.true_label_zh}）`);
          }
        }
      } else if (msg.type === 'status') {
        setRunState(msg.data.run_state);
      }
    });

    return () => {
      closeEeg();
    };
  }, [addLog]);

  /* ---------- 事件处理 ---------- */

  const handleStart = async () => {
    try {
      const res = await api.startRecognition(MODEL_NAME, '2548 维统计特征');
      setRunState('recognizing');
      setStopped(false);
      lastLoggedEmotion.current = '';
      addLog('success', res.message);
      message.success(res.message);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '开始识别失败');
      addLog('error', '开始识别失败');
    }
  };

  const handlePause = async () => {
    try {
      const res = await api.pauseRecognition();
      setRunState('paused');
      addLog('info', res.message);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '暂停失败');
    }
  };

  const handleResume = async () => {
    try {
      const res = await api.resumeRecognition();
      setRunState('recognizing');
      addLog('info', res.message);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '继续失败');
    }
  };

  const handleStop = async () => {
    try {
      const res = await api.stopRecognition();
      setRunState('streaming');
      setStopped(true);
      addLog('warning', res.message);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '停止识别失败');
    }
  };

  const handleReset = async () => {
    try {
      const res = await api.resetRecognition();
      setRunState('streaming');
      setStopped(false);
      setCurrentResult(null);
      setHistory([]);
      lastLoggedEmotion.current = '';
      addLog('info', `演示已重置（清空历史 ${res.history_count} 条）`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重置失败');
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.clearHistory();
      setHistory([]);
      addLog('info', '已清空历史记录');
    } catch (e) {
      message.error(e instanceof Error ? e.message : '清空历史失败');
    }
  };

  /* ---------- 渲染 ---------- */

  const isRecognizing = runState === 'recognizing' || runState === 'paused';

  return (
    <Layout className="app-layout">
      {/* 顶部导航栏 */}
      <Header className="app-header">
        <div>
          <div className="header-title">EEG Emotion Recognition System</div>
          <div className="header-subtitle">脑电情绪识别系统（真实 SVM 模型）</div>
        </div>
        <div className="header-right">
          <span>
            <span className={`status-dot ${backendConnected ? 'online' : 'offline'}`} />
            {backendConnected ? '已连接' : '未连接'}
          </span>
          <Tag color="blue">真实数据 · SVM</Tag>
          <Button size="small" type="text" style={{ color: '#fff' }} onClick={() => setHelpOpen(true)}>
            ? 帮助
          </Button>
        </div>
      </Header>

      <Layout>
        {/* 左侧控制面板 + 运行日志 */}
        <Sider width={340} theme="light" className="app-sider">
          <ControlPanel
            config={config}
            backendConnected={backendConnected}
            runState={runState}
            onStart={handleStart}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
            onReset={handleReset}
          />
          <Card size="small" title="运行日志" style={{ marginTop: 12 }}>
            {logs.length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>暂无日志</Typography.Text>
            ) : (
              <List
                size="small"
                dataSource={logs}
                split={false}
                renderItem={(item) => (
                  <List.Item style={{ padding: '2px 0' }}>
                    <Typography.Text className={`log-${item.level}`} style={{ fontSize: 12 }}>
                      [{item.time}] {item.message}
                    </Typography.Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Sider>

        {/* 主显示区 */}
        <Content className="app-content">
          <Card
            size="small"
            title="A · 实时特征流（真实 emotions.csv 回放）"
            extra={<Tag color="blue">真实数据</Tag>}
          >
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              每条线是一个真实特征，横轴为数据行序号（约每 0.3 秒一行）；为便于观察，各特征已归一化。
            </Typography.Text>
            <WaveformChart channels={channels} data={eegData} height={300} />
          </Card>

          <Card size="small" title="B · 当前样本 α 频段能量分布（真实数据 · fft_0_a…fft_249_a）">
            <Space style={{ marginBottom: 8 }} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                展示"当前这一行样本"的 α 频段 FFT 系数能量分布，橙色虚线为该样本真实能量峰值。
              </Typography.Text>
            </Space>
            <SpectrumChart bins={fftData.bins} values={fftData.values} height={220} />
          </Card>

          <Card size="small" title="C · 特征强度指示（8 特征实时值）">
            <FeatureIndicator features={displayFeatures} data={eegData} />
          </Card>

          <div className="result-row">
            <EmotionCard
              result={currentResult}
              recognizing={isRecognizing}
              stopped={stopped}
              eegData={eegData}
              featureNames={channels}
            />
            <Card
              size="small"
              title="E · 情绪历史记录"
              extra={<Button size="small" onClick={handleClearHistory}>清空</Button>}
            >
              {history.length === 0 ? (
                <Typography.Text type="secondary">暂无历史记录</Typography.Text>
              ) : (
                <Table
                  size="small"
                  rowKey={(r) => `${r.timestamp}-${r.confidence}`}
                  pagination={false}
                  dataSource={history}
                  columns={[
                    {
                      title: '时间',
                      dataIndex: 'timestamp',
                      render: (t: string) => new Date(t).toLocaleTimeString('zh-CN', { hour12: false }),
                    },
                    { title: '预测', dataIndex: 'emotion_zh' },
                    { title: '真实', dataIndex: 'true_label_zh' },
                    {
                      title: '置信度',
                      dataIndex: 'confidence',
                      render: (c: number) => `${Math.round(c * 100)}%`,
                    },
                  ]}
                />
              )}
            </Card>
          </div>
        </Content>
      </Layout>

      {/* 底部状态栏 */}
      <Footer className="app-footer">
        <span>后端:{backendConnected ? '已连接' : '未连接'}</span>
        <span>数据源:{config?.data_source ?? '—'}</span>
        <span>样本数:{config?.n_rows ?? '—'}</span>
        <span>特征数:{config?.n_features ?? '—'}</span>
        <span>模型:{MODEL_NAME}</span>
        <span>状态:{RUN_STATE_LABEL[runState]}</span>
      </Footer>

      {/* 帮助抽屉：完整使用指南 */}
      <Drawer title="帮助与说明" width={460} open={helpOpen} onClose={() => setHelpOpen(false)}>
        <Typography.Title level={5}>这是什么？</Typography.Title>
        <Typography.Paragraph type="secondary">
          用 Kaggle「EEG Brainwave Dataset」训练一个真实 SVM 模型，前端回放数据集中的真实样本，
          并实时展示每一行的情绪预测。
        </Typography.Paragraph>

        <Typography.Title level={5}>界面卡片速览（A–E）</Typography.Title>
        <ul style={{ fontSize: 13 }}>
          <li><b>A 实时特征流</b>：8 条真实特征线滚动（4 通道 × α/β 均值）。</li>
          <li><b>B α 频段能量分布</b>：当前样本的 250 个 α 频段 FFT 系数，橙线为真实能量峰值。</li>
          <li><b>C 特征强度指示</b>：每个特征的实时值 + 相对近期窗口的强弱条。</li>
          <li><b>D 当前情绪识别结果</b>：SVM 预测情绪 + 置信度 + 概率分布 + 真实标签对照。</li>
          <li><b>E 情绪历史记录</b>：最近 10 次预测与真实标签的对照。</li>
        </ul>

        <Typography.Title level={5}>A 波形图怎么看</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          🔵 蓝色系 = <b>α 频段</b>（8–13Hz），通常对应放松/平静；🟠 橙色系 = <b>β 频段</b>（13–30Hz），
          通常对应专注/警觉。线越高 → 该频段活动越强。图中每条线已归一化（只看趋势），
          悬停可看原始值。
        </Typography.Paragraph>

        <Typography.Title level={5}>B 频谱图怎么看</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          横轴是 FFT 系数序号（0–249），纵轴是系数值（能量）；橙色虚线标出当前样本的能量峰值位置。
          这 250 个点都是 α 频段的系数（fft_0_a…fft_249_a），横轴不代表精确频率。
        </Typography.Paragraph>

        <Typography.Title level={5}>D 识别结果怎么看</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          置信度 = 模型判断为某情绪的把握程度；「概率分布」是三个类别的真实概率（合计 100%）。
          「真实标签」是数据集自带的标准答案，用来和模型预测对照；「特征观察」是基于当前
          8 个特征的辅助解读，并非模型内部逻辑（SVM 是黑盒）。
        </Typography.Paragraph>

        <Typography.Title level={5}>数据说明</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          emotions.csv 来自 Muse 4 通道脑电头带，经特征工程得到 2548 维统计特征
          （mean / stddev / entropy / fft / …，α/β 频段），共 2132 个样本，3 类情绪：
          POSITIVE→高兴、NEUTRAL→平静、NEGATIVE→悲伤。没有"时间轴"，系统把每一行当一个瞬间回放。
        </Typography.Paragraph>

        <Typography.Title level={5}>EEG 频段科普（一般脑电知识）</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          δ（1–4Hz）深睡/困倦 ｜ θ（4–8Hz）放松/冥想 ｜ α（8–13Hz）平静/闭眼休息 ｜
          β（13–30Hz）专注/思考 ｜ γ（30Hz+）高度认知。这些是通用脑电常识，
          仅用于帮助理解"频段 ↔ 情绪"的大致对应，不代表本数据集或本模型的精确结论。
        </Typography.Paragraph>

        <Typography.Title level={5}>术语速查</Typography.Title>
        <ul style={{ fontSize: 13 }}>
          <li><b>EEG</b>：脑电信号，头皮电极记录的大脑神经活动的电信号。</li>
          <li><b>SVM</b>：支持向量机，一种经典分类算法，本系统使用 RBF 核。</li>
          <li><b>特征（Feature）</b>：从原始信号算出的数值，模型拿它做判断。</li>
          <li><b>FFT</b>：快速傅里叶变换，把信号按频率拆开看能量分布。</li>
          <li><b>置信度（Confidence）</b>：模型对预测结果的把握程度（0–100%）。</li>
          <li><b>真实标签（True Label）</b>：数据集里记录的情绪"标准答案"。</li>
        </ul>

        <Typography.Title level={5}>免责声明</Typography.Title>
        <Alert
          type="warning"
          showIcon
          message="本系统仅用于教学与算法演示，不用于医疗诊断。"
          description="情绪预测来自真实 SVM 模型，但数据为公开数据集采集，不代表对任何人的真实情绪或健康状况的判定。"
        />
      </Drawer>
    </Layout>
  );
}
