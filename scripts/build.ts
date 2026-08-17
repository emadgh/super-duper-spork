import ts from "npm:typescript@5.9.2";

const ROOT = new URL("../", import.meta.url);
const SOURCE = new URL("src/client/", ROOT);
const DIST = new URL("dist/", ROOT);

await Deno.remove(DIST, { recursive: true }).catch((error) => {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
});
await Deno.mkdir(new URL("client/", DIST), { recursive: true });

await Deno.copyFile(new URL("index.html", SOURCE), new URL("index.html", DIST));
await Deno.copyFile(new URL("styles.css", SOURCE), new URL("styles.css", DIST));

for await (const entry of Deno.readDir(SOURCE)) {
  if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
  const source = await Deno.readTextFile(new URL(entry.name, SOURCE));
  const output = ts.transpileModule(source, {
    fileName: entry.name,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      rewriteRelativeImportExtensions: true,
      sourceMap: false,
    },
  }).outputText;
  await Deno.writeTextFile(new URL(entry.name.replace(/\.ts$/, ".js"), new URL("client/", DIST)), output);
}

console.log("Built dist/ successfully.");
