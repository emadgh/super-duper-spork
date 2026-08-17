export default defineObject({
    name: "ConcatText",
    actions: { execute: { inputs: { left: { type: "string", default: "" }, right: { type: "string", default: "" }, separator: { type: "string", default: "" } }, outputs: { result: { type: "string" } }, run(_context, inputs) { return { result: `${String(inputs.left ?? "")}${String(inputs.separator ?? "")}${String(inputs.right ?? "")}` }; } } },
  });
