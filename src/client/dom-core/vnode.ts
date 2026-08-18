export const Fragment = Symbol.for("spork.dom.fragment");

export type DomPrimitive = string | number | bigint;
export type DomChild = VNode | DomPrimitive | boolean | null | undefined | readonly DomChild[];

export interface ElementVNode {
  kind: "element";
  tag: string;
  props: Readonly<Record<string, unknown>>;
  children: readonly DomChild[];
}

export interface FragmentVNode {
  kind: "fragment";
  children: readonly DomChild[];
}

export interface SlotVNode {
  kind: "slot";
  name: string;
  props: Readonly<Record<string, unknown>>;
  children: readonly DomChild[];
}

export type VNode = ElementVNode | FragmentVNode | SlotVNode;
export type FunctionComponent<Props extends Record<string, unknown> = Record<string, unknown>> =
  (props: Props & { children?: readonly DomChild[] }) => DomChild;
export type VNodeType = string | typeof Fragment | FunctionComponent;

export function h(
  type: VNodeType,
  rawProps: Record<string, unknown> | null,
  ...rawChildren: DomChild[]
): DomChild {
  const props = Object.freeze({ ...(rawProps ?? {}) });
  const children = normalizeChildren([
    ...rawChildren,
    ...(rawChildren.length === 0 && "children" in props ? [props.children as DomChild] : []),
  ]);

  if (type === Fragment) return { kind: "fragment", children };
  if (typeof type === "function") {
    return type({ ...props, children });
  }
  return { kind: "element", tag: type, props, children };
}

export function Slot(rawProps: Record<string, unknown>): SlotVNode {
  const name = String(rawProps.name ?? "default").trim() || "default";
  const children = normalizeChildren([rawProps.children as DomChild]);
  const { children: _children, ...props } = rawProps;
  return { kind: "slot", name, props: Object.freeze(props), children };
}

export function normalizeChildren(children: readonly DomChild[]): DomChild[] {
  const result: DomChild[] = [];
  const visit = (child: DomChild): void => {
    if (Array.isArray(child)) {
      for (const nested of child) visit(nested);
      return;
    }
    if (child === null || child === undefined || child === false || child === true) return;
    result.push(child);
  };
  for (const child of children) visit(child);
  return result;
}

export function isVNode(value: unknown): value is VNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "element" || kind === "fragment" || kind === "slot";
}
