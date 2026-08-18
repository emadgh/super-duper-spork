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
  assert(Array.isArray(result.warnings));
  assertEquals(compiler.id, "lightningcss");
});

Deno.test("Lightning CSS compiler supports build-time minification", () => {
  const compiler = new LightningCssCompiler();
  const source = `.button {
    padding: 8px 12px;
    color: white;
    background: black;
  }`;
  const readable = compiler.compile(source, "styles/button.css");
  const minified = compiler.compile(source, "styles/button.css", { minify: true });

  assert(minified.css.length < readable.css.length, "Expected minified CSS to be smaller");
  assert(minified.css.includes(".button"));
});

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
