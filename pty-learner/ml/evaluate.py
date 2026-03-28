"""
evaluate.py — Evaluate a trained model on a held-out dataset.

Usage:
    python evaluate.py [--model model.pkl] [--data eval.jsonl]
"""
import argparse
import json
import pickle
from pathlib import Path

from sklearn.metrics import classification_report, confusion_matrix


DEFAULT_DATA = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset" / "labels.jsonl"


def load_data(path: str) -> tuple[list[str], list[str]]:
    texts, labels = [], []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            texts.append("\n".join(rec["text_lines"]))
            labels.append(rec["label"])
    return texts, labels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model.pkl")
    parser.add_argument("--data", default=str(DEFAULT_DATA))
    args = parser.parse_args()

    with open(args.model, "rb") as f:
        pipeline = pickle.load(f)

    texts, labels = load_data(args.data)
    print(f"Evaluating on {len(texts)} samples")

    y_pred = pipeline.predict(texts)
    print(classification_report(labels, y_pred))
    print("Confusion matrix:")
    print(confusion_matrix(labels, y_pred, labels=["busy", "not_busy"]))


if __name__ == "__main__":
    main()
