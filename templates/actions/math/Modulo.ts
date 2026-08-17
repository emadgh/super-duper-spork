export default defineObject({
    name: "Modulo",
    actions: { execute: { inputs: { left: { type: "number", default: 0 }, right: { type: "number", default: 1 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { const right = Number(inputs.right ?? 1); return { result: right === 0 ? 0 : Number(inputs.left ?? 0) % right }; } } },
  });
