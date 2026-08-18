/// <reference lib="dom" />
import { EventRuntime } from "../src/client/runtime.ts";
import type { ObjectDefinition } from "../src/client/model.ts";

Deno.test("expression binding resolves event board state and previous action output", () => {
  const definitions = new Map<string, ObjectDefinition>([
    ["Trigger.ts", { name: "Trigger", events: { go: { outputs: { base: { type: "number" } } } } }],
    ["Source.ts", { name: "Source", state: { value: 2 } }],
    ["Math.ts", {
      name: "Math",
      state: { captured: 0 },
      actions: {
        produce: {
          outputs: { result: { type: "number" } },
          run() { return { result: 5 }; },
        },
        capture: {
          inputs: { value: { type: "number" } },
          run(context, inputs) { context.state.captured = Number(inputs.value); },
        },
      },
    }],
  ]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "source", objectFile: "Source.ts" },
      { id: "math", objectFile: "Math.ts" },
    ],
    [{
      id: "expression-rule",
      event: { instanceId: "trigger", name: "go" },
      actions: [
        { id: "first", action: { instanceId: "math", name: "produce" }, inputs: {}, outputs: {} },
        {
          id: "capture",
          action: { instanceId: "math", name: "capture" },
          inputs: {
            value: {
              kind: "expression",
              source: "@event.base + @board.offset + @state.source.value + @output.first.result",
            },
          },
          outputs: {},
        },
      ],
    }],
    { offset: { type: "number", value: 3 } },
  );

  runtime.emit("trigger", "go", { base: 4 });
  assertEquals(runtime.getState("math")?.captured, 14);
});

Deno.test("condition input accepts an expression binding", () => {
  const definitions = new Map<string, ObjectDefinition>([
    ["Trigger.ts", { name: "Trigger", events: { clicked: { outputs: { value: { type: "number" } } } } }],
    ["Gate.ts", {
      name: "Gate",
      conditions: {
        atLeast: {
          inputs: {
            value: { type: "number" },
            minimum: { type: "number", default: 0 },
          },
          test(_context, inputs) {
            return Number(inputs.value) >= Number(inputs.minimum);
          },
        },
      },
    }],
    ["Counter.ts", {
      name: "Counter",
      state: { value: 0 },
      actions: {
        increment: {
          run(context) {
            context.state.value = Number(context.state.value ?? 0) + 1;
          },
        },
      },
    }],
  ]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "gate", objectFile: "Gate.ts" },
      { id: "counter", objectFile: "Counter.ts" },
    ],
    [{
      id: "expression-condition",
      event: { instanceId: "trigger", name: "clicked" },
      conditions: [{
        id: "threshold",
        condition: { instanceId: "gate", name: "atLeast" },
        inputs: {
          value: { kind: "expression", source: "@event.value + @board.bump" },
          minimum: { kind: "literal", value: 7 },
        },
      }],
      actions: [{ id: "increment", action: { instanceId: "counter", name: "increment" }, inputs: {}, outputs: {} }],
    }],
    { bump: { type: "number", value: 2 } },
  );

  runtime.emit("trigger", "clicked", { value: 5 });
  assertEquals(runtime.getState("counter")?.value, 1);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
