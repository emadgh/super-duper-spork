export default defineObject({
    name: "Clamp",
    actions: { execute: { inputs: { value: { type: "number", default: 0 }, min: { type: "number", default: 0 }, max: { type: "number", default: 1 } }, outputs: { result: { type: "number" } }, run(_context, inputs) { const min = Number(inputs.min ?? 0); const max = Number(inputs.max ?? 1); return { result: Math.min(Math.max(Number(inputs.value ?? 0), Math.min(min, max)), Math.max(min, max)) }; } } },
  });
