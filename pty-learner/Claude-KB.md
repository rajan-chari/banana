# Claude-KB — pty-learner

Domain knowledge, lessons learned, and gotchas for the pty-learner workspace.

## Project Context

- **Goal**: Classify pty-win terminal session state (busy vs idle) from screen buffer text
- **Input**: Raw terminal buffer text (what xterm-headless sees)
- **Output**: `busy` | `idle` label (binary classification, may expand)
- **Integration target**: pty-win's idle detection (`src/screen-detector.ts`)
- **Current pty-win approach**: Regex patterns on screen buffer + quiet-period timer

## Architecture Notes

- ONNX export enables language-agnostic inference — pty-win (TypeScript) can load the model via `onnxruntime-node`
- FastAPI service (port 8710) is an alternative integration path if ONNX loading is complex in TS
- Training data source: pty-win `snapshot.txt` files (the screen buffer snapshots already captured)

## Lessons Learned

<!-- Add entries as: ### YYYY-MM-DD: Title -->
