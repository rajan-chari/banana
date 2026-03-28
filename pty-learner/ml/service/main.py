"""
FastAPI inference service for pty-learner classifier.

Runs on port 8710. Loads model.onnx at startup.

Usage:
    uvicorn service.main:app --reload --port 8710
"""
from pathlib import Path
from typing import Literal

import numpy as np
import onnxruntime as rt
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = Path(__file__).parent.parent / "model.onnx"

app = FastAPI(title="pty-learner inference", version="0.1.0")
_session: rt.InferenceSession | None = None


def get_session() -> rt.InferenceSession:
    global _session
    if _session is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found at {MODEL_PATH}. Run train.py then export_onnx.py first.")
        _session = rt.InferenceSession(str(MODEL_PATH))
    return _session


class ClassifyRequest(BaseModel):
    text: str


class ClassifyResponse(BaseModel):
    label: Literal["busy", "idle"]
    confidence: float


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL_PATH.exists()}


@app.post("/classify", response_model=ClassifyResponse)
def classify(req: ClassifyRequest):
    try:
        sess = get_session()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    input_name = sess.get_inputs()[0].name
    result = sess.run(None, {input_name: np.array([[req.text]])})

    label = result[0][0]
    probs = result[1][0]  # dict {label: prob}
    confidence = float(probs.get(label, 0.0))

    return ClassifyResponse(label=label, confidence=confidence)
