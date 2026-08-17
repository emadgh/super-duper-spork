export default defineObject({
  name: "DecimalInput",
  actions: { execute: {
    inputs: { entry: { type: "string" }, waiting: { type: "boolean" } },
    outputs: { entry: { type: "string" }, display: { type: "string" }, waiting: { type: "boolean" } },
    run(_context, inputs) {
      const current = Boolean(inputs.waiting) ? "0" : String(inputs.entry ?? "0");
      const next = current.includes(".") ? current : `${current}.`;
      return { entry: next, display: next, waiting: false };
    },
  } },
});
