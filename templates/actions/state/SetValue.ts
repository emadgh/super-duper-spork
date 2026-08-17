export default defineObject({
    name: "SetValue",
    description: "Pass a value through; map the output to a Blackboard variable.",
    actions: { execute: { inputs: { value: { type: "any" } }, outputs: { value: { type: "any" } }, run(_context, inputs) { return { value: inputs.value }; } } },
  });
