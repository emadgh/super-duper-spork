export default defineObject({
    name: "Subtract",
    description: "Ready action: subtract right from left.",
    actions: { execute: { label: "Subtract", inputs: { left: { type: "number", default: 0 }, right: { type: "number", default: 0 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { return { result: Number(inputs.left ?? 0) - Number(inputs.right ?? 0) }; } } },
  });
