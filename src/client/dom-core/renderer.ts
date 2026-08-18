import { isVNode, type DomChild, type SlotVNode, type VNode } from "./vnode.ts";

export interface DomMount {
  readonly slots: Record<string, HTMLElement>;
  update(): void;
  dispose(): void;
}

interface RenderResult {
  nodes: Node[];
  slots: Map<string, HTMLElement>;
  cleanups: Array<() => void>;
}

export function mountDom(host: HTMLElement, render: () => DomChild): DomMount {
  let disposed = false;
  let slots = new Map<string, HTMLElement>();
  let cleanups: Array<() => void> = [];

  const paint = (): void => {
    if (disposed) return;

    const preservedChildren = new Map<string, Node[]>();
    for (const [name, element] of slots) preservedChildren.set(name, [...element.childNodes]);

    for (const cleanup of cleanups.splice(0)) cleanup();

    const next = renderChild(render());
    for (const [name, nextSlot] of next.slots) {
      const preserved = preservedChildren.get(name);
      if (preserved?.length) nextSlot.append(...preserved);
    }

    host.replaceChildren(...next.nodes);
    slots = next.slots;
    cleanups = next.cleanups;
  };

  paint();

  return {
    get slots() {
      return Object.fromEntries(slots);
    },
    update: paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      slots.clear();
      host.replaceChildren();
    },
  };
}

function renderChild(child: DomChild): RenderResult {
  const result: RenderResult = { nodes: [], slots: new Map(), cleanups: [] };
  appendChild(result, child);
  return result;
}

function appendChild(result: RenderResult, child: DomChild): void {
  if (Array.isArray(child)) {
    for (const nested of child) appendChild(result, nested);
    return;
  }
  if (child === null || child === undefined || typeof child === "boolean") return;

  if (typeof child === "string" || typeof child === "number" || typeof child === "bigint") {
    result.nodes.push(document.createTextNode(String(child)));
    return;
  }

  if (!isVNode(child)) throw new Error("DomCore received an unsupported render value.");

  if (child.kind === "fragment") {
    for (const nested of child.children) appendChild(result, nested);
    return;
  }

  const element = child.kind === "slot"
    ? createSlotElement(child, result)
    : document.createElement(child.tag);

  applyProps(element, child.props, result.cleanups);

  const childResult: RenderResult = { nodes: [], slots: new Map(), cleanups: [] };
  for (const nested of child.children) appendChild(childResult, nested);
  element.append(...childResult.nodes);
  for (const [name, slot] of childResult.slots) result.slots.set(name, slot);
  result.cleanups.push(...childResult.cleanups);

  result.nodes.push(element);
}

function createSlotElement(vnode: SlotVNode, result: RenderResult): HTMLElement {
  if (result.slots.has(vnode.name)) throw new Error(`Duplicate DOM slot: ${vnode.name}`);
  const element = document.createElement("div");
  element.dataset.sporkSlot = vnode.name;
  result.slots.set(vnode.name, element);
  return element;
}

function applyProps(
  element: HTMLElement,
  props: Readonly<Record<string, unknown>>,
  cleanups: Array<() => void>,
): void {
  for (const [rawName, value] of Object.entries(props)) {
    if (rawName === "children" || rawName === "key" || rawName === "name") continue;
    if (value === null || value === undefined || value === false) continue;

    if (rawName === "class" || rawName === "className") {
      element.className = String(value);
      continue;
    }

    if (rawName === "ref" && typeof value === "function") {
      (value as (element: HTMLElement) => void)(element);
      continue;
    }

    if (rawName === "style" && value && typeof value === "object" && !Array.isArray(value)) {
      applyStyle(element, value as Record<string, unknown>);
      continue;
    }

    if (/^on[A-Z]/.test(rawName) && typeof value === "function") {
      const eventName = rawName.slice(2).toLowerCase();
      const listener = value as EventListener;
      element.addEventListener(eventName, listener);
      cleanups.push(() => element.removeEventListener(eventName, listener));
      continue;
    }

    if (rawName.startsWith("data-") || rawName.startsWith("aria-")) {
      element.setAttribute(rawName, String(value));
      continue;
    }

    const propertyName = rawName === "htmlFor" ? "htmlFor" : rawName;
    if (propertyName in element && !isUnsafeProperty(propertyName)) {
      try {
        (element as unknown as Record<string, unknown>)[propertyName] = value === true ? true : value;
        continue;
      } catch {
        // Fall back to an attribute for browser-specific read-only properties.
      }
    }

    if (value === true) element.setAttribute(rawName, "");
    else element.setAttribute(rawName, String(value));
  }
}

function applyStyle(element: HTMLElement, styles: Record<string, unknown>): void {
  for (const [name, rawValue] of Object.entries(styles)) {
    if (rawValue === null || rawValue === undefined) continue;
    const value = String(rawValue);
    if (name.startsWith("--")) element.style.setProperty(name, value);
    else (element.style as unknown as Record<string, string>)[name] = value;
  }
}

function isUnsafeProperty(name: string): boolean {
  return name === "innerHTML" || name === "outerHTML" || name === "textContent";
}

export function isRenderableVNode(value: unknown): value is VNode {
  return isVNode(value);
}
