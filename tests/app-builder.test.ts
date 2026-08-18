import { buildStandaloneApp } from "../src/server/app-builder.ts";
import type { LoadedProject } from "../src/client/model.ts";

Deno.test("standalone app builder emits an independent runnable project", async () => {
  const rootPath = await Deno.makeTempDir();
  const outputPath = await Deno.makeTempDir();
  const root = dirUrl(rootPath);
  const output = dirUrl(outputPath);
  try {
    await Deno.mkdir(new URL("host/", root), { recursive: true });
    await Deno.writeTextFile(new URL("host/main.ts", root), "export async function handleAppRequest(){ return Response.json({ok:true}); }\n");
    await Deno.writeTextFile(new URL("packages.json", root), '{"version":1,"nodeModulesDir":"none","packages":[]}\n');
    await Deno.writeTextFile(new URL("deno.json", root), '{"nodeModulesDir":"none","imports":{},"lock":"deno.lock"}\n');

    const project: LoadedProject = {
      manifest: {
        version: 3,
        id: "test-app",
        name: "Test App",
        objects: [],
        objectFolders: [],
        styles: [],
        instances: [],
        blackboard: {},
        rules: [],
        updatedAt: new Date(0).toISOString(),
      },
      objects: [],
      styles: [],
      packages: {
        manifest: { version: 1, nodeModulesDir: "none", packages: [] },
        effectivePermissions: { envAll: true },
      },
    };

    const result = await buildStandaloneApp({ projectId: "test-app", projectRoot: root, outputRoot: output, project });
    assert((await Deno.stat(result.entryUrl)).isFile);
    assert((await Deno.stat(result.serverUrl)).isFile);
    assert((await Deno.stat(new URL("public/app-kernel/browser.js", output))).isFile);
    assert((await Deno.stat(new URL("public/client/runtime.js", output))).isFile);
    assert((await Deno.stat(new URL("host/main.ts", output))).isFile);

    const config = JSON.parse(await Deno.readTextFile(new URL("deno.json", output)));
    assert(typeof config.tasks.start === "string");
    assert(config.tasks.start.includes("kernel/standalone-server.ts"));
    assert(config.tasks.start.includes(" --allow-env "));
    assert(!config.tasks.start.includes("--allow-env=PORT"));
    const html = await Deno.readTextFile(new URL("public/index.html", output));
    assert(html.includes("/app-kernel/browser.js"));
    assert(html.includes("test-app"));
  } finally {
    await Deno.remove(rootPath, { recursive: true });
    await Deno.remove(outputPath, { recursive: true });
  }
});

function dirUrl(path: string): URL {
  const normalized = path.replace(/\\/g, "/");
  return new URL(`${normalized.startsWith("/") ? "file://" : "file:///"}${normalized.replace(/\/$/, "")}/`);
}

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
