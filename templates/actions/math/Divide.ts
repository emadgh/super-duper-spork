export default defineObject({
    name: "Divide",
    description: "Ready action: divide left by right.",
    actions: { execute: { label: "Divide", inputs: { left: { type: "number", default: 0 }, right: { type: "number", default: 1 } }, outputs: { result: { type: "number" }, valid: { type: "boolean" } }, run(_context, inputs) { const right = Number(inputs.right ?? 0); return right === 0 ? { result: 0, valid: false } : { result: Number(inputs.left ?? 0) / right, valid: true }; } } },
  });
