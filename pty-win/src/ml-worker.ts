import { parentPort } from "worker_threads";
import * as ort from "onnxruntime-node";

let session: ort.InferenceSession | null = null;
let sessionPath = "";

parentPort!.on("message", async ({ id, modelPath, lines }: { id: number; modelPath: string; lines: string[] }) => {
  try {
    if (!session || sessionPath !== modelPath) {
      session = await ort.InferenceSession.create(modelPath);
      sessionPath = modelPath;
    }
    const text = lines.join("\n");
    const inputTensor = new ort.Tensor("string", [text], [1, 1]);
    const result = await session.run({ string_input: inputTensor });
    const label = result["output_label"].data[0] as string;
    const probs = result["output_probability"].data[0] as unknown as Record<string, number>;
    const confidence = probs["busy"];
    parentPort!.postMessage({ id, label, confidence, error: null });
  } catch (err) {
    parentPort!.postMessage({ id, label: null, confidence: null, error: String(err) });
  }
});
