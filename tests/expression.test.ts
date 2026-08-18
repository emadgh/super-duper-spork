import {
  clearExpressionCache,
  evaluateExpression,
  type ExpressionReference,
  validateExpression,
} from "../src/client/expression.ts";

Deno.test("expression engine respects arithmetic precedence", () => {
  assertEquals(evaluateExpression("2 + 3 * 4", noReferences), 14);
  assertEquals(evaluateExpression("(2 + 3) * 4", noReferences), 20);
  assertEquals(evaluateExpression("-5 + +2", noReferences), -3);
});

Deno.test("expression engine resolves event board state and output references", () => {
  const values = new Map<string, unknown>([
    ["@event.value", 5],
    ["@board.Step", 3],
    ["@state.counter-1.value", 10],
    ["@output.550e8400-e29b-41d4-a716-446655440000.result", 4],
  ]);
  const resolve = (reference: ExpressionReference): unknown => values.get(reference.source);

  assertEquals(evaluateExpression("@event.value + @board.Step * 2", resolve), 11);
  assertEquals(evaluateExpression("@state.counter-1.value - @output.550e8400-e29b-41d4-a716-446655440000.result", resolve), 6);
});

Deno.test("expression engine supports string comparison and nullish values", () => {
  const resolve = (reference: ExpressionReference): unknown => reference.source === "@event.name" ? "Ada" : undefined;
  assertEquals(evaluateExpression("'Hello ' + @event.name", resolve), "Hello Ada");
  assertEquals(evaluateExpression("@event.missing ?? 'fallback'", resolve), "fallback");
  assertEquals(evaluateExpression("'beta' > 'alpha'", noReferences), true);
  assertEquals(evaluateExpression("null === null", noReferences), true);
});

Deno.test("logical operators short circuit reference resolution", () => {
  const visited: string[] = [];
  const resolve = (reference: ExpressionReference): unknown => {
    visited.push(reference.source);
    if (reference.source === "@event.enabled") return false;
    throw new Error("right side should not run");
  };

  assertEquals(evaluateExpression("@event.enabled && @event.expensive", resolve), false);
  assertEquals(visited.join(","), "@event.enabled");
});

Deno.test("unsupported JavaScript syntax is rejected", () => {
  for (const source of [
    "globalThis.alert(1)",
    "@event.value = 3",
    "@event.value == 3",
    "@event.items[0]",
    "(() => 1)()",
    "new Date()",
  ]) {
    const result = validateExpression(source);
    assertEquals(result.ok, false, source);
  }
});

Deno.test("malformed references and expressions report validation errors", () => {
  for (const source of ["", "@board", "@state.counter", "@output.step", "1 +", "(1 + 2", "@wat.value"]) {
    const result = validateExpression(source);
    assertEquals(result.ok, false, source);
    assert(typeof result.error === "string" && result.error.length > 0, source);
  }
});

Deno.test("expression cache can be cleared without changing results", () => {
  assertEquals(evaluateExpression("40 + 2", noReferences), 42);
  clearExpressionCache();
  assertEquals(evaluateExpression("40 + 2", noReferences), 42);
});

function noReferences(reference: ExpressionReference): never {
  throw new Error(`Unexpected reference ${reference.source}`);
}

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
  }
}
