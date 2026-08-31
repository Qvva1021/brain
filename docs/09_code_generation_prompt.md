# 文档 09：第二阶段代码生成提示词（Code Generation Prompt）

> 适用读者：设计文档全部确认后，准备让 AI（或自己）动手生成第一版代码的人。
>
> **使用方式**：把本文档第 2 节的"生成提示词"整段复制给 AI 编码助手，它会先阅读本项目的 9 份设计文档，再按文档实现代码。**不要**跳过阅读直接写代码。

---

## 1. 使用说明（给人类读者）

1. **前置条件**：已阅读并确认 01–08 全部设计文档与 README；
2. **预期产出**：第一版全部可运行代码（`backend/main.py`、前端工程等），不含任何"未来功能"的真实实现；
3. **验收方式**：按 `docs/08_development_plan.md` 阶段 1–5 逐项运行与验收；最后跑一遍第 9 节"整体自测清单"；
4. **一致性铁律**：代码必须与文档 05（API）、文档 04（界面）、文档 06（算法）、文档 07（结构）保持一致；任何偏差要主动说明并同步修改文档。

---

## 2. 生成提示词（可直接复制）

```text
你是一名资深软件架构师、脑机接口（BCI）软件工程师、React 前端工程师和 Python/FastAPI 后端工程师。
在开始编写任何代码之前，请先完整阅读本项目根目录下的以下文件，并严格按其中的设计实现：

1. README.md                          —— 项目总览、能力与限制、运行方式
2. docs/01_project_overview.md        —— 项目目标、非目标、术语速查表、免责声明
3. docs/02_requirements_scope.md      —— 功能清单、已实现/占位边界、验收标准
4. docs/03_system_architecture.md     —— 架构、数据流、前后端职责边界
5. docs/04_ui_ux_spec.md              —— 界面布局、控件、颜色、占位文案
6. docs/05_api_contract.md            —— 全部 REST / WebSocket 契约、TypeScript 类型
7. docs/06_data_model_algorithm_plan.md —— 数据格式、PSD 算法、模拟分类器、SEED/SVM 规划
8. docs/07_project_structure.md       —— 第一版最小目录结构与文件职责
9. docs/08_development_plan.md        —— 分阶段实施、验收与排障

【本任务目标】
按文档实现「脑电情绪识别演示系统」第一版（全模拟演示版），要求在没有真实 EEG 设备、
没有 SEED 数据集、没有真实模型的情况下即可完整运行和演示。

【第一版必须实现的代码清单】
- 后端：backend/main.py（单文件）+ backend/requirements.txt
  * FastAPI 应用，REST 接口 + 两个 WebSocket 端点
  * 内存状态 state（单一事实来源，字段见文档 06 第 9 节）
  * EEGSimulator：62 通道、250 Hz、每 100ms 推一块（8 代表通道 × 25 点），
    三种模拟模式（positive/neutral/negative）有不同频段强度，正弦波 + 噪声
  * PSD：scipy.signal.welch 计算 1–50Hz，随 eeg 消息携带 psd_freqs/psd_values
  * mock_predict()：每 2–5 秒输出 EmotionResult（情绪不随机跳变，置信度 0.60–0.95）
  * 历史记录内存最多 10 条
  * POST /api/data/load 返回占位提示，不解析 .mat
  * CORS 允许 http://localhost:5173
- 前端：React 18 + TypeScript + Vite + Ant Design + ECharts
  * src/App.tsx 主页面（Header / 控制面板 / 波形 / 频谱 / 结果 / 历史 / Footer）
  * src/api.ts REST(fetch) + WebSocket(指数退避重连)
  * src/types.ts 类型定义与文档 05 第 5 节完全一致，禁止 any
  * 波形图：8 通道上下错位、横向滚动、保留最近约 5 秒
  * PSD 图：1–50Hz、δθαβγ 五频段分区着色
  * 情绪卡片：大字情绪 + Emoji + 置信度 + 进度条 + 来源 + 时间 + 免责声明
  * 历史表格：最近 10 条 + 清空按钮
  * 运行日志：最多 50 条
  * 所有占位功能显示统一文案（文档 04 第 6 节）

【必须遵守的硬性约束】
1. 前后端严格分离；前端状态必须来自后端 API/WebSocket，不得本地编造连接状态或数据。
2. 模拟数据由 Python 后端生成，前端不自行随机生成波形。
3. 只实现第一版"已实现"功能；所有占位功能（SEED 加载、DE、SVM/CNN/CNN-LSTM、
   62 通道性能模式）只留入口并显示「后续接入/未实现」，不实现真实能力、不输出伪造结果。
4. 遵守 MVP 最小化原则：后端只用 backend/main.py 单文件；不创建数据库、认证、
   多路由目录、服务层、utils、config 等多余文件；前端只有 App.tsx/api.ts/types.ts/
   main.tsx/index.css，仅当 App.tsx 超过约 250 行才拆分 components/ 下的
   WaveformChart.tsx、SpectrumChart.tsx、ControlPanel.tsx、EmotionCard.tsx。
5. 前端只使用：React Hooks、原生 fetch、Ant Design、ECharts；不使用 Redux/Zustand/
   React Query/Axios/Tailwind/Styled Components/多图表库/多页面路由/登录/主题切换。
6. 后端第一版只使用：fastapi、uvicorn、numpy、scipy、pydantic、标准库；
   不安装/不使用 tensorflow、pytorch、mne、pandas、scikit-learn、joblib、数据库、Redis、Docker。
7. 响应字段与 JSON 示例必须与 docs/05_api_contract.md 完全一致；
   TS 接口与文档 05 第 5 节完全一致；情绪标签 positive/neutral/negative，中文 高兴/平静/悲伤。
8. 所有路径使用相对路径或前端代理，不写死任何个人用户目录；端口：前端 5173、后端 8000。
9. WebSocket 消息只推送前端所需的最小数据（8 个代表通道 × 25 点 + PSD）；
   断线指数退避重连（1s→2s→4s→…→30s 封顶）并显示连接状态。
10. 界面必须包含医疗免责声明「本系统仅用于教学与算法演示，不用于医疗诊断。」
11. 代码注释使用中文；代码结构、命名、注释风格保持简单清晰，便于初学者阅读。

【完成后请输出】
1. 已创建/修改的文件清单（含相对路径）；
2. 与文档的一致性核对表（哪些功能按文档实现、哪些是占位）；
3. 运行步骤（后端、前端命令）；
4. 已知偏差或需要文档同步修改的地方。

【最重要】
代码必须实际可运行。文档中标记「已实现」的功能，代码必须能通过 docs/08 的验收清单。
宁可保持最小可运行，也不要堆砌"未来可能用到"的抽象代码。
```

---

## 3. 生成后检查清单（给人类读者）

生成代码后，用这张表核对，**任何一项不通过都要打回修改**：

| # | 检查项 |
|---|---|
| 1 | 后端 `uvicorn main:app` 能启动，`/docs` 接口文档可交互 |
| 2 | `GET /api/health`、`/api/config`、`/api/history`、`POST /api/recognition/*` 返回符合文档 05 |
| 3 | `POST /api/data/load` 返回占位提示，未假装解析 `.mat` |
| 4 | 前端 `npm run dev` 打开 5173，顶部连接状态与后端真实状态一致 |
| 5 | 波形自动滚动、PSD 自动刷新、开始识别 2–5 秒出结果 |
| 6 | 暂停/继续/停止/重置行为正确，历史最多 10 条 |
| 7 | 关闭后端 → 前端红点 + 禁用开始 + 自动重连；重启后恢复 |
| 8 | 所有占位功能界面文案可见（文档 04 第 6 节） |
| 9 | 免责声明可见 |
| 10 | 全程无 `any`、无未使用依赖、无空跑架构文件 |

---

## 4. 遇到分歧时的裁决规则

- **文档与直觉冲突**：以文档为准；若确实发现文档不合理，先改文档再改代码，并做记录；
- **占位与实现冲突**：宁可"少实现"也不能"假装实现"；占位永远标注、永不伪造结果；
- **简单与完整冲突**：选简单。本项目的唯一标准是"初学者能读 `README.md` → `backend/main.py` → `frontend/src/App.tsx` 理解 80% 的系统逻辑"。

---

## 5. 本文件结束语

本文件是整个设计阶段（文档 01–09）的收尾。确认无误后，把第 2 节提示词交给编码助手即可开始第二阶段。祝编码顺利 🚀
