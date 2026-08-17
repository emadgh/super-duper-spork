export default defineObject({
  name: "CalculatorShell",
  description: "Layout-only component. It owns no calculator behavior and exposes display/keypad slots.",
  mount({ host }) {
    host.replaceChildren();
    const shell = document.createElement("div");
    shell.style.cssText = "width:min(100%,320px);margin:0 auto;padding:14px;border-radius:18px;background:#151820;border:1px solid #303746;box-shadow:0 18px 50px #0005;box-sizing:border-box";
    const display = document.createElement("div");
    display.style.marginBottom = "12px";
    const keypad = document.createElement("div");
    keypad.style.cssText = "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px";
    shell.append(display, keypad);
    host.append(shell);
    return { slots: { display, keypad } };
  },
});
