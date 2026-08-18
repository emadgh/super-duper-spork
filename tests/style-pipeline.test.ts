import { LightningCssCompiler } from "../src/server/style-pipeline.ts";

Deno.test("Lightning CSS compiler validates and transforms project CSS", () => {
  const compiler = new LightningCssCompiler();
  const result = compiler.compile(`
    .card {
      display: grid;
      & > strong { color: oklch(0.7 0.12 220); }
    }
  `, "styles/app.css");

  assert(result.css.includes(".card"));
  assert(result.css.includes("strong"));
  assertEquals(compiler.id, "lightningcss");
});

Deno.test("Lightning CSS compiler reports invalid CSS as an error", () => {
  const compiler = new LightningCssCompiler();
  let failed = false;
  try {
    compiler.compile(".broken { color: ; }", "styles/broken.css");
  } catch {
    failed = true;
  }
  assert(failed, "Expected invalid CSS to throw");
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
