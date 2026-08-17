export default defineObject({
    name: "Multiply",
    description: "Ready action: multiply two numbers.",
    actions: { execute: { label: "Multiply", inputs: { left: { type: "number", default: 0 }, right: { type: "number", default: 0 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { return { result: Number(inputs.left ?? 0) * Number(inputs.right ?? 0) }; } } },
  });
