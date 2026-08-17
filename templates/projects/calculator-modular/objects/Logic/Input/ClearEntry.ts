export default defineObject({
  name: "ClearEntry",
  actions: { execute: { outputs: { entry: { type: "string" }, display: { type: "string" }, waiting: { type: "boolean" } }, run() { return { entry: "0", display: "0", waiting: true }; } } },
});
