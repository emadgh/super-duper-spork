export default defineObject({
  name: "ClearAll",
  actions: { execute: { outputs: { entry: { type: "string" }, display: { type: "string" }, left: { type: "number" }, operator: { type: "string" }, waiting: { type: "boolean" }, expression: { type: "string" } }, run() { return { entry: "0", display: "0", left: 0, operator: "", waiting: true, expression: "" }; } } },
});
