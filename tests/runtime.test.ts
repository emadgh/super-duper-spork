/// <reference lib="dom" />
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

Deno.test("instance props are available to actions", () => {
  const definitions = new Map<string, ObjectDefinition>([["Scale.ts", {
    name: "Scale",
    actions: {
      execute: {
        inputs: { value: { type: "number" } },
        outputs: { result: { type: "number" } },
        run(context, inputs) {
          return { result: Number(inputs.value ?? 0) * Number(context.props.factor ?? 1) };
        },
      },
    },
  }]]);
  const runtime = new EventRuntime(
    definitions,
    [{ id: "scale1", objectFile: "Scale.ts", props: { factor: 4 } }],
    [{ id: "rule", event: { instanceId: "scale1", name: "go" }, actions: [{ id: "scale-step", action: { instanceId: "scale1", name: "execute" }, inputs: { value: { kind: "event", path: "value" } }, outputs: { result: { blackboardKey: "answer" } } }] }],
    { answer: { type: "number", value: 0 } },
  );
  runtime.emit("scale1", "go", { value: 3 });
  assertEquals(runtime.getBlackboard().answer.value, 12);
});

Deno.test("false condition prevents all rule actions", () => {
  const definitions = conditionDefinitions();
  const traces: string[] = [];
  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "gate", objectFile: "Gate.ts" },
      { id: "counter", objectFile: "Counter.ts" },
    ],
    [{
      id: "guarded",
      event: { instanceId: "trigger", name: "clicked" },
      conditions: [{
        id: "gate-step",
        condition: { instanceId: "gate", name: "atLeast" },
        inputs: {
          value: { kind: "event", path: "value" },
          minimum: { kind: "literal", value: 10 },
        },
      }],
      actions: [{ id: "increment", action: { instanceId: "counter", name: "increment" }, inputs: {}, outputs: {} }],
    }],
    {},
    { onTrace: (trace) => traces.push(`${trace.kind}:${trace.detail ?? ""}`) },
  );

  runtime.emit("trigger", "clicked", { value: 9 });

  assertEquals(runtime.getState("counter")?.value, 0);
  assert(traces.some((trace) => trace.startsWith("condition:FAIL")));
});

Deno.test("true condition allows rule actions", () => {
  const definitions = conditionDefinitions();
  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "gate", objectFile: "Gate.ts", props: { enabled: true } },
      { id: "counter", objectFile: "Counter.ts" },
    ],
    [{
      id: "guarded",
      event: { instanceId: "trigger", name: "clicked" },
      conditions: [{
        id: "enabled",
        condition: { instanceId: "gate", name: "enabled" },
        inputs: {},
      }, {
        id: "minimum",
        condition: { instanceId: "gate", name: "atLeast" },
        inputs: {
          value: { kind: "event", path: "value" },
          minimum: { kind: "blackboard", key: "minimum" },
        },
      }],
      actions: [{ id: "increment", action: { instanceId: "counter", name: "increment" }, inputs: {}, outputs: {} }],
    }],
    { minimum: { type: "number", value: 10 } },
  );

  runtime.emit("trigger", "clicked", { value: 12 });

  assertEquals(runtime.getState("counter")?.value, 1);
});

Deno.test("multiple conditions use AND semantics and stop on first failure", () => {
  const definitions = conditionDefinitions();
  const traces: string[] = [];
  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "gate", objectFile: "Gate.ts", props: { enabled: false } },
      { id: "counter", objectFile: "Counter.ts" },
    ],
    [{
      id: "guarded",
      event: { instanceId: "trigger", name: "clicked" },
      conditions: [
        { id: "enabled", condition: { instanceId: "gate", name: "enabled" }, inputs: {} },
        {
          id: "minimum",
          condition: { instanceId: "gate", name: "atLeast" },
          inputs: {
            value: { kind: "event", path: "value" },
            minimum: { kind: "literal", value: 1 },
          },
        },
      ],
      actions: [{ id: "increment", action: { instanceId: "counter", name: "increment" }, inputs: {}, outputs: {} }],
    }],
    {},
    { onTrace: (trace) => traces.push(`${trace.kind}:${trace.label}:${trace.detail ?? ""}`) },
  );

  runtime.emit("trigger", "clicked", { value: 100 });

  assertEquals(runtime.getState("counter")?.value, 0);
  assertEquals(traces.filter((trace) => trace.startsWith("condition:")).length, 1);
});

Deno.test("legacy rule without conditions stays unconditional", () => {
  const definitions = conditionDefinitions();
  const runtime = new EventRuntime(
    definitions,
    [
      { id: "trigger", objectFile: "Trigger.ts" },
      { id: "counter", objectFile: "Counter.ts" },
    ],
    [{
      id: "legacy",
      event: { instanceId: "trigger", name: "clicked" },
      actions: [{ id: "increment", action: { instanceId: "counter", name: "increment" }, inputs: {}, outputs: {} }],
    }],
    {},
  );

  runtime.emit("trigger", "clicked");
  assertEquals(runtime.getState("counter")?.value, 1);
});

function conditionDefinitions(): Map<string, ObjectDefinition> {
  return new Map<string, ObjectDefinition>([
    ["Trigger.ts", {
      name: "Trigger",
      events: { clicked: { outputs: { value: { type: "number" } } } },
    }],
    ["Gate.ts", {
      name: "Gate",
      conditions: {
        enabled: {
          test(context) {
            return context.props.enabled !== false;
          },
        },
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
}

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}
