# 代码解释文档（初学者版）

本文按顺序回答三件事：
1. **你的 `.ipynb` 到底做了什么**（你要求"用初学者能懂的语言"解释）
2. **当前系统每个关键文件的作用**（后端、前端）
3. **数据是怎么流动的**（CSV → 模型 → 前端显示），以及**怎么改情绪标签**

---

## 一、你的 notebook：`SEED_EEG_CLASSIFICATION-checkpoint.ipynb`

### 1.1 它在做什么（一句话）

它用 **SEED 数据集**（上海交大的公开脑电数据集）做"脑电 → 3 类情绪"分类，
同时训练了 **6 种机器学习模型 + 1 个深度学习模型（CNN-LSTM）** 做对比。

> ⚠️ **关键提醒**：这个 notebook 用的是 **SEED 数据集**，不是你要用的 Kaggle
> `emotions.csv`。SEED 的输入是 MATLAB 预先算好的 **16150 维特征向量**，
> 而 `emotions.csv` 是 **2548 维特征**。所以 notebook **不能直接套用**，
> 但它的核心套路（标准化 → SVM → 分层切分）我们复用了。

### 1.2 逐段解释

| 代码段 | 作用（大白话） |
|---|---|
| `import ...`（第 1-5 段） | 导入用到的库：`pandas`（处理表格）、`sklearn`（机器学习）、`xgboost`、`torch`、`tensorflow`（深度学习）、`matplotlib`（画图） |
| `cnn_lstm_model()` 函数 | 搭建一个"卷积+长短期记忆"网络，输入是脑电的二维矩阵，输出是情绪类别概率。**本系统没用它** |
| `F1_Score` 类 | 自定义一个评估指标（F1 分数），用来在深度学习训练时监控效果 |
| `loadmat('ftr_arr.mat')` | **加载数据**：读取 MATLAB 的特征文件 `ftr_arr.mat`（16150 维特征） |
| `labels=np.array` | 这行是**残缺的**（notebook 断点，没写完），正常应是从某个文件读取标签（-1/0/1 三类） |
| `train_test_split(test_size=0.2, stratify=labels)` | **切分数据**：80% 训练、20% 测试；`stratify` 保证切分后三类比例不变 |
| `StandardScaler().fit_transform()` | **标准化**：把每个特征的均值变成 0、方差变成 1，避免大数值特征压过小数值特征 |
| `steps` / `grids`（两个大列表） | 定义要比较的 **6 种模型**（逻辑回归、KNN、SVM、MLP 神经网络、随机森林、XGBoost）和各自的**超参数搜索范围**（比如 SVM 的 `C`、`kernel`） |
| `GridSearchCV(..., cv=5)` | **自动调参**：把每种模型的参数组合交叉验证（5 折）试一遍，选最好的 |
| `pickle.dump(clf, f)` | **保存模型**：训练好的模型存成 `.pkl` 文件（我们系统里也是这样保存的） |
| XGBoost 部分 | 单独给 XGBoost 做更细的调参（树的数量、深度、学习率等） |
| CNN-LSTM 部分 | 用深度学习自动提取特征（15992 维），再和手工特征拼起来（综合特征）训练 |

### 1.3 提取出的"核心逻辑"（我们系统复用了这三步）

```text
① 切分数据：80% 训练 / 20% 测试（分层抽样，保证类别比例不变）
② 标准化：StandardScaler（统一量纲）
③ 训练分类器：SVM（scikit-learn 的 SVC）
```

> notebook 里 SVM 只是备选之一（最优是 XGBoost），但对你的 62/2548 维小表格数据，
> **简单 RBF-SVM 就够了**，而且代码最少、最好讲。

### 1.4 回答你的问题

- **用了什么算法？** SVM、逻辑回归、KNN、MLP、随机森林、XGBoost、CNN-LSTM。最优是 XGBoost。
- **输入是什么？** SEED 的 MATLAB 特征向量（16150 维）。你的 `emotions.csv` 是 2548 维。
- **输出是什么？** 3 类情绪。SEED 里是 -1/0/1，你的数据里是 NEGATIVE / NEUTRAL / POSITIVE。

---

## 二、数据：`emotions.csv` 到底是什么

用 pandas 读一下你就知道（2132 行 × 2549 列）：

| 前 8 列 | … | 最后 2 列 |
|---|---|---|
| `mean_0_a` | `stddev_0_a` | … | `fft_749_b` | `label` |

- 每个特征名 = `{统计量}_{通道}_{频段}`，例如 `mean_0_a` = 通道 0 的 α 频段均值。
- 通道编号 0–4（Muse 头带的 4 个电极 + 参考），频段 `a`=α、`b`=β。
- 统计量包括：`mean` 均值、`stddev` 标准差、`entropy` 熵、`fft` 傅里叶系数、
  `moments` 矩、`covmat` 协方差、`logm` 对数能量、`correlate` 相关、`max`/`min`、`eigen` 特征值。
- 标签：`NEGATIVE`（悲伤）、`NEUTRAL`（平静）、`POSITIVE`（高兴），共 2132 行。

**记住**：它没有"时间轴"，每行就是一个独立的"样本"。所以本系统把每行当一个"瞬间"来回放。

---

## 三、后端：`backend/main.py`

### 3.1 这个文件的作用

**单文件**实现全部后端：读数据 → 训练/加载模型 → 提供 HTTP 接口 → 用 WebSocket 把数据
"一行一行"推给前端。文件按 0–7 分节，每节一个功能，从上往下读即可。

### 3.2 关键函数（输入 → 输出）

| 函数 | 输入 | 输出 | 大白话 |
|---|---|---|---|
| `load_dataset()` | （无，读 `data/emotions.csv`） | 字典 `{X, y, feature_cols, df}` | 把表格读成"特征矩阵 X + 标签 y + 列名" |
| `train_model(X, y, feature_cols)` | 全部样本 | 模型字典（存了 `svm`、`scaler`、`feature_cols`、`metrics`）并保存 `model.pkl` | 80% 训练、20% 测试，用测试集算准确率 |
| `load_or_train_model(ds)` | 数据集 | 模型 + 是否重训的标志 | 有保存的模型且列名一致就加载，否则重训 |
| `predict(features)` | 一条样本的 **2548 个数字** | 字典 `{emotion, emotion_zh, confidence, probabilities, model_name, ...}` | 标准化 → SVM 预测 → 返回类别和置信度 |
| `build_result(features, true_label)` | 特征 + 真实标签 | 一条完整的 `EmotionResult`（含真实标签对照） | 在 `predict` 基础上补时间戳和真实标签 |
| `eeg_stream(ws)` | WebSocket 连接 | （持续推送 JSON） | 每 300ms 推一行真实样本 + 预测 |

### 3.3 训练流程（代码怎么写的）

```python
# train_model() 里的关键四行
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=0)
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
svm = SVC(kernel="rbf", C=10, gamma="scale", probability=True)
svm.fit(X_train, y_train)          # 训练
accuracy_score(y_test, svm.predict(X_test))   # 用 20% 测试集算准确率
```

### 3.4 WebSocket 回放是怎么实现的

```python
while True:
    if state["paused"]:                # 暂停了就停着
        await asyncio.sleep(0.3); continue
    row = dataset["X"][row_idx]        # 取当前行
    msg = {"type": "eeg", "data": {    # 打包一行数据
        "values": {...},               # 8 个代表特征值
        "fft_values": [...],           # 250 个 FFT 系数
        "true_label": ...,             # 真实标签
        "prediction": predict(row) if 识别中 else None,  # 只有"开始识别"后才有预测
    }}
    await ws.send_json(msg)
    row_idx = (row_idx + 1) % 总行数   # 循环回放
    await asyncio.sleep(0.3)
```

---

## 四、前端（React + TypeScript）

### 4.1 `src/types.ts` — 数据类型"字典"

前后端共享的类型定义。比如 `EmotionResult`（一条识别结果）、`EEGStreamMessage`（WS 一行数据）、
`SystemConfig`（后端配置）。前端不用 `any`，所有接口数据都有明确类型，报错时 TypeScript 会直接提示。

### 4.2 `src/api.ts` — 和后端打电话

- `api.getConfig()`、`api.getStatus()`：REST 请求（原生 `fetch`）。
- `api.predictEmotion(features)`：`POST /api/predict`，把一个样本的 2548 个特征发给后端，拿回预测。
- `connectWebSocket(path, onMessage)`：建立 WebSocket，**断线自动重连**（指数退避：1s→2s→4s…封顶 30s）。

### 4.3 `src/App.tsx` — 主页面"指挥中心"

负责：连接 WebSocket、接收每一行数据 → 更新状态 → 传给各组件画图。
关键逻辑（收到一行真实数据）：

```ts
if (msg.type === 'eeg') {
  setEegData(prev => 追加这行的特征值);   // 特征流图 +1 个点
  setFftData({ bins, values });           // FFT 图换成当前行
  if (msg.data.prediction) {              // 识别中才有预测
    setCurrentResult(msg.data.prediction); // 更新结果卡片
    setHistory(prev => [prediction, ...prev].slice(0, 10)); // 历史记 10 条
  }
}
```

### 4.4 组件

| 组件 | 作用 | 关键 props |
|---|---|---|
| `ControlPanel` | 左侧面板：数据信息、模型信息、开始/暂停/停止等按钮 | `config`, `runState`, `onStart`… |
| `WaveformChart` | 实时特征流图：8 条真实特征线滚动 | `channels`（特征名）, `data`（每特征数值数组） |
| `SpectrumChart` | 当前样本的 FFT 分布图 | `bins`, `values` |
| `EmotionCard` | 当前预测结果：情绪 + 置信度 + 真实标签对照 | `result`, `recognizing`, `stopped` |

> `WaveformChart` 对每条线做了 **min-max 归一化**（真实特征量纲差异巨大，必须归一化才都能显示）。

---

## 五、数据流动图（CSV → 模型 → 前端）

```text
emotions.csv（2132 行 × 2548 特征 + 标签）
        │  ① 后端 load_dataset() 读取
        ▼
 特征矩阵 X + 标签 y
        │  ② train_model()：80% 训练 + 标准化
        ▼
 真实 SVM 模型（保存为 models/emotion_svm.pkl）
        │  ③ WebSocket 回放：每 300ms 取一行 X[row]
        ▼
 WS 消息 { values: 8 特征值, fft_values: 250 点, true_label, prediction }
        │  ④ 前端 App.tsx 接收
        ├──► WaveformChart（特征流图）   ├──► SpectrumChart（FFT 图）
        └──► EmotionCard（预测 + 真实标签对照） → 历史记录表
```

---

## 六、如何修改情绪标签（例如改成中文或其它词）

**中文显示**：改后端 `backend/main.py` 里的 `EMOTION_ZH`：

```python
EMOTION_ZH = {"POSITIVE": "高兴", "NEUTRAL": "平静", "NEGATIVE": "悲伤"}
# 改成：
EMOTION_ZH = {"POSITIVE": "开心", "NEUTRAL": "放松", "NEGATIVE": "难过"}
```

保存后重启后端（`uvicorn --reload` 会自动生效）。前端 Emoji（😊😌😢）和颜色在
`frontend/src/components/EmotionCard.tsx` 的 `EMOTION_META` 里。

**让模型重新认识别的标签**：这需要换带新标签的数据集并重训——
删掉 `models/emotion_svm.pkl`，重启后端即可（后端会重新训练）。

---

## 七、常见疑问

- **为什么不是 62 通道？** 见本文第二节：这个数据集是 4 通道 Muse 头带 + 特征工程，2548 维。
- **准确率 99% 怎么来的？** 后端启动时用 80% 数据训练、20% 数据测试，`metrics` 里就是实测结果。
- **特征流图数值和 FFT 图对不上？** 特征流图是归一化后的"趋势图"，FFT 图是原始数值。
- **怎么加新模型（比如换成 XGBoost）？** 在 `backend/main.py` 的 `train_model()` 里把
  `SVC(...)` 换成 `XGBClassifier(...)`（需 `pip install xgboost`），模型选择的地方相应改文案即可。
