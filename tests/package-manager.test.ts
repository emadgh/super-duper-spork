import {
  emptyPackageManifest,
  isPackageSpecifier,
  PACKAGE_PRESETS,
  ProjectPackageManager,
  sanitizePackageManifest,
} from "../src/server/package-manager.ts";

Deno.test("package specifier validator only accepts npm/jsr package specifiers", () => {
  assert(isPackageSpecifier("npm:typeorm@1.1.0"));
  assert(isPackageSpecifier("npm:@tailwindcss/cli@4.3.3"));
  assert(isPackageSpecifier("jsr:@std/assert@1.0.14"));
  assert(!isPackageSpecifier("https://example.com/script.ts"));
  assert(!isPackageSpecifier("npm:typeorm@1.1.0;rm -rf /"));
});

Deno.test("native package policy upgrades nodeModulesDir automatically", () => {
  const manifest = sanitizePackageManifest({
    version: 1,
    nodeModulesDir: "none",
    packages: [
      {
        id: "better-sqlite3",
        alias: "better-sqlite3",
        specifier: "npm:better-sqlite3@13.0.2",
        role: "runtime",
        native: true,
        allowScripts: ["npm:better-sqlite3"],
        permissions: { ffi: true, sys: ["cpus", "hostname", "networkInterfaces"] },
      },
    ],
  });

  assertEquals(manifest.nodeModulesDir, "auto");
  assertEquals(manifest.packages[0]?.permissions?.ffi, true);
  assertSystemReportPermissions(manifest.packages[0]?.permissions?.sys);
  assertEquals(manifest.packages[0]?.allowScripts?.[0], "npm:better-sqlite3");
});

Deno.test("full environment capability is explicit and sanitized", () => {
  const manifest = sanitizePackageManifest({
    version: 1,
    nodeModulesDir: "none",
    packages: [
      {
        id: "typeorm",
        alias: "typeorm",
        specifier: "npm:typeorm@1.1.0",
        role: "runtime",
        permissions: { envAll: true },
      },
    ],
  });

  assertEquals(manifest.packages[0]?.permissions?.envAll, true);
  const manager = new ProjectPackageManager(new URL("file:///tmp/unused/"));
  assertEquals(manager.effectivePermissions(manifest).envAll, true);
});

Deno.test("package presets contain database and Tailwind building blocks", () => {
  assert(PACKAGE_PRESETS.some((preset) => preset.id === "typeorm"));
  assert(PACKAGE_PRESETS.some((preset) => preset.id === "better-sqlite3"));
  assert(PACKAGE_PRESETS.some((preset) => preset.id === "tailwind"));
  const typeorm = PACKAGE_PRESETS.find((preset) => preset.id === "typeorm");
  assertEquals(typeorm?.packages.find((item) => item.id === "typeorm")?.permissions?.envAll, true);
  const sqlite = PACKAGE_PRESETS.find((preset) => preset.id === "better-sqlite3");
  assertSystemReportPermissions(sqlite?.packages.find((item) => item.id === "better-sqlite3")?.permissions?.sys);
});

Deno.test("package manager writes packages.json and generated deno.json", async () => {
  const root = await Deno.makeTempDir();
  try {
    const manager = new ProjectPackageManager(toDirUrl(root));
    await manager.write(emptyPackageManifest());
    await manager.addPreset("typeorm");
    const manifest = await manager.addPreset("better-sqlite3");

    assertEquals(manifest.nodeModulesDir, "auto");
    assert(manifest.packages.some((item) => item.specifier === "npm:typeorm@1.1.0"));
    assert(manifest.packages.some((item) => item.specifier === "npm:reflect-metadata@0.2.2"));
    assert(manifest.packages.some((item) => item.specifier === "npm:better-sqlite3@13.0.2"));

    const config = JSON.parse(await Deno.readTextFile(`${root}/deno.json`));
    assertEquals(config.nodeModulesDir, "auto");
    assertEquals(config.imports.typeorm, "npm:typeorm@1.1.0");
    assert(config.allowScripts.includes("npm:better-sqlite3"));
    assertEquals(config.compilerOptions.experimentalDecorators, true);
    assertEquals(config.compilerOptions.emitDecoratorMetadata, true);

    const permissions = manager.effectivePermissions(manifest);
    assertEquals(permissions.envAll, true);
    assertEquals(permissions.ffi, true);
    assertSystemReportPermissions(permissions.sys);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

function assertSystemReportPermissions(value: string[] | undefined): void {
  assertEquals(value?.length, 3);
  assertEquals(value?.[0], "cpus");
  assertEquals(value?.[1], "hostname");
  assertEquals(value?.[2], "networkInterfaces");
}

function toDirUrl(path: string): URL {
  const normalized = path.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return new URL(`${prefix}${normalized.replace(/\/$/, "")}/`);
}

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
