# 文档 08：开发计划（Development Plan）

> 适用读者：准备动手实现第一版的初学者。本文件给出**从零到可演示的分阶段步骤**：每阶段做什么、交付什么、怎么验收、卡住了怎么排查。

**总原则：每一阶段结束都必须"能运行、可验收"，再进入下一阶段。**

---

## 1. 阶段总览

| 阶段 | 名称 | 目标 | 依赖 |
|---|---|---|---|
| 阶段 0 | 环境准备 | 装好 Python、Node.js，跑通空壳 | 无 |
| 阶段 1 | 后端：模拟数据 + REST API | 后端可启动，REST 全通 | 阶段 0 |
| 阶段 2 | React 静态界面 | 界面完整展示，数据为占位 | 阶段 0 |
| 阶段 3 | REST 联调 | 前端读后端配置/历史，健康检查连通 | 阶段 1、2 |
| 阶段 4 | WebSocket 实时波形 | 波形真实滚动 | 阶段 1、3 |
| 阶段 5 | PSD + 情绪历史 | 频谱图 + 结果卡片 + 历史完整 | 阶段 4 |
| 阶段 6 | SEED 数据 + SVM 接入（后续） | 真实数据/模型（占位验收） | 后续 |

> 阶段 0–5 属于**第一版**；阶段 6 是**第二版**，第一版仅以文档形式预留。

---

## 2. 阶段 0：环境准备

### 交付物
- Python 3.10 可运行；
- Node.js LTS（建议 18/20）可运行；
- 项目目录结构（按文档 07 第一版最小集）。

### 建议步骤（初学者）
1. 安装 Python 3.10（官网下载，勾选 Add to PATH）；
2. 验证：终端执行 `python --version` → `Python 3.10.x`；
3. 安装 Node.js LTS；
4. 验证：`node --version`、`npm --version`；
5. 创建项目根目录与 `backend/`、`frontend/`、`docs/`；
6. 后端虚拟环境：`cd backend` → `python -m venv .venv` → 激活（Windows：`.venv\Scripts\activate`；macOS/Linux：`source .venv/bin/activate`）。

### 验收标准
- `python --version`、`node --version` 都正常输出；
- 虚拟环境激活后命令行前有 `(.venv)`。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| `python` 不是内部或外部命令 | 未加入 PATH | 重装并勾选 Add to PATH，或使用完整路径 |
| 虚拟环境激活失败 | 目录名不对 / 用了旧版 | 确认在 `backend/` 下执行；Windows 用 `.\venv\Scripts\Activate.ps1` |
| PowerShell 禁止执行脚本 | 执行策略限制 | 用 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` 临时放开 |

---

## 3. 阶段 1：后端模拟数据与 REST API

### 交付物
- `backend/requirements.txt`（fastapi、uvicorn[standard]、numpy、scipy）；
- `backend/main.py`：健康检查、配置、模拟模式、识别 start/stop/reset、current、history、data/load（占位）、WebSocket 占位空端点；
- 最小模拟波形函数（先不接 WebSocket 也能手动测）。

### 验收标准
1. `uvicorn main:app --reload --port 8000` 启动无报错；
2. 浏览器/curl 访问：
   - `GET /api/health` → `{"status":"ok",...}`；
   - `GET /api/config` → 含 `sample_rate: 250`、8 个代表通道、频段、情绪映射；
   - `POST /api/simulation/mode` body `{"mode":"positive"}` → `{"status":"ok","simulation_mode":"positive",...}`；
   - `POST /api/recognition/start` → `recognizing: true`；`stop` → `false`；`reset` 清空；
   - `GET /api/history` → 空数组；`DELETE /api/history` → `deleted: 0`；
   - `POST /api/data/load` → 返回占位提示 `真实 SEED 数据解析功能待接入`。
3. FastAPI 自动生成的交互文档可用：`http://localhost:8000/docs`。

### 初学者测试步骤
- 在 `/docs` 页面直接点击"Try it out"逐个接口测试，最直观；
- 每个接口成功后，在浏览器看返回 JSON 是否符合文档 05。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| `ModuleNotFoundError: fastapi` | 依赖未安装 | 确保激活 `.venv` 后 `pip install -r requirements.txt` |
| 端口被占用 8000 | 别的程序占用 | 改 `--port 8001`，同时改前端代理（临时） |
| `uvicorn` 找不到 | 未在虚拟环境内 | 先 `activate` 再启动 |
| CORS 报错 | 没配 CORSMiddleware | 在 main.py 加 `CORSMiddleware` 允许 5173 |

---

## 4. 阶段 2：React 静态界面

### 交付物
- Vite + React + TS 工程（`npm create vite@latest frontend -- --template react-ts`）；
- 安装 `antd`、`echarts`（仅这两个重量级依赖）；
- 静态布局：Header / Sider(控制面板) / Content(波形+频谱+结果+历史) / Footer；
- 所有下拉框、按钮、表格先使用静态数据渲染；占位功能显示占位文案；
- `types.ts` 按文档 05 定义完整类型。

### 验收标准
1. `npm run dev` 后 `http://localhost:5173` 显示完整五区布局；
2. 波形图/频谱图区域渲染出空图表（可先放示例数据验证 ECharts 是否正常，后续再换真数据）；
3. 占位文案在界面可见（加载文件、DE、CNN 等）。

### 初学者测试步骤
- 修改 `index.css` 微调样式，确认热更新生效；
- 逐个点击按钮、下拉框，确认交互反馈（loading/禁用）正常。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| `npm create vite` 卡住 | 网络问题 | 换镜像源或重试 |
| `antd` 中文不生效 | 未配 ConfigProvider | 在 `App` 外包 `<ConfigProvider locale={zhCN}>` |
| 图表不显示 | echarts 未正确初始化 | 确认 `echarts.init` 的容器有高度（如 360px） |

---

## 5. 阶段 3：REST 联调

### 交付物
- `api.ts` 实现全部 REST 封装；
- `App.tsx` 挂载时调用 `/api/health`、`/api/config`，健康轮询（每秒/每 2 秒）；
- 前后端连通显示：顶部绿点/红点；
- 开始/停止/重置按钮真正调用后端；
- `vite.config.ts` 配置 `/api` 代理到 8000。

### 验收标准
1. 后端开着：顶部显示绿色「已连接」；后端关掉：变成红色「未连接」，「开始识别」禁用；
2. 点击「开始识别」→ 后端 `recognizing` 变 true → 按钮状态正确；
3. 历史接口返回数据能在前端表格渲染（先用模拟数据或后端造的假历史验证）。

### 初学者测试步骤
- 启动后端 → 启动前端 → 打开页面看连接状态；
- 关掉后端 → 观察顶部变红、开始识别禁用 → 重启后端 → 变绿。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| 前端请求 404 | 代理没配/路径错 | 检查 `vite.config.ts` 的 proxy 与请求前缀 `/api` |
| 请求 CORS 报错 | 后端 CORS 未配置 | 后端加 CORSMiddleware 允许 5173 |
| 连接状态一直红 | 后端没启动 / 健康接口报错 | 先单独测 `/api/health`；看后端终端日志 |

---

## 6. 阶段 4：WebSocket 实时波形

### 交付物
- 后端 `/ws/eeg-stream`：每 100 ms 生成并推送 8 通道 × 25 点数据 + status 快照；
- 后端 `/ws/emotion-stream`：占位（先不推结果，阶段 5 接）；
- 前端 `api.ts`：WebSocket 连接 + 指数退避重连；
- `WaveformChart.tsx`：用 ECharts 滚动波形，上下错位，保留最近 5 秒。

### 验收标准
1. 打开页面波形即开始滚动（无需点按钮）；
2. 暂停后端（Ctrl+C）→ 波形停止，前端进入重连；重启后端 → 自动恢复；
3. 切换模拟模式 → 波形外观/振幅有变化（可先不精确，阶段 6 验证 PSD 更清晰）。

### 初学者测试步骤
- 浏览器 DevTools → Network → WS 面板，观察每 100 ms 收到一条消息；
- 数一下 `values.Fp1` 是不是 25 个数。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| WS 连不上 | 地址用错 / 代理没代理 ws | 前端用 `ws://localhost:8000/ws/eeg-stream` 直连（不依赖代理），或给 vite proxy 配 `ws: true` |
| 波形不滚动 | 前端没按新数据刷新 | 确认 onMessage 里更新了 eegData state；图表用 append/滚动模式 |
| 一条通道都不显示 | channels 名对不上 | 前后端通道名数组必须一致（都用 8 个代表通道） |

---

## 7. 阶段 5：PSD 与情绪历史

### 交付物
- 后端：用 `scipy.signal.welch` 计算 PSD，随 eeg 消息携带 `psd_freqs/psd_values`（方案 A′，见文档 05）；
- `SpectrumChart.tsx`：1–50 Hz 面积图 + 五频段着色分区；
- `mock_predict()`：每 2–5 秒输出 EmotionResult，写入 `current_result` 与 `history`（最多 10 条）；
- `/ws/emotion-stream` 推送结果；`EmotionCard.tsx`、历史表格、日志全部接上；
- 帮助抽屉（术语 + 免责声明）。

### 验收标准
1. PSD 图随模式切换有明显差异（如平静时 α 峰更高）；
2. 点击「开始识别」2–5 秒内结果卡片出现；停止后不再更新，显示「识别已停止」；
3. 历史表格最多 10 条，清空生效；
4. 日志按时间显示、约 50 条封顶；
5. 免责声明与占位文案可见。

### 初学者测试步骤
- 切到「平静」模式 → 开始识别 → 观察 PSD 与结果；再切「高兴」→ 观察差异；
- 点「重置演示」→ 结果与历史清空。

### 常见故障排查
| 现象 | 原因 | 处理 |
|---|---|---|
| PSD 是平的/恒为 0 | welch 参数或取数据窗口错误 | 打印中间数组确认长度；检查是否 log(0)（要加极小值） |
| 情绪结果不出现 | 识别未开启 / emotion-stream 未推 | 先确认 start 返回 `recognizing:true`；再检查 WS 消息类型 |
| 历史超过 10 条 | 后端未裁剪 | 在 history.append 后 `history = history[-10:]` |
| 结果乱跳 | mock 扰动过大 | 减少扰动幅度，控制 0.60–0.95 |

---

## 8. 阶段 6：SEED 数据与 SVM 模型接入（后续，第二版）

> 第一版**只在本阶段规划，不实现**。进入本阶段的前提：已获得合法授权的 SEED 数据集、已能离线训练模型。

### 规划步骤
1. `scripts/`：数据检查脚本（打印 `.mat` 结构）+ `train_svm.py`（PSD 特征 → SVC → joblib）；
2. 后端 `EEGDataLoader`：`load_mat_file` / `get_metadata` / `get_window`（见文档 06 第 6 节）；
3. 后端 `SVMEmotionClassifier`：实现文档 03 的 `EmotionClassifier.predict()` 接口；
4. 数据源切换到「真实数据模式（占位）」→ 支持加载文件；
5. 前端 Upload 真接后端文件上传。

### 验收标准（占位性质的验收）
- 文档/接口已就绪；第一版不要求真实模型跑通。

---

## 9. 整体自测清单（阶段 5 完成后跑一遍）

| # | 测试 | 预期 |
|---|---|---|
| 1 | 启动后端 + 前端 | 页面正常，顶部绿点「已连接」 |
| 2 | 不做任何操作 | 波形自动滚动，PSD 自动刷新 |
| 3 | 点「开始识别」 | 2–5 秒内出结果，历史+日志更新 |
| 4 | 点「暂停波形」/「继续波形」 | 波形冻结/恢复 |
| 5 | 点「停止识别」 | 显示「识别已停止」，结果不再更新 |
| 6 | 点「重置演示」 | 结果与历史清空 |
| 7 | 关掉后端 | 顶部红点，「开始识别」禁用，前端进入重连 |
| 8 | 重启后端 | 自动恢复连接 |
| 9 | 切换三种模拟模式 | PSD 有明显差异，结果随模式变化 |
| 10 | 点「加载 EEG 文件」 | 显示「真实 SEED 数据解析功能待接入」 |

---

## 10. 常见故障排查总表

| 现象 | 位置 | 最可能原因 | 解决 |
|---|---|---|---|
| 端口冲突 | 后端 | 8000 被占用 | 换端口并同步前端代理 |
| CORS 报错 | 后端 | 未配置允许来源 | CORSMiddleware 加 5173 |
| WS 连不上 | 前端 | 地址/代理 | 直连 `ws://localhost:8000` |
| 波形不动 | 前端 | state 未更新 / 图表未 append | 检查 onMessage → setEegData → ECharts 滚动 |
| PSD 全 0 | 后端 | welch 窗口/对数 | 打印中间值，加 1e-12 |
| 情绪无输出 | 后端 | 识别未开启 | start 后再等 2–5 秒；检查 emotion-stream |
| 界面占位消失 | 前端 | 文案被删 | 恢复文档 04 第 6 节统一话术 |
| 中文乱码 | 前端 | 编码/字体 | 确认 index.html 声明 UTF-8，页面用中文字体栈 |

---

> 下一篇：**`README.md`（根目录说明）**，是整个项目的第一入口。
