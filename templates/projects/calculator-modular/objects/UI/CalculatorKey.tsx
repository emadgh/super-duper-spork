export default defineObject({
  name: "CalculatorKey",
  description: "Reusable TSX key component. Every visible calculator key remains an independent configured instance.",

  events: {
    pressed: {
      outputs: {
        key: { type: "string" },
      },
    },
  },

  render({ props, emit }) {
    const label = String(props.label ?? props.key ?? "?");
    const key = String(props.key ?? label);
    const kind = String(props.kind ?? "digit");
    const span = Math.max(1, Math.min(4, Number(props.span ?? 1)));

    return (
      <button
        type="button"
        class={`calculator-key calculator-key--${kind}`}
        data-kind={kind}
        data-span={String(span)}
        aria-label={label}
        onClick={() => emit("pressed", { key })}
      >
        {label}
      </button>
    );
  },
});
