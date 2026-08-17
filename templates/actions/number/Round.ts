export default defineObject({
    name: "Round",
    actions: { execute: { inputs: { value: { type: "number", default: 0 }, decimals: { type: "number", default: 0 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { const decimals = Math.max(0, Math.min(12, Math.trunc(Number(inputs.decimals ?? 0)))); const scale = 10 ** decimals; return { result: Math.round(Number(inputs.value ?? 0) * scale) / scale }; } } },
  });
