# 脑电情绪识别系统（真实数据 · 真实 SVM）

> 一个课程演示用的 EEG 情绪识别系统。**后端用 Kaggle「EEG Brainwave Dataset: Feeling Emotions」的真实数据 `emotions.csv` 训练一个真实的 SVM（RBF 核）模型**，前端通过 WebSocket 回放数据集中的真实样本，实时展示「特征流 + FFT 分布 + 情绪预测」，并把模型预测和数据集自带的真实标签做对照。

> ⚠️ **免责声明：本系统仅用于教学与算法演示，不用于医疗诊断。** 预测来自真实模型，但数据为公开数据集采集，不代表对任何人的真实情绪或健康状况的判定。

---

## 1. 项目简介

| 项 | 说明 |
|---|---|
| 数据 | Kaggle `emotions.csv`：Muse 4 通道头带脑电统计特征，**2132 行 × 2548 个特征** + 1 列标签 |
| 标签 | `POSITIVE` → 高兴（😊）、`NEUTRAL` → 平静（😌）、`NEGATIVE` → 悲伤（😢） |
| 模型 | 真实 SVM（RBF 核，`C=10`），scikit-learn，**测试集准确率 99.06%**（实测） |
| 通信 | REST（`/api/predict`、`/api/status`…）+ WebSocket（`/ws/eeg-stream` 回放与预测） |
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts 5 |

**重要说明（与你最初的设想不同）**：这个数据集**不是** 62 通道原始脑电，而是把 4 通道 Muse 头带信号做特征工程得到的 2548 维统计特征（mean / stddev / entropy / fft / moments / covmat / …，α/β 频段）。所以本系统**没有真实"波形"**，而是把真实样本**一行一行回放**，对每一行用真实 SVM 给预测。这是最诚实、也最容易演示的方式。

---

## 2. 项目结构

```text
eeg-emotion-recognition/
├── backend/
│   ├── main.py               # 单文件后端：数据加载、SVM 训练/加载、REST、WebSocket 回放
│   └── requirements.txt      # Python 依赖
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # 主页面与全局状态
│   │   ├── api.ts            # REST + WebSocket（含自动重连）
│   │   ├── types.ts          # 前后端共享类型
│   │   ├── featureMeta.ts    # 特征名解析（通道/频段/颜色/含义），供各组件标注用
│   │   ├── main.tsx
│   │   ├── index.css
│   │   └── components/
│   │       ├── ControlPanel.tsx     # 左侧控制面板
│   │       ├── WaveformChart.tsx    # 实时特征流图（8 线，4 通道 × α/β 均值）
│   │       ├── SpectrumChart.tsx    # α 频段能量分布图（含真实峰值标记）
│   │       ├── FeatureIndicator.tsx # 特征强度指示（实时值 + 强弱条 + 倾向）
│   │       └── EmotionCard.tsx      # 当前识别结果卡片（含概率分布与特征观察）
│   ├── package.json
│   └── vite.config.ts
├── data/
│   └── emotions.csv          # 数据集（约 51MB，需下载，见第 3 节）
├── models/
│   └── emotion_svm.pkl       # 训练好的模型（首次启动自动生成）
├── docs/
│   └── code_explanation.md   # 代码逐文件中文解释 + 数据集/算法说明
└── README.md
```

---

## 3. 安装步骤

### 3.1 下载数据集 `emotions.csv`

两种方式任选其一，把文件放到 `data/emotions.csv`：

**方式 A：网页下载（推荐，最简单）**
1. 打开 https://www.kaggle.com/datasets/birdy654/eeg-brainwave-dataset-feeling-emotions
2. 点击右上角 **Download**（51MB 的 zip）
3. 解压得到 `emotions.csv`，放到 `e:\作业\dl\brain\data\emotions.csv`

**方式 B：kagglehub（需要 Kaggle 账号 API Key）**

```python
import kagglehub
path = kagglehub.dataset_download("birdy654/eeg-brainwave-dataset-feeling-emotions")
# 把 path 下的 emotions.csv 复制到 data/ 即可
```

### 3.2 安装后端依赖（Python）

后端推荐用 conda 环境（本机已有 `SEED` 环境，内含 sklearn/pandas 等）：

```bash
conda activate SEED
cd backend
pip install -r requirements.txt
```

> 已安装过可跳过。若用普通环境，也只要 `fastapi`、`uvicorn[standard]`、`numpy`、`pandas`、`scikit-learn`、`joblib`。

### 3.3 安装前端依赖（Node）

```bash
cd frontend
npm install
```

---

## 4. 运行

**终端 1：启动后端**（首次启动会自动训练 SVM 并保存 `models/emotion_svm.pkl`，之后直接加载）

```bash
conda activate SEED
cd backend
uvicorn main:app --reload --port 8000
```

验证：浏览器打开 `http://localhost:8000/api/health`，应返回 `{"status":"ok","model":"SVM（RBF 核）",...}`。

**终端 2：启动前端**

```bash
cd frontend
npm run dev
```

打开 `http://localhost:5173`。页面顶部绿色「已连接」、特征流开始滚动即成功。

**体验流程：**

```text
① 打开页面 → 特征流自动滚动、FFT 分布实时刷新（真实数据回放）
② 点击「开始识别」→ 每行真实样本都会被 SVM 预测，结果卡片 + 历史实时更新
③ 观察「预测 vs 真实标签」是否一致
④ 体验「暂停回放 / 继续回放 / 停止识别 / 重置」
```

---

## 5. 如何训练 / 重训模型

- **首次启动自动训练**：`data/emotions.csv` 存在且 `models/emotion_svm.pkl` 不存在时，后端会自动训练并保存。
- **重新训练**：删除 `models/emotion_svm.pkl`，重启后端即可（约 6 秒）。
- **换数据**：通过环境变量指定别的 CSV（列结构需相同：最后一列是 `label`）：

  - PowerShell：`$env:EEG_DATA_PATH="D:\我的数据\emotions.csv"` 后再启动后端
  - 或者直接改 `backend/main.py` 顶部的 `DATA_PATH`

训练参数（RBF 核、C=10）在 `backend/main.py` 的 `train_model()` 里，想调可以改。

---

## 6. 情绪标签与修改方法

中文显示是在**后端** `EMOTION_ZH` 字典里做映射的：

```python
EMOTION_ZH = {"POSITIVE": "高兴", "NEUTRAL": "平静", "NEGATIVE": "悲伤"}
```

想改中文显示（比如 `NEUTRAL` → 「放松」），改这里即可，前端自动生效。想让**模型**重新学不同标签，需要换带新标签的数据集并重训。

---

## 7. 后端接口一览

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/config` | 数据集与模型信息（样本数、特征数、准确率…） |
| GET | `/api/status` | 系统实时状态 |
| POST | `/api/predict` | 接收一条样本的 2548 个特征 → 返回情绪预测 |
| POST | `/api/recognition/start` | 开始识别（回放时逐行预测） |
| POST | `/api/recognition/pause` / `/resume` | 暂停 / 继续回放 |
| POST | `/api/recognition/stop` | 停止识别 |
| POST | `/api/recognition/reset` | 重置演示（清空结果与历史） |
| GET | `/api/recognition/current` | 最近一次识别结果 |
| GET / DELETE | `/api/history` | 历史记录（最多 10 条） |

WebSocket：`/ws/eeg-stream` — 每 300ms 推送一行真实样本（8 个代表特征值 + 250 个 FFT 系数 + 真实标签 + SVM 预测），每 10 行附带一条状态消息。

---

## 8. 常见问题（FAQ）

**Q：页面显示"无法连接到后端"？**
A：确认终端 1 的后端已启动、端口 8000 未被占用；浏览器访问 `http://localhost:8000/api/health` 测试。

**Q：为什么没有 62 通道的波形图？**
A：这个数据集不是 62 通道原始脑电，而是 4 通道头带提取的 2548 维统计特征。波形图被替换为"真实特征流"（8 条特征线随时间滚动），频谱图展示当前样本的 FFT 系数。全部是真实数据。

**Q：特征图里数值怎么对不上？**
A：真实特征量纲差异巨大（如 `mean_2_a` 可到 -356）。特征流图对每条线做了 **min-max 归一化**，只用于看趋势；数值原始值可在 FFT 图或 `POST /api/predict` 返回里看。

**Q：准确率 99% 是编的吗？**
A：不是。这是本机用 `emotions.csv` 真实跑出来的测试集准确率（80% 训练 / 20% 测试，分层抽样，427 个测试样本）。该数据集类别可分性强，SVM 拿高分是正常现象。

**Q：如何改情绪中文名？**
A：改 `backend/main.py` 的 `EMOTION_ZH` 字典（见第 6 节）。

**Q：前端端口 / 后端端口能改吗？**
A：前端端口在 `frontend/vite.config.ts`，后端端口用 `--port` 参数；改了后端端口要同步改 `frontend/src/api.ts` 里的 `WS_BASE`。

**Q：`emotions.csv` 会不会被 git 提交？**
A：`.gitignore` 已忽略 `data/*.csv` 与 `models/*.pkl`（文件大，不入库）。

---

## 9. 进一步阅读

- 数据集：https://www.kaggle.com/datasets/birdy654/eeg-brainwave-dataset-feeling-emotions
- 你的原始算法 notebook：`SEED_EEG_CLASSIFICATION-checkpoint.ipynb`（详见 `docs/code_explanation.md` 第 1 节的分析）
- 每个关键文件的逐行中文解释：`docs/code_explanation.md`
