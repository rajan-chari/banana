"""
train.py — Train a busy/not_busy classifier on pty-win terminal buffer text.

Usage:
    python train.py [--data-dir PATH] [--output model.pkl] [--exclude-timeout-flag]

Default data dir: ../../pty-win/ml-dataset/

Data format (JSONL, one record per line — written by pty-win/src/ml-dataset.ts):
    {
        "text_lines": ["line1", ..., "line20"],  # 20-line terminal buffer snapshot
        "label": "busy|not_busy",
        "confidence": "auto|strong|uncertain",
        "source": "auto_detect|force_idle|timeout_flag",
        "timestamp": "...",
        "session_id": "..."
    }

Notes:
    - deleted records are always excluded
    - timeout_flag samples included by default (amber reviewed and corrected them)
    - class_weight='balanced' handles the ~6% busy / ~94% not_busy imbalance
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

DEFAULT_DATA_DIR = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset"


def find_dataset_files(data_dir: Path) -> list[Path]:
    files = sorted(data_dir.glob("labels-*.jsonl"))
    if not files:
        single = data_dir / "labels.jsonl"
        if single.exists():
            files = [single]
    return files


def load_data(data_dir: Path, exclude_timeout_flag: bool = False) -> tuple[list[str], list[str]]:
    files = find_dataset_files(data_dir)
    if not files:
        raise FileNotFoundError(f"No labels-*.jsonl files found in {data_dir}")

    texts, labels = [], []
    skipped = 0

    for file_path in files:
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if rec.get("deleted"):
                    skipped += 1
                    continue
                if exclude_timeout_flag and rec.get("source") == "timeout_flag":
                    skipped += 1
                    continue
                text = "\n".join(rec["text_lines"])
                texts.append(text)
                labels.append(rec["label"])

    if skipped:
        print(f"Skipped {skipped} records (deleted or filtered)")
    return texts, labels


def build_pipeline(onnx_compatible: bool = False) -> Pipeline:
    # char_wb gives slightly better precision; word tokenizer required for ONNX export
    # (skl2onnx only supports analyzer='word')
    if onnx_compatible:
        tfidf = TfidfVectorizer(analyzer="word", ngram_range=(1, 2),
                                max_features=10_000, sublinear_tf=True)
    else:
        tfidf = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4),
                                max_features=10_000, sublinear_tf=True)
    return Pipeline([
        ("tfidf", tfidf),
        ("clf", LogisticRegression(max_iter=1000, C=1.0, class_weight="balanced")),
    ])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    parser.add_argument("--output", default="model.pkl")
    parser.add_argument("--exclude-timeout-flag", action="store_true",
                        help="Exclude timeout_flag samples (included by default — amber reviewed them)")
    parser.add_argument("--onnx-compatible", action="store_true",
                        help="Use word tokenizer (required for ONNX export via skl2onnx)")
    args = parser.parse_args()

    texts, labels = load_data(Path(args.data_dir), exclude_timeout_flag=args.exclude_timeout_flag)

    busy = labels.count("busy")
    not_busy = labels.count("not_busy")
    print(f"Loaded {len(texts)} samples — busy: {busy} ({busy/len(texts)*100:.1f}%), "
          f"not_busy: {not_busy} ({not_busy/len(texts)*100:.1f}%)")
    if args.onnx_compatible:
        print("Using word tokenizer (ONNX-compatible mode)")

    if len(texts) < 10:
        print("WARNING: very few samples — collect more before training")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = build_pipeline(onnx_compatible=args.onnx_compatible)
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print(classification_report(y_test, y_pred))

    with open(args.output, "wb") as f:
        pickle.dump(pipeline, f)
    print(f"Model saved to {args.output}")


if __name__ == "__main__":
    main()
