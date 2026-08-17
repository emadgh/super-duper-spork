export default defineObject({
  name: "DigitInput",
  actions: { execute: {
    inputs: { digit: { type: "string" }, entry: { type: "string" }, waiting: { type: "boolean" } },
    outputs: { entry: { type: "string" }, display: { type: "string" }, waiting: { type: "boolean" } },
    run(_context, inputs) {
      const digit = String(inputs.digit ?? "0").replace(/[^0-9]/g, "").slice(-1) || "0";
      const current = String(inputs.entry ?? "0");
      const next = Boolean(inputs.waiting) || current === "0" ? digit : (current.length < 14 ? current + digit : current);
      return { entry: next, display: next, waiting: false };
    },
  } },
});
