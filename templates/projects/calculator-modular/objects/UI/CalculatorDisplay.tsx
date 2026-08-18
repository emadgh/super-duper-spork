export default defineObject({
  name: "CalculatorDisplay",
  description: "Pure calculator view component. Display state is supplied through actions.",

  state: {
    display: "0",
    expression: "",
    memory: 0,
  },

  actions: {
    setView: {
      inputs: {
        display: { type: "string" },
        expression: { type: "string" },
        memory: { type: "number" },
      },
      run(context, inputs) {
        context.state.display = String(inputs.display ?? "0");
        context.state.expression = String(inputs.expression ?? "");
        context.state.memory = Number(inputs.memory ?? 0);
      },
    },
  },

  render({ state }) {
    const memory = Number(state.memory ?? 0);
    return (
      <section class="calculator-display" aria-live="polite">
        <div class="calculator-display__expression" title={String(state.expression ?? "")}>
          {String(state.expression ?? "")}
        </div>
        <output class="calculator-display__value" title={String(state.display ?? "0")}>
          {String(state.display ?? "0")}
        </output>
        <div class="calculator-display__memory">
          {memory === 0 ? "" : `M ${memory}`}
        </div>
      </section>
    );
  },
});
