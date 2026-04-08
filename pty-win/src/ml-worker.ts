import { parentPort } from "worker_threads";

let ort: typeof import("onnxruntime-node") | null = null;
let session: any = null;
let sessionPath = "";

try {
  ort = await import("onnxruntime-node");
} catch {
  // onnxruntime-node not installed — ML inference unavailable
  parentPort!.on("message", ({ id }) => {
    parentPort!.postMessage({ id, label: null, confidence: null, error: "onnxruntime-node not installed" });
  });
}

if (ort) {
  const ortRef = ort;
  parentPort!.on("message", async ({ id, modelPath, lines }: { id: number; modelPath: string; lines: string[] }) => {
    try {
      if (!session || sessionPath !== modelPath) {
        session = await ortRef.InferenceSession.create(modelPath);
        sessionPath = modelPath;
      }
      const text = lines.join("\n");
      const inputTensor = new ortRef.Tensor("string", [text], [1, 1]);
      const result = await session.run({ string_input: inputTensor });
      const label = result["output_label"].data[0] as string;
      const probs = result["output_probability"].data[0] as unknown as Record<string, number>;
      const confidence = probs["busy"];
      parentPort!.postMessage({ id, label, confidence, error: null });
    } catch (err) {
      parentPort!.postMessage({ id, label: null, confidence: null, error: String(err) });
    }
  });
}
