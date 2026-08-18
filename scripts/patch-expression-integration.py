from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if old not in source:
        raise SystemExit(f"Expected patch fragment not found in {path}: {old[:120]!r}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


# Shared expression policy.
replace_once(
    "src/client/expression.ts",
    "const MAX_SOURCE_LENGTH = 2048;\n",
    "export const EXPRESSION_SOURCE_LIMIT = 2048;\n",
)
replace_once(
    "src/client/expression.ts",
    "if (source.length > MAX_SOURCE_LENGTH) throw new ExpressionSyntaxError(`Expression exceeds ${MAX_SOURCE_LENGTH} characters`, MAX_SOURCE_LENGTH);",
    "if (source.length > EXPRESSION_SOURCE_LIMIT) throw new ExpressionSyntaxError(`Expression exceeds ${EXPRESSION_SOURCE_LIMIT} characters`, EXPRESSION_SOURCE_LIMIT);",
)

# Server model + bounded persistence.
replace_once(
    "src/server.ts",
    'import { runBuildProviders } from "./server/build-providers.ts";\n',
    'import { runBuildProviders } from "./server/build-providers.ts";\nimport { EXPRESSION_SOURCE_LIMIT } from "./client/expression.ts";\n',
)
replace_once(
    "src/server.ts",
    '  | { kind: "event"; path: string }\n  | { kind: "output"; stepId: string; name: string };',
    '  | { kind: "event"; path: string }\n  | { kind: "output"; stepId: string; name: string }\n  | { kind: "expression"; source: string };',
)
replace_once(
    "src/server.ts",
    '''    if (binding.kind === "output" && typeof binding.stepId === "string" && typeof binding.name === "string") {
      result[key] = { kind: "output", stepId: binding.stepId, name: binding.name };
    }
''',
    '''    if (binding.kind === "output" && typeof binding.stepId === "string" && typeof binding.name === "string") {
      result[key] = { kind: "output", stepId: binding.stepId, name: binding.name };
    }
    if (
      binding.kind === "expression" && typeof binding.source === "string" &&
      binding.source.trim().length > 0 && binding.source.length <= EXPRESSION_SOURCE_LIMIT
    ) {
      result[key] = { kind: "expression", source: binding.source };
    }
''',
)

# Editor integration and inline validation.
replace_once(
    "src/client/main.ts",
    'import { evaluateObjectFile } from "./compiler.ts";\n',
    'import { evaluateObjectFile } from "./compiler.ts";\nimport { validateExpression } from "./expression.ts";\n',
)
replace_once(
    "src/client/main.ts",
    '''    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
  ];''',
    '''    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
    { value: "expression", label: "Expression" },
  ];''',
)
replace_once(
    "src/client/main.ts",
    '''    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
    { value: "output", label: "Action output" },
  ];''',
    '''    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
    { value: "output", label: "Action output" },
    { value: "expression", label: "Expression" },
  ];''',
)
replace_once(
    "src/client/main.ts",
    '''  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  const select = document.createElement("select");
''',
    '''  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  if (binding.kind === "expression") {
    host.append(expressionInput(binding.source, (source) => onChange({ kind: "expression", source })));
    return;
  }

  const select = document.createElement("select");
''',
)
# The same literal block occurs again in the action editor; replace the next remaining occurrence.
replace_once(
    "src/client/main.ts",
    '''  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  const select = document.createElement("select");
''',
    '''  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  if (binding.kind === "expression") {
    host.append(expressionInput(binding.source, (source) => onChange({ kind: "expression", source })));
    return;
  }

  const select = document.createElement("select");
''',
)
replace_once(
    "src/client/main.ts",
    '''function bindingForKind(kind: ValueBinding["kind"], port: PortDefinition, rule: EventRule, step: ActionStep): ValueBinding {
  if (kind === "literal") return defaultBinding(port);
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };''',
    '''function bindingForKind(kind: ValueBinding["kind"], port: PortDefinition, rule: EventRule, step: ActionStep): ValueBinding {
  if (kind === "literal") return defaultBinding(port);
  if (kind === "expression") return { kind, source: "0" };
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };''',
)
replace_once(
    "src/client/main.ts",
    '''  if (kind === "literal") return defaultBinding(port) as Exclude<ValueBinding, { kind: "output" }>;
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };''',
    '''  if (kind === "literal") return defaultBinding(port) as Exclude<ValueBinding, { kind: "output" }>;
  if (kind === "expression") return { kind, source: "0" };
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };''',
)
replace_once(
    "src/client/main.ts",
    '''function readPortInput(input: HTMLInputElement | HTMLSelectElement, type: PortType): unknown {
  if (type === "number") return Number(input.value || 0);
  if (type === "boolean") return input.value === "true";
  return input.value;
}
''',
    '''function readPortInput(input: HTMLInputElement | HTMLSelectElement, type: PortType): unknown {
  if (type === "number") return Number(input.value || 0);
  if (type === "boolean") return input.value === "true";
  return input.value;
}

function expressionInput(source: string, onChange: (source: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "expression-input";
  input.value = source;
  input.placeholder = "@event.value + @board.Step * 2";
  const validate = () => {
    const result = validateExpression(input.value);
    input.classList.toggle("is-invalid", !result.ok);
    input.title = result.ok
      ? "Safe expression · @event · @board · @state · @output"
      : result.error ?? "Invalid expression";
  };
  input.addEventListener("input", validate);
  input.addEventListener("change", () => onChange(input.value));
  validate();
  return input;
}
''',
)

# Styling for expression source fields.
css = Path("src/client/styles.css")
css.write_text(css.read_text(encoding="utf-8") + '''\n.expression-input {\n  min-width: 210px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 10px;\n}\n.expression-input.is-invalid {\n  border-color: #9a4f5c !important;\n  box-shadow: inset 0 0 0 1px rgba(210, 78, 98, .18);\n}\n''', encoding="utf-8")

# Add expression parser to static type-check list.
replace_once(
    "deno.json",
    "tests/runtime.test.ts tests/dom-core.test.ts",
    "tests/runtime.test.ts tests/expression.test.ts tests/dom-core.test.ts",
)

# Runtime integration tests: all four reference roots and condition use.
runtime_test = "tests/runtime.test.ts"
replace_once(
    runtime_test,
    '''function conditionDefinitions(): Map<string, ObjectDefinition> {''',
    '''Deno.test("expression binding resolves event board state and previous action output", () => {
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
  const definitions = conditionDefinitions();
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

function conditionDefinitions(): Map<string, ObjectDefinition> {''',
)

# CI: persistence and standalone inclusion.
replace_once(
    ".github/workflows/ci.yml",
    '''              'inputs': {
                  'value': {'kind': 'literal', 'value': 7},
              },''',
    '''              'inputs': {
                  'value': {'kind': 'literal', 'value': 7},
                  'computed': {'kind': 'expression', 'source': '@event.value + @board.Step * 2'},
              },''',
)
replace_once(
    ".github/workflows/ci.yml",
    '''          assert condition['inputs']['value'] == {'kind': 'literal', 'value': 7}
''',
    '''          assert condition['inputs']['value'] == {'kind': 'literal', 'value': 7}
          assert condition['inputs']['computed'] == {'kind': 'expression', 'source': '@event.value + @board.Step * 2'}
''',
)
replace_once(
    ".github/workflows/ci.yml",
    '''          body = urlopen(run['url'], timeout=8).read().decode()
          assert '/app-kernel/browser.js' in body
          PY
''',
    '''          body = urlopen(run['url'], timeout=8).read().decode()
          assert '/app-kernel/browser.js' in body
          PY
          test -f workspace/builds/calculator-modular-demo/public/client/expression.js
''',
)

print("Expression integration patch applied.")
