export default defineObject({
  name: "CalculatorShell",
  description: "Layout-only calculator component. Display and keys are composed through named DomCore slots.",

  render() {
    return (
      <main class="calculator-shell" aria-label="Calculator">
        <Slot name="display" class="calculator-shell__display-slot" />
        <Slot name="keypad" class="calculator-shell__keypad" />
      </main>
    );
  },
});
