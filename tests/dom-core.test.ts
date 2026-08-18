import { evaluateObjectFile } from "../src/client/compiler.ts";
import { Fragment, h, isVNode, normalizeChildren, Slot } from "../src/client/dom-core/index.ts";

Deno.test("DomCore h creates declarative element trees", () => {
  const tree = h(
    "section",
    { class: "panel", id: "demo" },
    h("h1", null, "Hello"),
    [null, false, h("span", { "data-kind": "value" }, 42)],
  );

  assert(isVNode(tree));
  if (!isVNode(tree) || tree.kind !== "element") return;
  assertEquals(tree.tag, "section");
  assertEquals(tree.props.class, "panel");
  assertEquals(tree.children.length, 2);
});

Deno.test("DomCore supports fragments and named slots", () => {
  const slot = Slot({ name: "content", class: "content-slot" });
  const fragment = h(Fragment, null, "before", slot, "after");

  assertEquals(slot.kind, "slot");
  assertEquals(slot.name, "content");
  assert(isVNode(fragment));
  if (!isVNode(fragment) || fragment.kind !== "fragment") return;
  assertEquals(fragment.children.length, 3);
});

Deno.test("normalizeChildren removes empty boolean values and flattens arrays", () => {
  const children = normalizeChildren(["a", [false, "b", [null, 3]], true, undefined]);
  assertEquals(children.length, 3);
  assertEquals(children[0], "a");
  assertEquals(children[1], "b");
  assertEquals(children[2], 3);
});

Deno.test("object evaluator injects h Fragment and Slot for TSX-compiled modules", () => {
  const definition = evaluateObjectFile({
    file: "UI/Demo.tsx",
    source: "",
    compiled: `
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.default = defineObject({
        name: "Demo",
        render({ state }) {
          return h("main", { class: "demo" },
            h(Fragment, null,
              h("strong", null, String(state.value ?? "ok")),
              h(Slot, { name: "body" })
            )
          );
        }
      });
    `,
  });

  assertEquals(definition.name, "Demo");
  assert(typeof definition.render === "function");
  const tree = definition.render?.({ state: { value: "ready" }, props: {}, emit: () => undefined });
  assert(isVNode(tree));
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
