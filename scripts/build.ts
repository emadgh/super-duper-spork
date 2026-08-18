import ts from "npm:typescript@5.9.2";

const ROOT = new URL("../", import.meta.url);
const SOURCE = new URL("src/client/", ROOT);
const DIST = new URL("dist/", ROOT);
const CLIENT_DIST = new URL("client/", DIST);
const APP_KERNEL_SOURCE = new URL("src/app-kernel/", ROOT);
const APP_KERNEL_DIST = new URL("app-kernel/", DIST);

await Deno.remove(DIST, { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
});
await Deno.mkdir(CLIENT_DIST, { recursive: true });

await Deno.copyFile(new URL("index.html", SOURCE), new URL("index.html", DIST));
await Deno.copyFile(new URL("styles.css", SOURCE), new URL("styles.css", DIST));
await compileDirectory(SOURCE, CLIENT_DIST);
await compileKernelDirectory(APP_KERNEL_SOURCE, APP_KERNEL_DIST);

console.log("Built dist/ successfully.");

async function compileKernelDirectory(sourceDir: URL, outputDir: URL): Promise<void> {
  await Deno.mkdir(outputDir, { recursive: true });
  for (const name of ["browser.ts", "bridge.ts"]) {
    const sourceUrl = new URL(name, sourceDir);
    const source = await Deno.readTextFile(sourceUrl);
    const output = ts.transpileModule(source, {
      fileName: name,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        strict: true,
        rewriteRelativeImportExtensions: true,
        sourceMap: false,
      },
    }).outputText;
    await Deno.writeTextFile(new URL(name.replace(/\.ts$/, ".js"), outputDir), output);
  }
}

async function compileDirectory(sourceDir: URL, outputDir: URL): Promise<void> {
  await Deno.mkdir(outputDir, { recursive: true });
  for await (const entry of Deno.readDir(sourceDir)) {
    const sourceUrl = new URL(entry.name + (entry.isDirectory ? "/" : ""), sourceDir);
    const outputUrl = new URL(entry.name + (entry.isDirectory ? "/" : ""), outputDir);

    if (entry.isDirectory) {
      await compileDirectory(sourceUrl, outputUrl);
      continue;
    }

    if (!entry.isFile || entry.name.endsWith(".d.ts") || !/\.tsx?$/.test(entry.name)) continue;
    const source = await Deno.readTextFile(sourceUrl);
    const output = ts.transpileModule(source, {
      fileName: entry.name,
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
    }).outputText;
    const target = new URL(entry.name.replace(/\.tsx?$/, ".js"), outputDir);
    await Deno.writeTextFile(target, output);
  }
}
