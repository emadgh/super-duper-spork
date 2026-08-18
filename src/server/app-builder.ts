import ts from "npm:typescript@5.9.2";
import type { LoadedProject, ProjectPackagePermissions } from "../client/model.ts";

export interface StandaloneBuildOptions {
  projectId: string;
  projectRoot: URL;
  outputRoot: URL;
  project: LoadedProject;
}

export interface StandaloneBuildResult {
  outputRoot: URL;
  entryUrl: URL;
  serverUrl: URL;
}

const CLIENT_SOURCE = new URL("../client/", import.meta.url);
const KERNEL_SOURCE = new URL("../app-kernel/", import.meta.url);

export async function buildStandaloneApp(options: StandaloneBuildOptions): Promise<StandaloneBuildResult> {
  const { projectId, projectRoot, outputRoot, project } = options;
  await Deno.mkdir(outputRoot, { recursive: true });
  for (const relative of ["public/", "kernel/", "host/"]) {
    await Deno.remove(new URL(relative, outputRoot), { recursive: true }).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
  for (const relative of ["deno.json", "packages.json", "run.bat", "README.txt"]) {
    await Deno.remove(new URL(relative, outputRoot)).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    });
  }
  await Deno.mkdir(new URL("public/client/", outputRoot), { recursive: true });
  await Deno.mkdir(new URL("public/app-kernel/", outputRoot), { recursive: true });
  await Deno.mkdir(new URL("kernel/", outputRoot), { recursive: true });
  await Deno.mkdir(new URL("data/", outputRoot), { recursive: true });

  await compileBrowserDirectory(CLIENT_SOURCE, new URL("public/client/", outputRoot));
  await compileBrowserFile(new URL("browser.ts", KERNEL_SOURCE), new URL("public/app-kernel/browser.js", outputRoot));
  await compileBrowserFile(new URL("bridge.ts", KERNEL_SOURCE), new URL("public/app-kernel/bridge.js", outputRoot));

  await Deno.copyFile(new URL("standalone-server.ts", KERNEL_SOURCE), new URL("kernel/standalone-server.ts", outputRoot));
  await Deno.copyFile(new URL("host-api.ts", KERNEL_SOURCE), new URL("kernel/host-api.ts", outputRoot));

  await Deno.writeTextFile(new URL("public/index.html", outputRoot), standaloneHtml(projectId));
  await Deno.writeTextFile(new URL("public/app-data.json", outputRoot), `${JSON.stringify(project)}\n`);
  await copyOptionalDirectory(new URL("host/", projectRoot), new URL("host/", outputRoot));
  await copyOptionalDirectory(new URL("assets/", projectRoot), new URL("public/assets/", outputRoot));
  await copyOptionalFile(new URL("packages.json", projectRoot), new URL("packages.json", outputRoot));
  await copyOptionalFile(new URL("deno.lock", projectRoot), new URL("deno.lock", outputRoot));

  const projectConfig = await readJsonObject(new URL("deno.json", projectRoot));
  const permissions = project.packages.effectivePermissions;
  const config = createStandaloneDenoConfig(projectConfig, permissions);
  await Deno.writeTextFile(new URL("deno.json", outputRoot), `${JSON.stringify(config, null, 2)}\n`);
  await Deno.writeTextFile(new URL("run.bat", outputRoot), "@echo off\r\ndeno task start\r\npause\r\n");
  await Deno.writeTextFile(new URL("README.txt", outputRoot), standaloneReadme(project.manifest.name));

  return {
    outputRoot,
    entryUrl: new URL("public/index.html", outputRoot),
    serverUrl: new URL("kernel/standalone-server.ts", outputRoot),
  };
}

function createStandaloneDenoConfig(
  projectConfig: Record<string, unknown>,
  permissions: ProjectPackagePermissions,
): Record<string, unknown> {
  const permissionArgs = [
    "--allow-net=127.0.0.1,localhost",
    "--allow-read=.",
    "--allow-write=data",
    "--allow-env=PORT",
  ];
  if (permissions.ffi) permissionArgs.push("--allow-ffi");
  if (permissions.sys?.length) permissionArgs.push(`--allow-sys=${permissions.sys.join(",")}`);
  if (permissions.run?.length) permissionArgs.push(`--allow-run=${permissions.run.join(",")}`);
  if (permissions.env?.length) permissionArgs[3] = `--allow-env=${["PORT", ...permissions.env].join(",")}`;
  if (permissions.net?.length) permissionArgs[0] = `--allow-net=${["127.0.0.1", "localhost", ...permissions.net].join(",")}`;

  return {
    ...projectConfig,
    lock: "deno.lock",
    tasks: {
      install: "deno install --config deno.json",
      start: `deno run --config deno.json ${permissionArgs.join(" ")} kernel/standalone-server.ts`,
    },
  };
}

async function compileBrowserDirectory(sourceDir: URL, outputDir: URL): Promise<void> {
  await Deno.mkdir(outputDir, { recursive: true });
  for await (const entry of Deno.readDir(sourceDir)) {
    const source = new URL(entry.name + (entry.isDirectory ? "/" : ""), sourceDir);
    const output = new URL(entry.name + (entry.isDirectory ? "/" : ""), outputDir);
    if (entry.isDirectory) {
      await compileBrowserDirectory(source, output);
      continue;
    }
    if (!entry.isFile || entry.name.endsWith(".d.ts") || !/\.tsx?$/.test(entry.name)) continue;
    await compileBrowserFile(source, new URL(entry.name.replace(/\.tsx?$/, ".js"), outputDir));
  }
}

async function compileBrowserFile(sourceUrl: URL, outputUrl: URL): Promise<void> {
  const source = await Deno.readTextFile(sourceUrl);
  const result = ts.transpileModule(source, {
    fileName: sourceUrl.pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      rewriteRelativeImportExtensions: true,
      sourceMap: false,
      jsx: ts.JsxEmit.React,
      jsxFactory: "h",
      jsxFragmentFactory: "Fragment",
    },
  });
  await Deno.mkdir(new URL(".", outputUrl), { recursive: true });
  await Deno.writeTextFile(outputUrl, result.outputText);
}

async function copyOptionalDirectory(source: URL, target: URL): Promise<void> {
  try {
    const info = await Deno.stat(source);
    if (!info.isDirectory) return;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const sourceEntry = new URL(entry.name + (entry.isDirectory ? "/" : ""), source);
    const targetEntry = new URL(entry.name + (entry.isDirectory ? "/" : ""), target);
    if (entry.isDirectory) await copyOptionalDirectory(sourceEntry, targetEntry);
    else if (entry.isFile) await Deno.copyFile(sourceEntry, targetEntry);
  }
}

async function copyOptionalFile(source: URL, target: URL): Promise<void> {
  try {
    await Deno.copyFile(source, target);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function readJsonObject(url: URL): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await Deno.readTextFile(url));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

function standaloneHtml(projectId: string): string {
  const id = JSON.stringify(projectId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Spork App</title>
  <style>html,body,#spork-app-root{min-height:100%;margin:0}body{background:#11141b;color:#f5f7fb}</style>
</head>
<body>
  <div id="spork-app-root"></div>
  <script>window.__SPORK_APP__={projectId:${id},dataUrl:"/app-data.json"};</script>
  <script type="module" src="/app-kernel/browser.js"></script>
</body>
</html>\n`;
}

function standaloneReadme(name: string): string {
  return `${name}\n${"=".repeat(Math.max(3, name.length))}\n\n1. Run: deno task install\n2. Start: deno task start\n3. Open: http://127.0.0.1:8787\n\nThe application host, browser runtime, packages and project data are independent from Super Duper Spork Studio.\n`;
}
