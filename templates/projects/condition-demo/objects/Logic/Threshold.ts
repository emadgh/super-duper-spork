export default defineObject({
  name: "Threshold",
  description: "Reusable numeric threshold condition example.",
  conditions: {
    atLeast: {
      label: "Value is at least",
      inputs: {
        value: { type: "number", default: 0 },
        minimum: { type: "number", default: 10 },
      },
      test(_context, inputs) {
        return Number(inputs.value ?? 0) >= Number(inputs.minimum ?? 0);
      },
    },
  },
});
