export default defineObject({
  name: "StatusBar",
  state: { message: "Starting Phone Book…", kind: "info" },
  actions: {
    set: {
      inputs: { message: { type: "string" }, kind: { type: "string", default: "info" } },
      run(context, inputs) {
        context.state.message = String(inputs.message ?? "");
        context.state.kind = String(inputs.kind ?? "info");
      },
    },
  },
  render({ state }) {
    const error = state.kind === "error";
    return (
      <div class="flex items-center gap-2">
        <span class={`size-2 rounded-full ${error ? "bg-rose-400" : "bg-emerald-400"}`}></span>
        <span class={error ? "text-rose-300" : "text-slate-400"}>{String(state.message ?? "")}</span>
      </div>
    );
  },
});
