export default defineObject({
  name: "CalculatorDisplay",
  state: { display: "0", expression: "", memory: 0 },
  actions: {
    setView: {
      inputs: { display: { type: "string" }, expression: { type: "string" }, memory: { type: "number" } },
      run(context, inputs) {
        context.state.display = String(inputs.display ?? "0");
        context.state.expression = String(inputs.expression ?? "");
        context.state.memory = Number(inputs.memory ?? 0);
      },
    },
  },
  mount({ host, state }) {
    const expression = document.createElement("div");
    const display = document.createElement("div");
    const memory = document.createElement("div");
    host.style.cssText = "display:block";
    expression.style.cssText = "min-height:18px;color:#7f8aa3;font:12px system-ui;text-align:right;overflow:hidden;white-space:nowrap";
    display.style.cssText = "padding:6px 0 2px;color:#f7f9ff;font:500 36px/1.25 ui-monospace,monospace;text-align:right;overflow:hidden;white-space:nowrap";
    memory.style.cssText = "min-height:16px;color:#6ea8ff;font:11px system-ui;text-align:right";
    host.replaceChildren(expression, display, memory);
    const update = () => {
      expression.textContent = String(state.expression ?? "");
      display.textContent = String(state.display ?? "0");
      memory.textContent = Number(state.memory ?? 0) === 0 ? "" : `M ${state.memory}`;
    };
    update();
    return { update };
  },
});
