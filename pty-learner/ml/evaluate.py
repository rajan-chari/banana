"""
evaluate.py — Evaluate a trained model on a held-out dataset.

Usage:
    python evaluate.py [--model model.pkl] [--data eval.jsonl]
"""
import argparse
import json
import pickle

from sklearn.metrics import classification_report, confusion_matrix


def load_data(path: str) -> tuple[list[str], list[str]]:
    texts, labels = [], []
    with open(path) as f:
        for line in f:
            rec = json.loads(line)
            texts.append(rec["text"])
            labels.append(rec["label"])
    return texts, labels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model.pkl")
    parser.add_argument("--data", default="eval.jsonl")
    args = parser.parse_args()

    with open(args.model, "rb") as f:
        pipeline = pickle.load(f)

    texts, labels = load_data(args.data)
    print(f"Evaluating on {len(texts)} samples")

    y_pred = pipeline.predict(texts)
    print(classification_report(labels, y_pred))
    print("Confusion matrix:")
    print(confusion_matrix(labels, y_pred, labels=["busy", "idle"]))


if __name__ == "__main__":
    main()
