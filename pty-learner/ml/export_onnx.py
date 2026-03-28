"""
export_onnx.py — Export a trained sklearn pipeline to ONNX format.

Usage:
    python export_onnx.py [--model model.pkl] [--output model.onnx]

The exported model can be loaded by onnxruntime in TypeScript (pty-win)
or by the FastAPI inference service.
"""
import argparse
import pickle

import numpy as np
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import StringTensorType


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model.pkl")
    parser.add_argument("--output", default="model.onnx")
    args = parser.parse_args()

    with open(args.model, "rb") as f:
        pipeline = pickle.load(f)

    # Input: a single string (terminal buffer text)
    initial_type = [("string_input", StringTensorType([None, 1]))]
    onnx_model = convert_sklearn(pipeline, initial_types=initial_type, target_opset=17)

    with open(args.output, "wb") as f:
        f.write(onnx_model.SerializeToString())

    print(f"ONNX model saved to {args.output}")
    print(f"Input: string_input [batch, 1]")
    print(f"Output: label (busy|idle), probabilities")


if __name__ == "__main__":
    main()
