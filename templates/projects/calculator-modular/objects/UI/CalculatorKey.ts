export default defineObject({
  name: "CalculatorKey",
  description: "Reusable key component. Every visible calculator key is a separate configured instance of this file.",
  events: { pressed: { outputs: { key: { type: "string" } } } },
  mount({ host, props, emit }) {
    const label = String(props.label ?? props.key ?? "?");
    const key = String(props.key ?? label);
    const kind = String(props.kind ?? "digit");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "width:100%;height:44px;border:0;border-radius:11px;background:#242936;color:#f5f7fb;font:600 14px system-ui;cursor:pointer";
    if (kind === "operator") button.style.cssText += ";background:#244d87;color:#dcecff";
    if (kind === "danger") button.style.cssText += ";background:#533039;color:#ffdfe4";
    if (kind === "memory") button.style.cssText += ";background:#202d3d;color:#9bc7ff;font-size:12px";
    if (kind === "equals") button.style.cssText += ";background:#2e67b6;color:white";
    host.style.gridColumn = `span ${Math.max(1, Number(props.span ?? 1))}`;
    host.append(button);
    const click = () => emit("pressed", { key });
    button.addEventListener("click", click);
    return { dispose: () => button.removeEventListener("click", click) };
  },
});
