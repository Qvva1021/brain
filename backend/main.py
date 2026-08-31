# -*- coding: utf-8 -*-
"""
脑电情绪识别系统 —— 后端（真实模型版）
========================================
用 Kaggle「EEG Brainwave Dataset: Feeling Emotions」的真实数据 emotions.csv，
训练一个真实 SVM（RBF 核）做三分类情绪识别（POSITIVE / NEUTRAL / NEGATIVE）。

数据来源：https://www.kaggle.com/datasets/birdy654/eeg-brainwave-dataset-feeling-emotions
重要说明：
  * 这份数据不是 62 通道的原始脑电，而是 Muse 4 通道头带经过特征工程得到的
    2548 个统计特征（mean / stddev / entropy / fft / moments / covmat …，α/β 频段）。
  * 所以本系统没有"真实实时波形"，而是把真实样本一行一行"回放"给前端展示，
    并对每一行用真实 SVM 给出情绪预测 —— 结果全部来自真实模型，不造假。

运行：conda activate SEED 后 `cd backend && uvicorn main:app --reload --port 8000`
只依赖：fastapi, uvicorn[standard], numpy, pandas, scikit-learn, joblib
"""
import os
import pickle
import asyncio
from collections import deque
from datetime import datetime

import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

# ================================================================
# 0. 常量与路径
# ================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 可用环境变量覆盖：EEG_DATA_PATH / EEG_MODEL_PATH
DATA_PATH = os.getenv("EEG_DATA_PATH", os.path.normpath(os.path.join(BASE_DIR, "..", "data", "emotions.csv")))
MODEL_PATH = os.getenv("EEG_MODEL_PATH", os.path.normpath(os.path.join(BASE_DIR, "..", "models", "emotion_svm.pkl")))

# 数据集里的英文标签 -> 中文显示
EMOTION_ZH = {"POSITIVE": "高兴", "NEUTRAL": "平静", "NEGATIVE": "悲伤"}
# 前端使用的英文 key（小写） -> 中文显示
EMOTION_KEY = {"positive": "高兴", "neutral": "平静", "negative": "悲伤"}

# 回放速度：每多少毫秒推送一行真实数据
STREAM_INTERVAL_MS = 300
# 每个 WebSocket 连接里，每隔 N 条数据推送一次状态消息
STATUS_EVERY_N = 10
# 历史记录最多保留条数
HISTORY_MAX = 10

# 前端"特征流"图要展示的 8 个真实特征（4 通道 × α/β 频段均值，名称已在 emotions.csv 中确认存在）
# 通道 0-3（Muse 4 通道头带），频段 a=α、b=β。每一条线 = 某通道某频段的均值。
DISPLAY_FEATURES = [
    {"name": "mean_0_a",  "label": "均值·通道0·α"},
    {"name": "mean_1_a",  "label": "均值·通道1·α"},
    {"name": "mean_2_a",  "label": "均值·通道2·α"},
    {"name": "mean_3_a",  "label": "均值·通道3·α"},
    {"name": "mean_0_b",  "label": "均值·通道0·β"},
    {"name": "mean_1_b",  "label": "均值·通道1·β"},
    {"name": "mean_2_b",  "label": "均值·通道2·β"},
    {"name": "mean_3_b",  "label": "均值·通道3·β"},
]
# 前端"FFT 频谱"图展示的真实 FFT 特征（fft_0_a .. fft_249_a）
FFT_FEATURES = [f"fft_{i}_a" for i in range(250)]

# ================================================================
# 1. 数据集加载
# ================================================================
def load_dataset():
    """读取 emotions.csv。若文件不存在则返回 None（后端仍能启动，只是不可用）。"""
    if not os.path.exists(DATA_PATH):
        return None
    df = pd.read_csv(DATA_PATH)
    # 第一个列名带历史遗留的 '#' 前缀，去掉
    df.columns = [str(c).lstrip("#").strip() for c in df.columns]
    feature_cols = [c for c in df.columns if c != "label"]
    X = df[feature_cols].to_numpy(dtype=float)
    y = df["label"].to_numpy()
    return {"X": X, "y": y, "feature_cols": feature_cols, "df": df}


# ================================================================
# 2. 训练 / 加载 SVM 模型
# ================================================================
def train_model(X, y, feature_cols):
    """用 80% 数据训练 SVM，20% 测试评估，返回模型字典并保存到 model.pkl。"""
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=0, stratify=y
    )
    scaler = StandardScaler()
    X_train = scaler.fit_transform(X_train)
    X_test = scaler.transform(X_test)

    # RBF 核 SVM；probability=True 才能给出置信度（predict_proba）
    svm = SVC(kernel="rbf", C=10, gamma="scale", probability=True, random_state=0)
    svm.fit(X_train, y_train)

    y_pred = svm.predict(X_test)
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "trained_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    model = {
        "svm": svm,
        "scaler": scaler,
        "feature_cols": feature_cols,
        "metrics": metrics,
    }
    # 保存到 models/emotion_svm.pkl（下次启动直接加载，不用重训）
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    return model


def load_or_train_model(ds):
    """有已保存模型且特征名一致 -> 加载；否则重新训练并保存。"""
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, "rb") as f:
            model = pickle.load(f)
        if model.get("feature_cols") == ds["feature_cols"]:
            return model, False          # 加载成功，未重训
    model = train_model(ds["X"], ds["y"], ds["feature_cols"])
    return model, True                   # 训练了新模型


# ================================================================
# 3. 预测函数
# ================================================================
def predict(features):
    """输入 2548 个特征 -> 输出情绪预测结果（真实模型）。"""
    if len(features) != len(model["feature_cols"]):
        raise HTTPException(status_code=400,
                            detail=f"特征数量应为 {len(model['feature_cols'])}，实际收到 {len(features)}")
    vec = np.array(features, dtype=float).reshape(1, -1)
    scaled = model["scaler"].transform(vec)

    label = str(model["svm"].predict(scaled)[0])            # 如 'NEGATIVE'
    proba = model["svm"].predict_proba(scaled)[0]           # 每个类别的概率
    classes = [str(c) for c in model["svm"].classes_]       # ['NEGATIVE','NEUTRAL','POSITIVE']
    proba_dict = {EMOTION_KEY.get(c, c): round(float(p), 4) for c, p in zip(classes, proba)}

    emotion_key = {"POSITIVE": "positive", "NEUTRAL": "neutral", "NEGATIVE": "negative"}.get(label, label.lower())
    return {
        "emotion": emotion_key,
        "emotion_zh": EMOTION_KEY.get(emotion_key, emotion_key),
        "confidence": round(float(proba.max()), 4),
        "probabilities": proba_dict,
        "model_name": "SVM（RBF 核）",
        "data_source": os.path.basename(DATA_PATH),
    }


# ================================================================
# 4. 全局状态（内存态，单一事实来源）
# ================================================================
state = {
    "recognition_running": False,   # 是否正在识别
    "paused": False,                # 是否暂停回放
    "current_result": None,         # 最近一次预测结果
    "history": deque(maxlen=HISTORY_MAX),  # 预测历史（最多 10 条）
}

def now_iso():
    return datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

def build_result(features, true_label=None):
    """生成一条完整识别结果（含真实标签，便于前端对比）。"""
    r = predict(features)
    r["timestamp"] = now_iso()
    if true_label is not None:
        r["true_label"] = str(true_label)
        r["true_label_zh"] = EMOTION_ZH.get(str(true_label), str(true_label))
    return r

def get_run_state():
    if state["paused"]:
        return "paused"
    if state["recognition_running"]:
        return "recognizing"
    return "streaming"

def build_config(ds, model):
    return {
        "data_source": "emotions.csv（Kaggle EEG 数据集）",
        "n_rows": int(ds["X"].shape[0]),
        "n_features": int(ds["X"].shape[1]),
        "feature_cols": ds["feature_cols"],
        "display_features": DISPLAY_FEATURES,
        "fft_features": FFT_FEATURES,
        "emotion_labels": EMOTION_KEY,
        "available_models": ["SVM（RBF 核）"],
        "available_features": ["2548 维统计特征"],
        "model_info": model["metrics"],
    }


# ================================================================
# 加载数据 + 模型（启动时执行一次）
# ================================================================
dataset = load_dataset()
model = None
train_log = ""
if dataset is not None:
    model, trained = load_or_train_model(dataset)
    train_log = ("已训练并保存新模型 → models/emotion_svm.pkl" if trained
                 else "加载已保存模型 → models/emotion_svm.pkl")
else:
    train_log = f"未找到数据文件：{DATA_PATH}（请先下载 emotions.csv 到 data/）"

# ================================================================
# 5. FastAPI 应用与 REST 接口
# ================================================================
app = FastAPI(title="EEG Emotion Recognition Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    features: list[float]              # 一条样本的 2548 个特征

class RecognitionStartRequest(BaseModel):
    model: str = "SVM（RBF 核）"
    feature_type: str = "2548 维统计特征"


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "backend_name": "EEG Emotion Recognition Backend",
        "backend_version": "1.0.0",
        "model": "SVM（RBF 核）" if model else "未加载",
        "timestamp": now_iso(),
    }


@app.get("/api/config")
def get_config():
    if dataset is None or model is None:
        raise HTTPException(status_code=503, detail=train_log)
    return build_config(dataset, model)


@app.get("/api/status")
def get_status():
    return {
        "data_source": os.path.basename(DATA_PATH),
        "model_loaded": model is not None,
        "model_info": model["metrics"] if model else None,
        "train_log": train_log,
        "recognition_running": state["recognition_running"],
        "paused": state["paused"],
        "run_state": get_run_state(),
        "current_result": state["current_result"],
        "history_count": len(state["history"]),
    }


@app.post("/api/predict")
def predict_endpoint(req: PredictRequest):
    """REST 预测：接收一条样本的 2548 个特征，返回情绪预测（真实模型）。"""
    if model is None:
        raise HTTPException(status_code=503, detail=train_log)
    r = build_result(req.features)
    state["current_result"] = r
    state["history"].append(r)
    return r


@app.post("/api/recognition/start")
def start_recognition(req: RecognitionStartRequest):
    if model is None:
        raise HTTPException(status_code=503, detail=train_log)
    state["recognition_running"] = True
    state["paused"] = False
    return {
        "status": "started",
        "recognizing": True,
        "model": req.model,
        "feature_type": req.feature_type,
        "message": "识别已开始：将对该数据集每一行进行真实 SVM 预测",
    }


@app.post("/api/recognition/pause")
def pause_recognition():
    state["paused"] = True
    return {"status": "paused", "paused": True, "message": "已暂停数据回放"}


@app.post("/api/recognition/resume")
def resume_recognition():
    state["paused"] = False
    return {"status": "resumed", "paused": False, "message": "已继续数据回放"}


@app.post("/api/recognition/stop")
def stop_recognition():
    state["recognition_running"] = False
    state["paused"] = False
    return {"status": "stopped", "recognizing": False, "message": "识别已停止"}


@app.post("/api/recognition/reset")
def reset_recognition():
    state["recognition_running"] = False
    state["paused"] = False
    state["current_result"] = None
    state["history"].clear()
    return {"status": "reset", "recognizing": False, "paused": False,
            "current_result": None, "history_count": 0}


@app.get("/api/recognition/current")
def current_result():
    return {"current_result": state["current_result"]}


@app.get("/api/history")
def get_history():
    return {"count": len(state["history"]), "items": list(state["history"])}


@app.delete("/api/history")
def clear_history():
    n = len(state["history"])
    state["history"].clear()
    return {"status": "cleared", "deleted": n}


# ================================================================
# 6. WebSocket：真实数据回放 + 实时预测
# ================================================================
@app.websocket("/ws/eeg-stream")
async def eeg_stream(ws: WebSocket):
    """每 300ms 推送一行真实 emotions.csv 样本（特征值 + FFT + 真实标签 + SVM 预测）。"""
    await ws.accept()
    n_rows = dataset["X"].shape[0]
    row_idx = 0
    tick = 0
    display_names = [d["name"] for d in DISPLAY_FEATURES]
    # 提前算好特征在列里的下标，避免每行重复查找
    col_idx = {name: dataset["feature_cols"].index(name) for name in display_names + FFT_FEATURES}
    display_indices = [col_idx[n] for n in display_names]
    fft_indices = [col_idx[f] for f in FFT_FEATURES]
    try:
        while True:
            if state["paused"]:
                await asyncio.sleep(STREAM_INTERVAL_MS / 1000)
                continue

            row = dataset["X"][row_idx]
            true_label = dataset["y"][row_idx]

            msg = {
                "type": "eeg",
                "data": {
                    "row_index": row_idx,
                    "total_rows": n_rows,
                    "feature_names": display_names,
                    "values": {name: round(float(row[idx]), 4)
                               for name, idx in zip(display_names, display_indices)},
                    "fft_bins": list(range(len(FFT_FEATURES))),
                    "fft_values": [round(float(row[idx]), 4) for idx in fft_indices],
                    "true_label": str(true_label),
                    "true_label_zh": EMOTION_ZH.get(str(true_label), str(true_label)),
                    # 仅在"识别中"时给出真实预测，否则为 None
                    "prediction": build_result(row.tolist(), true_label)
                                  if state["recognition_running"] else None,
                },
            }

            # 每次预测更新全局状态（供 /api/recognition/current、/api/history 使用）
            if state["recognition_running"]:
                state["current_result"] = msg["data"]["prediction"]
                state["history"].append(msg["data"]["prediction"])

            await ws.send_json(msg)

            # 每 STATUS_EVERY_N 条附带一条状态消息（前端据此更新运行状态）
            tick += 1
            if tick % STATUS_EVERY_N == 0:
                await ws.send_json({
                    "type": "status",
                    "data": {
                        "data_source": os.path.basename(DATA_PATH),
                        "recognition_running": state["recognition_running"],
                        "paused": state["paused"],
                        "run_state": get_run_state(),
                    },
                })

            row_idx = (row_idx + 1) % n_rows   # 循环回放全部 2132 行
            await asyncio.sleep(STREAM_INTERVAL_MS / 1000)
    except Exception:
        # 客户端断开时结束该连接的回放任务
        await ws.close()


# ================================================================
# 7. 启动（开发用；生产可改用 `uvicorn main:app`）
# ================================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
