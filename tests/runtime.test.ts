import { EventRuntime } from "../src/client/runtime.ts";
import type { ObjectDefinition } from "../src/client/model.ts";

Deno.test("action output can feed next action and blackboard", () => {
  const definitions = new Map<string, ObjectDefinition>([
    ["Trigger.ts", {
      name: "Trigger",
      state: {},
      events: { calculate: { outputs: { left: { type: "number" }, right: { type: "number" } } } },
      actions: {},
    }],
    ["Calculator.ts", {
      name: "Calculator",
      state: {},
      events: {},
      actions: {
        add: {
          inputs: { left: { type: "number" }, right: { type: "number" } },
          outputs: { result: { type: "number" } },
          run(_context, inputs) {
            return { result: Number(inputs.left) + Number(inputs.right) };
          },
        },
      },
    }],
    ["Display.ts", {
      name: "Display",
      state: { value: 0 },
      events: {},
      actions: {
        setValue: {
          inputs: { value: { type: "number" } },
          run(context, inputs) {
            context.state.value = inputs.value;
          },
        },
      },
    }],
  ]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger1", objectFile: "Trigger.ts" },
      { id: "calculator1", objectFile: "Calculator.ts" },
      { id: "display1", objectFile: "Display.ts" },
    ],
    [{
      id: "rule1",
      event: { instanceId: "trigger1", name: "calculate" },
      actions: [
        {
          id: "add-step",
          action: { instanceId: "calculator1", name: "add" },
          inputs: {
            left: { kind: "event", path: "left" },
            right: { kind: "event", path: "right" },
          },
          outputs: { result: { blackboardKey: "answer" } },
        },
        {
          id: "display-step",
          action: { instanceId: "display1", name: "setValue" },
          inputs: { value: { kind: "output", stepId: "add-step", name: "result" } },
          outputs: {},
        },
      ],
    }],
    { answer: { type: "number", value: 0 } },
  );

  runtime.emit("trigger1", "calculate", { left: 8, right: 5 });

  assertEquals(runtime.getState("display1")?.value, 13);
  assertEquals(runtime.getBlackboard().answer.value, 13);
});

Deno.test("generic calculator key event can drive independent engine and view objects", () => {
  const definitions = new Map<string, ObjectDefinition>([
    ["UI/CalculatorShell.ts", {
      name: "CalculatorShell",
      state: { display: "0", expression: "", memory: "" },
      events: { keyPressed: { outputs: { key: { type: "string" } } } },
      actions: {
        setView: {
          inputs: {
            display: { type: "string" },
            expression: { type: "string" },
            memory: { type: "string" },
          },
          run(context, inputs) {
            context.state.display = inputs.display;
            context.state.expression = inputs.expression;
            context.state.memory = inputs.memory;
          },
        },
      },
    }],
    ["Logic/CalculatorEngine.ts", {
      name: "CalculatorEngine",
      state: { total: 0 },
      events: {},
      actions: {
        pressKey: {
          inputs: { key: { type: "string" } },
          outputs: {
            display: { type: "string" },
            expression: { type: "string" },
            memoryValue: { type: "number" },
            memoryLabel: { type: "string" },
          },
          run(context, inputs) {
            context.state.total = Number(context.state.total ?? 0) + Number(inputs.key ?? 0);
            const display = String(context.state.total);
            return { display, expression: `sum = ${display}`, memoryValue: Number(context.state.total), memoryLabel: "M" };
          },
        },
      },
    }],
  ]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "calculatorUI", objectFile: "UI/CalculatorShell.ts" },
      { id: "calculatorEngine", objectFile: "Logic/CalculatorEngine.ts" },
    ],
    [{
      id: "key-rule",
      event: { instanceId: "calculatorUI", name: "keyPressed" },
      actions: [
        {
          id: "engine-step",
          action: { instanceId: "calculatorEngine", name: "pressKey" },
          inputs: { key: { kind: "event", path: "key" } },
          outputs: {
            display: { blackboardKey: "display" },
            expression: { blackboardKey: "expression" },
            memoryValue: { blackboardKey: "memory" },
            memoryLabel: {},
          },
        },
        {
          id: "view-step",
          action: { instanceId: "calculatorUI", name: "setView" },
          inputs: {
            display: { kind: "output", stepId: "engine-step", name: "display" },
            expression: { kind: "output", stepId: "engine-step", name: "expression" },
            memory: { kind: "output", stepId: "engine-step", name: "memoryLabel" },
          },
          outputs: {},
        },
      ],
    }],
    {
      display: { type: "string", value: "0" },
      expression: { type: "string", value: "" },
      memory: { type: "number", value: 0 },
    },
  );

  runtime.emit("calculatorUI", "keyPressed", { key: "7" });
  runtime.emit("calculatorUI", "keyPressed", { key: "8" });

  assertEquals(runtime.getState("calculatorEngine")?.total, 15);
  assertEquals(runtime.getState("calculatorUI")?.display, "15");
  assertEquals(runtime.getBlackboard().display.value, "15");
  assertEquals(runtime.getBlackboard().memory.value, 15);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}
