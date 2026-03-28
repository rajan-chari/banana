"""
train.py — Train a busy/idle classifier on pty-win terminal buffer text.

Usage:
    python train.py [--data data.jsonl] [--output model.pkl]

Data format (JSONL, one record per line):
    {"text": "<terminal buffer text>", "label": "busy|idle"}
"""
import argparse
import json
import pickle
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split


def load_data(path: str) -> tuple[list[str], list[str]]:
    texts, labels = [], []
    with open(path) as f:
        for line in f:
            rec = json.loads(line)
            texts.append(rec["text"])
            labels.append(rec["label"])
    return texts, labels


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            analyzer="char_wb",
            ngram_range=(2, 4),
            max_features=10_000,
            sublinear_tf=True,
        )),
        ("clf", LogisticRegression(max_iter=1000, C=1.0)),
    ])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data.jsonl")
    parser.add_argument("--output", default="model.pkl")
    args = parser.parse_args()

    texts, labels = load_data(args.data)
    print(f"Loaded {len(texts)} samples ({labels.count('busy')} busy, {labels.count('idle')} idle)")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print(classification_report(y_test, y_pred))

    with open(args.output, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"Model saved to {args.output}")


if __name__ == "__main__":
    main()
