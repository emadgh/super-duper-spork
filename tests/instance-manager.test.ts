/// <reference lib="dom" />
import { EventRuntime } from "../src/client/runtime.ts";
import type { ObjectDefinition } from "../src/client/model.ts";

Deno.test("runtime resolves property defaults and per-instance overrides", () => {
  const definitions = new Map<string, ObjectDefinition>([["Counter.ts", {
    name: "Counter",
    properties: {
      step: { type: "number", default: 1 },
      label: { type: "string", default: "Counter" },
    },
    state: { value: 0 },
    actions: {
      increment: {
        run(context) {
          context.state.value = Number(context.state.value ?? 0) + Number(context.props.step ?? 0);
        },
      },
    },
  }]]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "defaultCounter", objectFile: "Counter.ts" },
      { id: "fastCounter", objectFile: "Counter.ts", props: { step: 5, label: "Fast" } },
    ],
    [
      {
        id: "default-rule",
        event: { instanceId: "defaultCounter", name: "go" },
        actions: [{ id: "default-inc", action: { instanceId: "defaultCounter", name: "increment" }, inputs: {}, outputs: {} }],
      },
      {
        id: "fast-rule",
        event: { instanceId: "fastCounter", name: "go" },
        actions: [{ id: "fast-inc", action: { instanceId: "fastCounter", name: "increment" }, inputs: {}, outputs: {} }],
      },
    ],
    {},
  );

  assertEquals(runtime.getProps("defaultCounter")?.step, 1);
  assertEquals(runtime.getProps("defaultCounter")?.label, "Counter");
  assertEquals(runtime.getProps("fastCounter")?.step, 5);
  assertEquals(runtime.getProps("fastCounter")?.label, "Fast");

  runtime.emit("defaultCounter", "go");
  runtime.emit("fastCounter", "go");
  runtime.emit("fastCounter", "go");

  assertEquals(runtime.getState("defaultCounter")?.value, 1);
  assertEquals(runtime.getState("fastCounter")?.value, 10);
});

Deno.test("instances backed by one ObjectDefinition keep independent mutable state", () => {
  const definitions = new Map<string, ObjectDefinition>([["Value.ts", {
    name: "Value",
    state: { value: 0 },
    actions: {
      set: {
        inputs: { value: { type: "number" } },
        run(context, inputs) {
          context.state.value = Number(inputs.value ?? 0);
        },
      },
    },
  }]]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "left", objectFile: "Value.ts" },
      { id: "right", objectFile: "Value.ts" },
    ],
    [{
      id: "set-left",
      event: { instanceId: "left", name: "go" },
      actions: [{
        id: "set",
        action: { instanceId: "left", name: "set" },
        inputs: { value: { kind: "literal", value: 42 } },
        outputs: {},
      }],
    }],
    {},
  );

  runtime.emit("left", "go");
  assertEquals(runtime.getState("left")?.value, 42);
  assertEquals(runtime.getState("right")?.value, 0);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
