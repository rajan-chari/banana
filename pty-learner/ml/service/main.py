"""
FastAPI inference service for pty-learner classifier.

Runs on port 8710. Loads classifier.onnx at startup.

Usage:
    uvicorn service.main:app --reload --port 8710

Endpoints:
    GET  /health          — health check + model_loaded status
    POST /classify        — classify terminal buffer text
    POST /predict         — alias for /classify
"""
from pathlib import Path
from typing import Literal

import numpy as np
import onnxruntime as rt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = Path(__file__).parent.parent / "classifier.onnx"

app = FastAPI(title="pty-learner inference", version="0.1.0")
_session: rt.InferenceSession | None = None


def get_session() -> rt.InferenceSession:
    global _session
    if _session is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(
                f"Model not found at {MODEL_PATH}. "
                "Run: python train.py --onnx-compatible --output model_onnx.pkl && "
                "python export_onnx.py --model model_onnx.pkl --output classifier.onnx"
            )
        _session = rt.InferenceSession(str(MODEL_PATH))
    return _session


class ClassifyRequest(BaseModel):
    text: str  # terminal buffer lines joined with '\n'


class ClassifyResponse(BaseModel):
    label: Literal["busy", "not_busy"]
    confidence: float


def _run_inference(text: str) -> ClassifyResponse:
    try:
        sess = get_session()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    input_name = sess.get_inputs()[0].name
    result = sess.run(None, {input_name: np.array([[text]])})

    label = result[0][0]
    probs = result[1][0]  # dict {label: prob}
    confidence = float(probs.get(label, 0.0))

    return ClassifyResponse(label=label, confidence=confidence)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL_PATH.exists()}


@app.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest):
    return _run_inference(req.text)


@app.post("/predict", response_model=ClassifyResponse)
def predict(req: ClassifyRequest):
    return _run_inference(req.text)
