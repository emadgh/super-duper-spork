/// <reference lib="dom" />
import { EventRuntime } from "../src/client/runtime.ts";
import type { ObjectDefinition } from "../src/client/model.ts";

Deno.test("declared created lifecycle event fires once after runtime construction", async () => {
  const definitions = new Map<string, ObjectDefinition>([
    ["App.ts", {
      name: "App",
      events: { created: {} },
    }],
    ["Loader.ts", {
      name: "Loader",
      state: { starts: 0 },
      actions: {
        start: {
          run(context) {
            context.state.starts = Number(context.state.starts ?? 0) + 1;
          },
        },
      },
    }],
  ]);

  const runtime = new EventRuntime(
    definitions,
    [
      { id: "app", objectFile: "App.ts" },
      { id: "loader", objectFile: "Loader.ts" },
    ],
    [{
      id: "initial-load",
      event: { instanceId: "app", name: "created" },
      actions: [{
        id: "start-loader",
        action: { instanceId: "loader", name: "start" },
        inputs: {},
        outputs: {},
      }],
    }],
    {},
  );

  assertEquals(runtime.getState("loader")?.starts, 0);
  await Promise.resolve();
  assertEquals(runtime.getState("loader")?.starts, 1);
  await Promise.resolve();
  assertEquals(runtime.getState("loader")?.starts, 1);
  runtime.dispose();
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
