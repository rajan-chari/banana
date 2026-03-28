"""
evaluate.py — Evaluate a trained model on the full dataset.

Usage:
    python evaluate.py [--model model.pkl] [--data-dir PATH]
"""
import argparse
import json
import pickle
from pathlib import Path

from sklearn.metrics import classification_report, confusion_matrix

DEFAULT_DATA_DIR = Path(__file__).parent.parent.parent / "pty-win" / "ml-dataset"


def find_dataset_files(data_dir: Path) -> list[Path]:
    files = sorted(data_dir.glob("labels-*.jsonl"))
    if not files:
        single = data_dir / "labels.jsonl"
        if single.exists():
            files = [single]
    return files


def load_data(data_dir: Path) -> tuple[list[str], list[str]]:
    texts, labels = [], []
    for file_path in find_dataset_files(data_dir):
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                if rec.get("deleted"):
                    continue
                texts.append("\n".join(rec["text_lines"]))
                labels.append(rec["label"])
    return texts, labels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model.pkl")
    parser.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR))
    args = parser.parse_args()

    with open(args.model, "rb") as f:
        pipeline = pickle.load(f)

    texts, labels = load_data(Path(args.data_dir))
    print(f"Evaluating on {len(texts)} samples")

    y_pred = pipeline.predict(texts)
    print(classification_report(labels, y_pred))
    print("Confusion matrix:")
    print(confusion_matrix(labels, y_pred, labels=["busy", "not_busy"]))


if __name__ == "__main__":
    main()
