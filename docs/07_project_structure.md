# 文档 07：项目结构（Project Structure）

> 适用读者：要开始创建工程文件的初学者。本文件说明**整个项目的目录怎么组织、每个文件/目录未来负责什么**，并严格遵守"最小化实现（MVP）"原则。

**MVP 原则的一句话：** 第一版只创建"当前真的需要"的文件；"未来可能会用"的东西用注释/TODO/文档说明，而不是提前创建空文件。

---

## 1. 最终目标结构（含未来目录，带标注）

```text
eeg-emotion-recognition/
├── backend/
│   ├── main.py                 # 【第一版】FastAPI 全部逻辑：REST + WebSocket + 模拟数据 + PSD + 模拟分类
│   ├── requirements.txt        # 【第一版】Python 依赖
│   └── .env.example            # 【可选】若需要环境变量（如端口）才创建；第一版可用默认值，允许不创建
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # 【第一版】主页面：布局 + 全局状态 + 事件分发
│   │   ├── api.ts              # 【第一版】REST 请求（fetch）+ WebSocket 连接与自动重连
│   │   ├── types.ts            # 【第一版】TypeScript 类型定义（对应文档 05 第 5 节）
│   │   ├── main.tsx            # 【第一版】React 入口
│   │   ├── index.css           # 【第一版】全局基础样式
│   │   └── components/         # 【第一版，按需拆分】仅当 App.tsx 明显过长（约 >250 行）才拆
│   │       ├── WaveformChart.tsx   # EEG 实时波形图
│   │       ├── SpectrumChart.tsx   # PSD 频谱图
│   │       ├── ControlPanel.tsx    # 左侧控制面板
│   │       └── EmotionCard.tsx     # 情绪结果卡片
│   ├── package.json            # 【第一版】前端依赖与脚本
│   ├── tsconfig.json           # 【第一版】TypeScript 配置
│   ├── vite.config.ts          # 【第一版】Vite 配置（含后端代理，见第 5 节）
│   └── index.html              # 【第一版】Vite 入口 HTML
│
├── docs/                       # 【已存在】本套设计文档
│   ├── 01_project_overview.md
│   ├── 02_requirements_scope.md
│   ├── 03_system_architecture.md
│   ├── 04_ui_ux_spec.md
│   ├── 05_api_contract.md
│   ├── 06_data_model_algorithm_plan.md
│   ├── 07_project_structure.md   # 本文件
│   ├── 08_development_plan.md
│   └── 09_code_generation_prompt.md
│
├── scripts/                    # 【未来】训练 SVM、SEED 数据检查等脚本
│   └── train_svm.py            #    （占位，第二版创建，负责离线训练，见文档 06 第 7 节）
│
├── data/                       # 【未来】存放 SEED .mat 数据、示例数据（第一版可空/不存在）
│   └── .gitkeep                #    （占位文件，让空目录可被 git 追踪；不需要则省略）
│
├── models/                     # 【未来】训练好的模型文件
│   └── svm_psd.joblib          #    （占位，第二版由训练脚本生成）
│
├── screenshots/                # 【未来】课程报告用的运行截图
│
├── .gitignore                  # 【第一版】忽略 node_modules / .venv / dist 等
├── README.md                   # 【第一版】项目说明（见根目录 README 说明）
└── docs/                       # （上文已列）
```

---

## 2. 第一版目录树（最小集）

**第一版严格只创建下面的文件**（`docs/` 已存在）：

```text
eeg-emotion-recognition/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── types.ts
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
├── docs/
├── .gitignore
└── README.md
```

> `components/` 子目录**只有**在 `App.tsx` 明显过长时才出现；出现时每个组件文件都要在本文件或 README 中说明"为什么需要"。

---

## 3. 每个文件负责什么（第一版）

### 3.1 backend/main.py —— 后端全部逻辑（单文件）

按以下顺序组织代码，用注释分区：

```text
# 1. imports                     依赖导入（FastAPI、uvicorn、numpy、scipy、asyncio 等）
# 2. constants / channel names  常量：采样率、通道名、代表通道、频段、情绪映射
# 3. Pydantic response models    响应结构定义（与文档 05 一致）
# 4. simple application state    内存状态 state（单一事实来源）
# 5. EEG simulation functions   EEGSimulator：合成波形、三种模式、生成数据块
# 6. PSD calculation function    用 scipy.signal.welch 计算 1–50Hz PSD
# 7. mock emotion prediction    mock_predict()：输出 EmotionResult
# 8. REST endpoints              文档 05 全部 REST 接口
# 9. WebSocket endpoint          /ws/eeg-stream 与 /ws/emotion-stream
# 10. local startup entry point  if __name__ == "__main__": uvicorn.run(...)
```

**不创建**：`database.py`、`service.py`、`factory.py`、`config.py`、`utils.py`、`schemas.py`、`routers/` 等。原因：第一版没有数据库、认证、多路由、复杂业务，拆了只会增加理解成本。

### 3.2 backend/requirements.txt —— Python 依赖

第一版最小依赖（依据文档 02/10.4）：

```text
fastapi>=0.110
uvicorn[standard]>=0.29
numpy>=1.26
scipy>=1.12
```

> 注释中说明：scikit-learn、joblib、pandas、mne、torch 等将在第二版（SEED/SVM）加入，第一版不装。

### 3.3 frontend/src/App.tsx —— 主页面

- 负责整体布局（Layout：Header / Sider / Content / Footer）；
- 集中维护全局状态：`backendConnected`、`isRecognizing`、`isPaused`、`selectedFeature`、`selectedModel`、`emotionResult`、`history`、`logs`、`eegData`、`psdData`；
- 挂载时：调用 `/api/health` + `/api/config`，建立 WebSocket；
- 按钮事件直接调用 `api.ts` 里的短函数。

### 3.4 frontend/src/api.ts —— 请求与连接

- REST：用原生 `fetch` 封装上述接口（`getHealth`、`getConfig`、`startRecognition`、`stopRecognition`、`resetRecognition`、`getHistory`、`clearHistory`、`setSimulationMode`）；
- WebSocket：建立 `/ws/eeg-stream`、`/ws/emotion-stream` 连接；断线指数退避重连（1s→2s→4s→…→30s 封顶）；收到帧用 `onMessage` 回调交给 `App.tsx`；
- 最多一个自定义 Hook（如 `useWebSocket`），否则直接写在 api.ts。

### 3.5 frontend/src/types.ts —— 类型定义

完整内容见文档 05 第 5 节：`EmotionResult`、`SystemStatus`、`EEGStreamMessage`、`EmotionStreamMessage`、`HistoryItem`、`LogItem`、`SystemConfig` 等。**禁止 `any`。**

### 3.6 frontend/src/main.tsx —— React 入口
`createRoot(...).render(<App />)`，并引入 `index.css`。

### 3.7 frontend/src/index.css —— 全局基础样式
页面背景、卡片间距、图表高度等少量全局样式；组件内联样式尽量少用，统一走 CSS。

### 3.8 frontend 配置文件
- `package.json`：React 18、TypeScript、Vite、antd、echarts、@types/…；
- `vite.config.ts`：dev server 端口 5173；可选配置 `/api` 与 `/ws` 代理到 `http://localhost:8000`（这样前端可用相对路径请求，符合"路径不写死"要求）；
- `index.html`：页面标题「脑电情绪识别演示系统」。

---

## 4. 未来目录说明（第一版不创建，写清用途）

| 目录 / 文件 | 未来职责 | 何时创建 |
|---|---|---|
| `scripts/train_svm.py` | 离线训练 SVM 模型（读 SEED → 提 PSD 特征 → SVC → joblib 保存） | 第二版 |
| `data/` | 存放 SEED `.mat` 文件、示例数据 | 第二版（拿到数据后） |
| `models/` | 存放 `svm_psd.joblib` 等训练好的模型 | 第二版（训练后） |
| `screenshots/` | 课程报告运行截图 | 随时 |
| `backend/model/`（若拆分） | 真实分类器实现（SVM/CNN） | 第三版起，视 `main.py` 长度 |
| `frontend/src/components/` | 按需拆分图表与控制面板组件 | 当 `App.tsx` 超约 250 行 |

---

## 5. 关键工程约定

1. **端口**：前端 5173，后端 8000；
2. **路径**：前端所有 API 调用用相对路径（如 `/api/health`），跨域由 `vite.config.ts` 代理解决；后端不写死任何用户目录；
3. **跨域（CORS）**：FastAPI 用 `CORSMiddleware` 允许 `http://localhost:5173`（本地 Demo 的合理配置）；
4. **虚拟环境**：后端依赖装在项目根目录的 `.venv`（`python -m venv .venv`），由 `.gitignore` 忽略；
5. **忽略文件 `.gitignore`** 至少包含：`node_modules/`、`.venv/`、`dist/`、`__pycache__/`、`*.pyc`、`.env`、`data/*.mat`、`models/*.joblib`。

---

> 下一篇：**`docs/08_development_plan.md`（开发计划）**，从零开始的分阶段实施步骤、验收与排障。
