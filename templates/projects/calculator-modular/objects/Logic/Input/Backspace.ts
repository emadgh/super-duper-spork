export default defineObject({
  name: "Backspace",
  actions: { execute: {
    inputs: { entry: { type: "string" }, waiting: { type: "boolean" } },
    outputs: { entry: { type: "string" }, display: { type: "string" }, waiting: { type: "boolean" } },
    run(_context, inputs) {
      if (Boolean(inputs.waiting)) return { entry: "0", display: "0", waiting: true };
      const value = String(inputs.entry ?? "0");
      const next = value.length <= 1 ? "0" : value.slice(0, -1);
      return { entry: next, display: next, waiting: false };
    },
  } },
});
