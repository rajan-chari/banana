"""
train.py — Train a busy/not_busy classifier on pty-win terminal buffer text.

Usage:
    python train.py [--data PATH] [--output model.pkl]

Default data path: ../../pty-win/ml-dataset/labels.jsonl

Data format (JSONL, one record per line — written by pty-win/src/ml-dataset.ts):
    {
        "text_lines": ["line1", ..., "line20"],  # 20-line terminal buffer snapshot
        "label": "busy|not_busy",
        "confidence": "auto|strong|uncertain",
        "source": "auto_detect|force_idle|timeout_flag",
        "timestamp": "...",
        "session_id": "..."
    }

Filtering:
    - source=timeout_flag excluded by default (uncertain boundary cases)
    - confidence=auto and strong are both used for training
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

DEFAULT_DATA = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset" / "labels.jsonl"


def load_data(path: str, exclude_sources: list[str] | None = None) -> tuple[list[str], list[str]]:
    if exclude_sources is None:
        exclude_sources = ["timeout_flag"]

    texts, labels = [], []
    skipped = 0
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("source") in exclude_sources:
                skipped += 1
                continue
            # Join text_lines into a single string for the vectorizer
            text = "\n".join(rec["text_lines"])
            texts.append(text)
            labels.append(rec["label"])

    if skipped:
        print(f"Skipped {skipped} samples (source in {exclude_sources})")
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
    parser.add_argument("--data", default=str(DEFAULT_DATA))
    parser.add_argument("--output", default="model.pkl")
    parser.add_argument("--include-timeout-flag", action="store_true",
                        help="Include timeout_flag samples (excluded by default)")
    args = parser.parse_args()

    exclude = [] if args.include_timeout_flag else ["timeout_flag"]
    texts, labels = load_data(args.data, exclude_sources=exclude)

    busy = labels.count("busy")
    not_busy = labels.count("not_busy")
    print(f"Loaded {len(texts)} samples ({busy} busy, {not_busy} not_busy)")

    if len(texts) < 10:
        print("WARNING: very few samples — collect more before training")

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
