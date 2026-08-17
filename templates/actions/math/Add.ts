export default defineObject({
    name: "Add",
    description: "Ready action: add two numbers.",
    actions: { execute: { label: "Add", inputs: { left: { type: "number", default: 0 }, right: { type: "number", default: 0 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { return { result: Number(inputs.left ?? 0) + Number(inputs.right ?? 0) }; } } },
  });
