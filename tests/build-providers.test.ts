import { sanitizeBuildManifest, styleLinks, tailwindReadAllowlist } from "../src/server/build-providers.ts";

Deno.test("Tailwind is accepted as an explicit style build provider", () => {
  const manifest = sanitizeBuildManifest({
    version: 1,
    styles: [{ provider: "tailwind", input: "build/tailwind.css", output: "public/tailwind.css" }],
  });
  assertEquals(manifest.styles.length, 1);
  assertEquals(manifest.styles[0]?.provider, "tailwind");
  assertEquals(styleLinks(manifest)[0], "/tailwind.css");
});

Deno.test("Tailwind resolver only receives project read access plus ancestor package descriptors", () => {
  const projectRoot = new URL("file:///workspace/projects/example/");
  const allowlist = tailwindReadAllowlist(projectRoot).map((path) => path.replace(/\\/g, "/"));
  assertEquals(allowlist[0], "/workspace/projects/example/");
  assertIncludes(allowlist, "/workspace/projects/package.json");
  assertIncludes(allowlist, "/workspace/package.json");
  assertIncludes(allowlist, "/package.json");
  if (allowlist.includes("/workspace/projects/")) throw new Error("Parent project directory must not be broadly readable.");
});

Deno.test("build providers reject arbitrary commands and unsafe output paths", () => {
  assertThrows(() => sanitizeBuildManifest({
    version: 1,
    styles: [{ provider: "command", input: "x", output: "public/x.css", command: "rm -rf /" }],
  }));
  assertThrows(() => sanitizeBuildManifest({
    version: 1,
    styles: [{ provider: "tailwind", input: "../secret.css", output: "public/x.css" }],
  }));
  assertThrows(() => sanitizeBuildManifest({
    version: 1,
    styles: [{ provider: "tailwind", input: "build/input.css", output: "../outside.css" }],
  }));
});

function assertThrows(run: () => unknown): void {
  let failed = false;
  try { run(); } catch { failed = true; }
  if (!failed) throw new Error("Expected function to throw");
}

function assertIncludes(values: string[], expected: string): void {
  if (!values.includes(expected)) throw new Error(`Expected ${expected} in ${values.join(", ")}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
