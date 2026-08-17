export default defineObject({
    name: "Equals",
    actions: { execute: { inputs: { left: { type: "any" }, right: { type: "any" } }, outputs: { result: { type: "boolean" } }, run(_context, inputs) { return { result: Object.is(inputs.left, inputs.right) }; } } },
  });
