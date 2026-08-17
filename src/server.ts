import ts from "npm:typescript@5.9.2";

type PortType = "number" | "string" | "boolean" | "any";

interface BlackboardEntry {
  type: PortType;
  value: unknown;
}

interface ProjectInstance {
  id: string;
  objectFile: string;
  props?: Record<string, unknown>;
  parent?: { instanceId: string; slot: string };
}

interface EventEndpoint {
  instanceId: string;
  name: string;
}

type ValueBinding =
  | { kind: "literal"; value: unknown }
  | { kind: "blackboard"; key: string }
  | { kind: "state"; instanceId: string; path: string }
  | { kind: "event"; path: string }
  | { kind: "output"; stepId: string; name: string };

interface ActionStep {
  id: string;
  action: EventEndpoint;
  inputs: Record<string, ValueBinding>;
  outputs: Record<string, { blackboardKey?: string }>;
}

interface EventRule {
  id: string;
  event: EventEndpoint;
  actions: ActionStep[];
}

interface ProjectManifest {
  version: 3;
  id: string;
  name: string;
  objects: string[];
  objectFolders: string[];
  instances: ProjectInstance[];
  blackboard: Record<string, BlackboardEntry>;
  rules: EventRule[];
  updatedAt: string;
}

const ROOT = new URL("../", import.meta.url);
const PROJECTS_DIR = new URL("workspace/projects/", ROOT);
const TEMPLATES_DIR = new URL("templates/", ROOT);
const DIST_MODE = Deno.args.includes("--dist");
const PORT = 8000;

async function main(): Promise<void> {
  await ensureWorkspace();

  Deno.serve({ port: PORT }, async (request) => {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, url);
      }

      return await serveApp(url.pathname);
    } catch (error) {
      console.error(error);
      return json({ error: errorMessage(error) }, 500);
    }
  });

  console.log(`Super Duper Spork Studio: http://localhost:${PORT}`);
}

async function handleApi(request: Request, url: URL): Promise<Response> {
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (parts.length === 2 && parts[0] === "api" && parts[1] === "action-library" && request.method === "GET") {
    return json(listReadyActionTemplates());
  }

  if (parts.length === 2 && parts[0] === "api" && parts[1] === "projects") {
    if (request.method === "GET") {
      return json(await listProjects());
    }
    if (request.method === "POST") {
      const body = await readJson<{ name?: string }>(request);
      const name = body.name?.trim();
      if (!name) return json({ error: "Project name is required." }, 400);
      const manifest = await createProject(name);
      return json(await loadProject(manifest.id), 201);
    }
  }

  if (parts.length >= 3 && parts[0] === "api" && parts[1] === "projects") {
    const projectId = validateProjectId(parts[2]);

    if (parts.length === 3) {
      if (request.method === "GET") {
        return json(await loadProject(projectId));
      }
      if (request.method === "PUT") {
        const body = await readJson<{ manifest?: ProjectManifest }>(request);
        if (!body.manifest) return json({ error: "Manifest is required." }, 400);
        const current = await readManifest(projectId);
        const next = sanitizeManifest(body.manifest, current);
        await writeManifest(next);
        return json(await loadProject(projectId));
      }
    }

    if (parts.length === 4 && parts[3] === "objects" && request.method === "POST") {
      const body = await readJson<{ name?: string; folder?: string }>(request);
      const name = body.name?.trim();
      if (!name) return json({ error: "Object name is required." }, 400);
      await addObject(projectId, name, body.folder ?? "");
      return json(await loadProject(projectId), 201);
    }

    if (parts.length === 4 && parts[3] === "folders" && request.method === "POST") {
      const body = await readJson<{ name?: string; parent?: string }>(request);
      const name = body.name?.trim();
      if (!name) return json({ error: "Folder name is required." }, 400);
      await addObjectFolder(projectId, name, body.parent ?? "");
      return json(await loadProject(projectId), 201);
    }

    if (parts.length === 4 && parts[3] === "action-library" && request.method === "POST") {
      const body = await readJson<{ templateId?: string; folder?: string }>(request);
      const templateId = body.templateId?.trim();
      if (!templateId) return json({ error: "Action template id is required." }, 400);
      await addReadyAction(projectId, templateId, body.folder ?? "");
      return json(await loadProject(projectId), 201);
    }

    if (parts.length === 4 && parts[3] === "reveal" && request.method === "POST") {
      const body = await readJson<{ objectFile?: string }>(request);
      await revealInFileManager(projectId, body.objectFile);
      return json({ ok: true });
    }

    if (parts.length === 6 && parts[3] === "objects" && parts[5] === "move" && request.method === "POST") {
      const file = validateObjectPath(parts[4]);
      const body = await readJson<{ folder?: string }>(request);
      await moveObject(projectId, file, body.folder ?? "");
      return json(await loadProject(projectId));
    }

    if (parts.length === 5 && parts[3] === "objects" && request.method === "PUT") {
      const file = validateObjectPath(parts[4]);
      const body = await readJson<{ source?: string }>(request);
      if (typeof body.source !== "string") return json({ error: "Source is required." }, 400);

      const manifest = await readManifest(projectId);
      if (!manifest.objects.includes(file)) return json({ error: "Unknown object file." }, 404);

      const result = transpileObject(body.source, file);
      if (result.errors.length > 0) {
        return json({ error: result.errors.join("\n") }, 400);
      }

      await Deno.writeTextFile(objectUrl(projectId, file), body.source);
      manifest.updatedAt = new Date().toISOString();
      await writeManifest(manifest);
      return json(await loadProject(projectId));
    }
  }

  return json({ error: "Not found." }, 404);
}

async function serveApp(pathname: string): Promise<Response> {
  if (DIST_MODE) {
    if (pathname === "/") return fileResponse(new URL("dist/index.html", ROOT), "text/html; charset=utf-8");
    if (pathname === "/styles.css") return fileResponse(new URL("dist/styles.css", ROOT), "text/css; charset=utf-8");
    if (pathname.startsWith("/client/") && pathname.endsWith(".js")) {
      const relative = pathname.replace(/^\//, "");
      return fileResponse(new URL(`dist/${relative}`, ROOT), "text/javascript; charset=utf-8");
    }
    return new Response("Not found", { status: 404 });
  }

  if (pathname === "/") return fileResponse(new URL("src/client/index.html", ROOT), "text/html; charset=utf-8");
  if (pathname === "/styles.css") return fileResponse(new URL("src/client/styles.css", ROOT), "text/css; charset=utf-8");

  if (pathname.startsWith("/client/") && pathname.endsWith(".js")) {
    const relative = pathname.slice("/client/".length).replace(/\.js$/, ".ts");
    if (!/^[a-zA-Z0-9_./-]+\.ts$/.test(relative) || relative.includes("..")) {
      return new Response("Invalid path", { status: 400 });
    }
    const sourceUrl = new URL(`src/client/${relative}`, ROOT);
    try {
      const source = await Deno.readTextFile(sourceUrl);
      const result = ts.transpileModule(source, {
        fileName: relative,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
          strict: true,
          rewriteRelativeImportExtensions: true,
          sourceMap: true,
        },
      });
      return new Response(result.outputText, {
        headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return new Response("Not found", { status: 404 });
      throw error;
    }
  }

  return new Response("Not found", { status: 404 });
}

async function ensureWorkspace(): Promise<void> {
  await Deno.mkdir(PROJECTS_DIR, { recursive: true });
  await ensureCounterDemo();
  await ensureCalculatorDemo();
  await ensureProjectTemplate("calculator-modular-demo", "Calculator · Modular Demo", "calculator-modular");
}

async function ensureCounterDemo(): Promise<void> {
  const projectId = "counter-demo";
  if (await projectExists(projectId)) return;

  const projectDir = projectUrl(projectId);
  await Deno.mkdir(new URL("objects/", projectDir), { recursive: true });
  await Deno.writeTextFile(objectUrl(projectId, "Button.ts"), DEFAULT_BUTTON_SOURCE);
  await Deno.writeTextFile(objectUrl(projectId, "Counter.ts"), DEFAULT_COUNTER_SOURCE);

  const incrementStepId = "increment-counter";
  const manifest: ProjectManifest = {
    version: 3,
    id: projectId,
    name: "Counter Demo",
    objects: ["Button.ts", "Counter.ts"],
    objectFolders: [],
    instances: [
      { id: "button1", objectFile: "Button.ts" },
      { id: "counter1", objectFile: "Counter.ts" },
    ],
    blackboard: {
      count: { type: "number", value: 0 },
    },
    rules: [
      {
        id: "button-click-rule",
        event: { instanceId: "button1", name: "click" },
        actions: [
          {
            id: incrementStepId,
            action: { instanceId: "counter1", name: "increment" },
            inputs: { amount: { kind: "literal", value: 1 } },
            outputs: { value: { blackboardKey: "count" } },
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
}

async function ensureCalculatorDemo(): Promise<void> {
  const projectId = "calculator-demo";
  if (await projectExists(projectId)) return;

  const projectDir = projectUrl(projectId);
  await Deno.mkdir(new URL("objects/", projectDir), { recursive: true });
  await Deno.writeTextFile(objectUrl(projectId, "CalculatorForm.ts"), CALCULATOR_FORM_SOURCE);
  await Deno.writeTextFile(objectUrl(projectId, "Calculator.ts"), CALCULATOR_LOGIC_SOURCE);
  await Deno.writeTextFile(objectUrl(projectId, "ResultDisplay.ts"), RESULT_DISPLAY_SOURCE);

  const calculateStepId = "calculate-step";
  const manifest: ProjectManifest = {
    version: 3,
    id: projectId,
    name: "Calculator",
    objects: ["CalculatorForm.ts", "Calculator.ts", "ResultDisplay.ts"],
    objectFolders: [],
    instances: [
      { id: "form1", objectFile: "CalculatorForm.ts" },
      { id: "calculator1", objectFile: "Calculator.ts" },
      { id: "result1", objectFile: "ResultDisplay.ts" },
    ],
    blackboard: {
      lastResult: { type: "number", value: 0 },
      lastExpression: { type: "string", value: "" },
    },
    rules: [
      {
        id: "calculate-rule",
        event: { instanceId: "form1", name: "calculate" },
        actions: [
          {
            id: calculateStepId,
            action: { instanceId: "calculator1", name: "calculate" },
            inputs: {
              left: { kind: "event", path: "left" },
              right: { kind: "event", path: "right" },
              operator: { kind: "event", path: "operator" },
            },
            outputs: {
              result: { blackboardKey: "lastResult" },
              expression: { blackboardKey: "lastExpression" },
            },
          },
          {
            id: "show-result-step",
            action: { instanceId: "result1", name: "setValue" },
            inputs: {
              value: { kind: "output", stepId: calculateStepId, name: "result" },
            },
            outputs: {},
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
}

async function ensureRealCalculatorDemo(): Promise<void> {
  const projectId = "calculator-real-demo";
  if (await projectExists(projectId)) return;

  const projectDir = projectUrl(projectId);
  await Deno.mkdir(new URL("objects/UI/", projectDir), { recursive: true });
  await Deno.mkdir(new URL("objects/Logic/", projectDir), { recursive: true });
  await Deno.writeTextFile(objectUrl(projectId, "UI/CalculatorShell.ts"), REAL_CALCULATOR_SHELL_SOURCE);
  await Deno.writeTextFile(objectUrl(projectId, "Logic/CalculatorEngine.ts"), REAL_CALCULATOR_ENGINE_SOURCE);

  const engineStepId = "calculator-engine-press";
  const manifest: ProjectManifest = {
    version: 3,
    id: projectId,
    name: "Calculator · Real Demo",
    objects: ["UI/CalculatorShell.ts", "Logic/CalculatorEngine.ts"],
    objectFolders: ["UI", "Logic"],
    instances: [
      { id: "calculatorUI", objectFile: "UI/CalculatorShell.ts" },
      { id: "calculatorEngine", objectFile: "Logic/CalculatorEngine.ts" },
    ],
    blackboard: {
      display: { type: "string", value: "0" },
      expression: { type: "string", value: "" },
      memory: { type: "number", value: 0 },
    },
    rules: [
      {
        id: "calculator-key-rule",
        event: { instanceId: "calculatorUI", name: "keyPressed" },
        actions: [
          {
            id: engineStepId,
            action: { instanceId: "calculatorEngine", name: "pressKey" },
            inputs: {
              key: { kind: "event", path: "key" },
            },
            outputs: {
              display: { blackboardKey: "display" },
              expression: { blackboardKey: "expression" },
              memoryValue: { blackboardKey: "memory" },
              memoryLabel: {},
            },
          },
          {
            id: "calculator-render-view",
            action: { instanceId: "calculatorUI", name: "setView" },
            inputs: {
              display: { kind: "output", stepId: engineStepId, name: "display" },
              expression: { kind: "output", stepId: engineStepId, name: "expression" },
              memory: { kind: "output", stepId: engineStepId, name: "memoryLabel" },
            },
            outputs: {},
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
}


interface ReadyActionTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultFile: string;
  templatePath: string;
}

const READY_ACTION_TEMPLATES: ReadyActionTemplate[] = [
  { id: "math.add", name: "Add", category: "Math", description: "Add two numbers.", defaultFile: "Add.ts", templatePath: "actions/math/Add.ts" },
  { id: "math.subtract", name: "Subtract", category: "Math", description: "Subtract right from left.", defaultFile: "Subtract.ts", templatePath: "actions/math/Subtract.ts" },
  { id: "math.multiply", name: "Multiply", category: "Math", description: "Multiply two numbers.", defaultFile: "Multiply.ts", templatePath: "actions/math/Multiply.ts" },
  { id: "math.divide", name: "Divide", category: "Math", description: "Divide left by right with zero protection.", defaultFile: "Divide.ts", templatePath: "actions/math/Divide.ts" },
  { id: "math.modulo", name: "Modulo", category: "Math", description: "Return the division remainder.", defaultFile: "Modulo.ts", templatePath: "actions/math/Modulo.ts" },
  { id: "number.clamp", name: "Clamp", category: "Number", description: "Clamp a number between minimum and maximum.", defaultFile: "Clamp.ts", templatePath: "actions/number/Clamp.ts" },
  { id: "number.round", name: "Round", category: "Number", description: "Round a number to a chosen number of decimals.", defaultFile: "Round.ts", templatePath: "actions/number/Round.ts" },
  { id: "text.concat", name: "Concat Text", category: "Text", description: "Join two text values.", defaultFile: "Concat.ts", templatePath: "actions/text/Concat.ts" },
  { id: "logic.equals", name: "Equals", category: "Logic", description: "Compare two values using Object.is.", defaultFile: "Equals.ts", templatePath: "actions/logic/Equals.ts" },
  { id: "state.set-value", name: "Set Value", category: "State", description: "Pass a value through so it can be written to Blackboard.", defaultFile: "SetValue.ts", templatePath: "actions/state/SetValue.ts" },
];

function listReadyActionTemplates(): Array<Omit<ReadyActionTemplate, "templatePath">> {
  return READY_ACTION_TEMPLATES.map(({ templatePath: _templatePath, ...summary }) => summary);
}

async function addReadyAction(projectId: string, templateId: string, rawFolder: string): Promise<void> {
  const template = READY_ACTION_TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error("Unknown action template.");
  const manifest = await readManifest(projectId);
  const folder = validateObjectFolder(rawFolder || `Actions/${template.category}`);
  const baseName = template.defaultFile.replace(/\.ts$/, "");
  let file = folder ? `${folder}/${template.defaultFile}` : template.defaultFile;
  let index = 2;
  while (manifest.objects.includes(file)) {
    file = folder ? `${folder}/${baseName}${index}.ts` : `${baseName}${index}.ts`;
    index++;
  }
  file = validateObjectPath(file);
  const source = await Deno.readTextFile(new URL(template.templatePath, TEMPLATES_DIR));
  const result = transpileObject(source, file);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  const target = objectUrl(projectId, file);
  await Deno.mkdir(new URL(".", target), { recursive: true });
  await Deno.writeTextFile(target, source);
  manifest.objects.push(file);
  manifest.objectFolders = normalizeFolders([...manifest.objectFolders, folder], manifest.objects);
  manifest.instances.push({ id: uniqueInstanceId(baseName, manifest.instances), objectFile: file });
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(manifest);
}

async function ensureProjectTemplate(projectId: string, name: string, templateName: string): Promise<void> {
  if (await projectExists(projectId)) return;
  const templateRoot = new URL(`projects/${templateName}/`, TEMPLATES_DIR);
  const raw = JSON.parse(await Deno.readTextFile(new URL("project.json", templateRoot))) as ProjectManifest;
  const manifest: ProjectManifest = {
    ...raw,
    version: 3,
    id: projectId,
    name,
    objects: raw.objects.map(validateObjectPath),
    objectFolders: normalizeFolders(raw.objectFolders ?? [], raw.objects),
    instances: raw.instances.filter(isInstance).map(sanitizeProjectInstance),
    blackboard: sanitizeBlackboard(raw.blackboard),
    rules: sanitizeRules(raw.rules),
    updatedAt: new Date().toISOString(),
  };
  await Deno.mkdir(new URL("objects/", projectUrl(projectId)), { recursive: true });
  for (const file of manifest.objects) {
    const source = await Deno.readTextFile(new URL(`objects/${file}`, templateRoot));
    const result = transpileObject(source, file);
    if (result.errors.length) throw new Error(`Template ${file}: ${result.errors.join("\n")}`);
    const target = objectUrl(projectId, file);
    await Deno.mkdir(new URL(".", target), { recursive: true });
    await Deno.writeTextFile(target, source);
  }
  await writeManifest(manifest);
}

async function projectExists(projectId: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(new URL("project.json", projectUrl(projectId)));
    return stat.isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function listProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
  const result: Array<{ id: string; name: string; updatedAt: string }> = [];
  try {
    for await (const entry of Deno.readDir(PROJECTS_DIR)) {
      if (!entry.isDirectory) continue;
      try {
        const manifest = await readManifest(entry.name);
        result.push({ id: manifest.id, name: manifest.name, updatedAt: manifest.updatedAt });
      } catch {
        // Ignore incomplete or incompatible project folders.
      }
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return result;
}

async function createProject(name: string): Promise<ProjectManifest> {
  const base = slugify(name) || "project";
  const id = `${base}-${crypto.randomUUID().slice(0, 6)}`;
  const dir = projectUrl(id);
  await Deno.mkdir(new URL("objects/", dir), { recursive: true });

  const manifest: ProjectManifest = {
    version: 3,
    id,
    name,
    objects: [],
    objectFolders: [],
    instances: [],
    blackboard: {},
    rules: [],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
  return manifest;
}

async function addObject(projectId: string, rawName: string, rawFolder = ""): Promise<void> {
  const manifest = await readManifest(projectId);
  const objectName = pascalCase(rawName);
  if (!objectName) throw new Error("Object name must contain letters or numbers.");

  const folder = validateObjectFolder(rawFolder);
  if (folder) {
    await Deno.mkdir(objectFolderUrl(projectId, folder), { recursive: true });
    if (!manifest.objectFolders.includes(folder)) manifest.objectFolders.push(folder);
  }

  let basename = `${objectName}.ts`;
  let file = joinObjectPath(folder, basename);
  let suffix = 2;
  while (manifest.objects.includes(file)) {
    basename = `${objectName}${suffix++}.ts`;
    file = joinObjectPath(folder, basename);
  }

  const finalName = basename.replace(/\.ts$/, "");
  await Deno.writeTextFile(objectUrl(projectId, file), objectTemplate(finalName));
  manifest.objects.push(file);
  manifest.instances.push({
    id: uniqueInstanceId(lowerFirst(finalName), manifest.instances),
    objectFile: file,
  });
  manifest.objectFolders = normalizeFolders(manifest.objectFolders, manifest.objects);
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(manifest);
}

async function addObjectFolder(projectId: string, rawName: string, rawParent = ""): Promise<void> {
  const manifest = await readManifest(projectId);
  const parent = validateObjectFolder(rawParent);
  const name = sanitizeFolderSegment(rawName);
  const folder = validateObjectFolder(joinObjectPath(parent, name));
  if (manifest.objectFolders.includes(folder)) throw new Error("Object folder already exists.");
  await Deno.mkdir(objectFolderUrl(projectId, folder), { recursive: true });
  manifest.objectFolders.push(folder);
  manifest.objectFolders = normalizeFolders(manifest.objectFolders, manifest.objects);
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(manifest);
}

async function moveObject(projectId: string, rawFile: string, rawFolder = ""): Promise<void> {
  const manifest = await readManifest(projectId);
  const file = validateObjectPath(rawFile);
  if (!manifest.objects.includes(file)) throw new Error("Unknown object file.");
  const folder = validateObjectFolder(rawFolder);
  const basename = file.split("/").at(-1) ?? file;
  const nextFile = validateObjectPath(joinObjectPath(folder, basename));
  if (nextFile === file) return;
  if (manifest.objects.includes(nextFile)) throw new Error("An object with that filename already exists in the target folder.");

  if (folder) await Deno.mkdir(objectFolderUrl(projectId, folder), { recursive: true });
  await Deno.rename(objectUrl(projectId, file), objectUrl(projectId, nextFile));
  manifest.objects = manifest.objects.map((item) => item === file ? nextFile : item);
  manifest.instances = manifest.instances.map((item) => item.objectFile === file ? { ...item, objectFile: nextFile } : item);
  if (folder && !manifest.objectFolders.includes(folder)) manifest.objectFolders.push(folder);
  manifest.objectFolders = normalizeFolders(manifest.objectFolders, manifest.objects);
  manifest.updatedAt = new Date().toISOString();
  await writeManifest(manifest);
}

async function loadProject(projectId: string): Promise<{
  manifest: ProjectManifest;
  objects: Array<{ file: string; source: string; compiled: string }>;
}> {
  const manifest = await readManifest(projectId);
  const objects = [];
  for (const file of manifest.objects) {
    const source = await Deno.readTextFile(objectUrl(projectId, file));
    const result = transpileObject(source, file);
    objects.push({ file, source, compiled: result.output });
  }
  return { manifest, objects };
}

function transpileObject(source: string, file: string): { output: string; errors: string[] } {
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: false,
    },
  });

  const errors = (result.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      if (!diagnostic.file || diagnostic.start === undefined) return message;
      const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `${file}:${position.line + 1}:${position.character + 1} ${message}`;
    });

  return { output: result.outputText, errors };
}

async function readManifest(projectId: string): Promise<ProjectManifest> {
  const source = await Deno.readTextFile(new URL("project.json", projectUrl(validateProjectId(projectId))));
  const manifest = JSON.parse(source) as Omit<Partial<ProjectManifest>, "version" | "objectFolders"> & { version?: number; objectFolders?: unknown };
  if (manifest.id !== projectId || (manifest.version !== 2 && manifest.version !== 3)) throw new Error("Invalid project manifest.");
  return sanitizeLoadedManifest(manifest);
}

function sanitizeLoadedManifest(manifest: Omit<Partial<ProjectManifest>, "version" | "objectFolders"> & { id?: string; version?: number; objectFolders?: unknown }): ProjectManifest {
  const id = validateProjectId(String(manifest.id ?? ""));
  const objects = Array.isArray(manifest.objects) ? manifest.objects.map(validateObjectPath) : [];
  const explicitFolders = Array.isArray(manifest.objectFolders)
    ? manifest.objectFolders.filter((value): value is string => typeof value === "string").map(validateObjectFolder).filter(Boolean)
    : [];
  return {
    version: 3,
    id,
    name: typeof manifest.name === "string" && manifest.name.trim() ? manifest.name.trim() : id,
    objects,
    objectFolders: normalizeFolders(explicitFolders, objects),
    instances: Array.isArray(manifest.instances)
      ? manifest.instances.filter(isInstance).map(sanitizeProjectInstance)
      : [],
    blackboard: sanitizeBlackboard(manifest.blackboard),
    rules: sanitizeRules(manifest.rules),
    updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
  };
}

async function writeManifest(manifest: ProjectManifest): Promise<void> {
  const id = validateProjectId(manifest.id);
  await Deno.mkdir(projectUrl(id), { recursive: true });
  await Deno.writeTextFile(
    new URL("project.json", projectUrl(id)),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function sanitizeManifest(input: ProjectManifest, current: ProjectManifest): ProjectManifest {
  const validObjects = new Set(current.objects);
  const validInstances = new Set(current.instances.map((item) => item.id));

  const blackboard = sanitizeBlackboard(input.blackboard);
  const rules = sanitizeRules(input.rules).filter((rule) => {
    if (!validInstances.has(rule.event.instanceId)) return false;
    return rule.actions.every((step) => validInstances.has(step.action.instanceId));
  });

  return {
    ...current,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name,
    objects: current.objects.filter((file) => validObjects.has(file)),
    objectFolders: normalizeFolders(current.objectFolders, current.objects),
    instances: current.instances,
    blackboard,
    rules,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeBlackboard(value: unknown): Record<string, BlackboardEntry> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, BlackboardEntry> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(key)) continue;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<BlackboardEntry>;
    const type = isPortType(entry.type) ? entry.type : "any";
    result[key] = { type, value: entry.value };
  }
  return result;
}

function sanitizeRules(value: unknown): EventRule[] {
  if (!Array.isArray(value)) return [];
  const rules: EventRule[] = [];
  for (const rawRule of value) {
    if (!rawRule || typeof rawRule !== "object") continue;
    const rule = rawRule as Partial<EventRule>;
    if (!isEndpoint(rule.event)) continue;

    const actions: ActionStep[] = [];
    for (const rawStep of Array.isArray(rule.actions) ? rule.actions : []) {
      if (!rawStep || typeof rawStep !== "object") continue;
      const step = rawStep as Partial<ActionStep>;
      if (!isEndpoint(step.action)) continue;
      actions.push({
        id: typeof step.id === "string" && step.id ? step.id : crypto.randomUUID(),
        action: { instanceId: step.action.instanceId, name: step.action.name },
        inputs: sanitizeBindings(step.inputs),
        outputs: sanitizeOutputs(step.outputs),
      });
    }

    rules.push({
      id: typeof rule.id === "string" && rule.id ? rule.id : crypto.randomUUID(),
      event: { instanceId: rule.event.instanceId, name: rule.event.name },
      actions,
    });
  }
  return rules;
}

function sanitizeBindings(value: unknown): Record<string, ValueBinding> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, ValueBinding> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const binding = raw as Record<string, unknown>;
    if (binding.kind === "literal") result[key] = { kind: "literal", value: binding.value };
    if (binding.kind === "blackboard" && typeof binding.key === "string") result[key] = { kind: "blackboard", key: binding.key };
    if (binding.kind === "state" && typeof binding.instanceId === "string" && typeof binding.path === "string") {
      result[key] = { kind: "state", instanceId: binding.instanceId, path: binding.path };
    }
    if (binding.kind === "event" && typeof binding.path === "string") result[key] = { kind: "event", path: binding.path };
    if (binding.kind === "output" && typeof binding.stepId === "string" && typeof binding.name === "string") {
      result[key] = { kind: "output", stepId: binding.stepId, name: binding.name };
    }
  }
  return result;
}

function sanitizeOutputs(value: unknown): Record<string, { blackboardKey?: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, { blackboardKey?: string }> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") {
      result[key] = {};
      continue;
    }
    const blackboardKey = (raw as { blackboardKey?: unknown }).blackboardKey;
    result[key] = typeof blackboardKey === "string" && blackboardKey ? { blackboardKey } : {};
  }
  return result;
}

function isEndpoint(value: unknown): value is EventEndpoint {
  if (!value || typeof value !== "object") return false;
  const endpoint = value as Partial<EventEndpoint>;
  return typeof endpoint.instanceId === "string" && endpoint.instanceId.length > 0 &&
    typeof endpoint.name === "string" && endpoint.name.length > 0;
}

function sanitizeProjectInstance(item: ProjectInstance): ProjectInstance {
  const props = item.props && typeof item.props === "object" && !Array.isArray(item.props)
    ? structuredClone(item.props)
    : undefined;
  const parent = item.parent && typeof item.parent === "object" &&
      typeof item.parent.instanceId === "string" && typeof item.parent.slot === "string"
    ? { instanceId: item.parent.instanceId, slot: item.parent.slot }
    : undefined;
  return {
    id: item.id,
    objectFile: validateObjectPath(item.objectFile),
    ...(props ? { props } : {}),
    ...(parent ? { parent } : {}),
  };
}

function isInstance(value: unknown): value is ProjectInstance {
  if (!value || typeof value !== "object") return false;
  const instance = value as Partial<ProjectInstance>;
  return typeof instance.id === "string" && /^[A-Za-z_][A-Za-z0-9_-]{0,79}$/.test(instance.id) &&
    typeof instance.objectFile === "string";
}

function isPortType(value: unknown): value is PortType {
  return value === "number" || value === "string" || value === "boolean" || value === "any";
}

function projectUrl(projectId: string): URL {
  return new URL(`${validateProjectId(projectId)}/`, PROJECTS_DIR);
}

function objectUrl(projectId: string, file: string): URL {
  return new URL(`objects/${encodeObjectPath(validateObjectPath(file))}`, projectUrl(projectId));
}

function objectFolderUrl(projectId: string, folder: string): URL {
  const safe = validateObjectFolder(folder);
  return new URL(`objects/${safe ? `${encodeObjectPath(safe)}/` : ""}`, projectUrl(projectId));
}

function validateProjectId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(value)) throw new Error("Invalid project id.");
  return value;
}

function validateObjectPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (!segments.length || segments.length > 8) throw new Error("Invalid object path.");
  const file = segments.at(-1) ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}\.ts$/.test(file)) throw new Error("Invalid object filename.");
  for (const folder of segments.slice(0, -1)) validateFolderSegment(folder);
  return segments.join("/");
}

function validateObjectFolder(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "";
  const segments = normalized.split("/");
  if (segments.length > 7) throw new Error("Object folders are nested too deeply.");
  for (const segment of segments) validateFolderSegment(segment);
  return segments.join("/");
}

function validateFolderSegment(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(value) || value === "." || value === "..") {
    throw new Error("Folder names must start with a letter and may contain letters, numbers, spaces, _ and -.");
  }
  return value;
}

function sanitizeFolderSegment(value: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9 _-]+/g, "").replace(/\s+/g, " ").slice(0, 40);
  return validateFolderSegment(safe);
}

function joinObjectPath(left: string, right: string): string {
  return [left, right].filter(Boolean).join("/");
}

function encodeObjectPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function normalizeFolders(explicitFolders: string[], objects: string[]): string[] {
  const result = new Set<string>();
  for (const raw of explicitFolders) {
    const folder = validateObjectFolder(raw);
    if (folder) result.add(folder);
  }
  for (const object of objects) {
    const parts = validateObjectPath(object).split("/").slice(0, -1);
    for (let index = 1; index <= parts.length; index++) result.add(parts.slice(0, index).join("/"));
  }
  return [...result].sort((a, b) => a.localeCompare(b));
}

async function revealInFileManager(projectId: string, rawObjectFile?: string): Promise<void> {
  const projectPath = decodeURIComponent(projectUrl(projectId).pathname).replace(/^\/(?:([A-Za-z]:)\/)/, "$1/");
  const filePath = rawObjectFile
    ? decodeURIComponent(objectUrl(projectId, validateObjectPath(rawObjectFile)).pathname).replace(/^\/(?:([A-Za-z]:)\/)/, "$1/")
    : projectPath;

  const os = Deno.build.os;
  let command: Deno.Command;
  if (os === "windows") {
    const windowsPath = filePath.replace(/\//g, "\\");
    command = rawObjectFile
      ? new Deno.Command("explorer.exe", { args: [`/select,${windowsPath}`] })
      : new Deno.Command("explorer.exe", { args: [windowsPath] });
  } else if (os === "darwin") {
    command = rawObjectFile
      ? new Deno.Command("open", { args: ["-R", filePath] })
      : new Deno.Command("open", { args: [filePath] });
  } else {
    const folder = rawObjectFile ? filePath.slice(0, Math.max(filePath.lastIndexOf("/"), 0)) : filePath;
    command = new Deno.Command("xdg-open", { args: [folder] });
  }
  const child = command.spawn();
  child.unref();
}

function uniqueInstanceId(base: string, instances: ProjectInstance[]): string {
  const safeBase = base.replace(/[^A-Za-z0-9_]/g, "") || "object";
  const used = new Set(instances.map((item) => item.id));
  let index = 1;
  while (used.has(`${safeBase}${index}`)) index++;
  return `${safeBase}${index}`;
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function pascalCase(value: string): string {
  return value
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    .slice(0, 60);
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function objectTemplate(name: string): string {
  return `export default defineObject({\n  name: "${name}",\n  description: "A project object.",\n\n  state: {},\n\n  events: {},\n\n  actions: {},\n\n  mount({ host }) {\n    const element = document.createElement("div");\n    element.className = "logic-object";\n    element.textContent = "${name}";\n    host.append(element);\n\n    return {\n      update() {},\n      dispose() {\n        element.remove();\n      },\n    };\n  },\n});\n`;
}

async function fileResponse(url: URL, contentType: string): Promise<Response> {
  try {
    return new Response(await Deno.readFile(url), {
      headers: { "content-type": contentType, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return new Response("Not found", { status: 404 });
    throw error;
  }
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_BUTTON_SOURCE = `export default defineObject({
  name: "Button",
  description: "A clickable button that emits its own click event.",

  state: {
    label: "Add one",
  },

  events: {
    click: {
      label: "Click",
      description: "Fires when the button is pressed.",
    },
  },

  actions: {
    setLabel: {
      label: "Set label",
      inputs: {
        text: { type: "string", label: "Text", default: "Button" },
      },
      run(context, inputs) {
        context.state.label = String(inputs.text ?? "");
      },
    },
  },

  mount({ host, state, emit }) {
    const button = document.createElement("button");
    button.className = "demo-button";

    const update = () => {
      button.textContent = String(state.label ?? "Button");
    };

    button.addEventListener("click", () => emit("click"));
    host.append(button);
    update();

    return {
      update,
      dispose() {
        button.remove();
      },
    };
  },
});
`;

const DEFAULT_COUNTER_SOURCE = `export default defineObject({
  name: "Counter",
  description: "Owns a numeric value and exposes typed actions.",

  state: {
    value: 0,
  },

  events: {},

  actions: {
    increment: {
      label: "Increment",
      inputs: {
        amount: {
          type: "number",
          label: "Amount",
          default: 1,
          description: "How much to add.",
        },
      },
      outputs: {
        value: {
          type: "number",
          label: "New value",
        },
      },
      run(context, inputs) {
        context.state.value = Number(context.state.value ?? 0) + Number(inputs.amount ?? 1);
        return { value: context.state.value };
      },
    },

    setValue: {
      label: "Set value",
      inputs: {
        value: { type: "number", label: "Value", default: 0 },
      },
      outputs: {
        value: { type: "number", label: "New value" },
      },
      run(context, inputs) {
        context.state.value = Number(inputs.value ?? 0);
        return { value: context.state.value };
      },
    },
  },

  mount({ host, state }) {
    const counter = document.createElement("div");
    counter.className = "demo-counter";

    const update = () => {
      counter.textContent = String(state.value ?? 0);
    };

    host.append(counter);
    update();

    return {
      update,
      dispose() {
        counter.remove();
      },
    };
  },
});
`;

const CALCULATOR_FORM_SOURCE = `export default defineObject({
  name: "CalculatorForm",
  description: "Collects values from the user and emits a typed calculate event.",

  state: {
    left: 12,
    right: 3,
    operator: "+",
  },

  events: {
    calculate: {
      label: "Calculate",
      outputs: {
        left: { type: "number", label: "Left number" },
        right: { type: "number", label: "Right number" },
        operator: { type: "string", label: "Operator" },
      },
    },
  },

  actions: {},

  mount({ host, state, emit }) {
    const form = document.createElement("div");
    form.className = "calculator-form";

    const left = document.createElement("input");
    left.className = "number-field";
    left.type = "number";
    left.step = "any";

    const operator = document.createElement("select");
    operator.className = "operation-field";
    for (const value of ["+", "-", "×", "÷"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      operator.append(option);
    }

    const right = document.createElement("input");
    right.className = "number-field";
    right.type = "number";
    right.step = "any";

    const button = document.createElement("button");
    button.className = "calc-button";
    button.textContent = "Calculate";

    const update = () => {
      left.value = String(state.left ?? 0);
      right.value = String(state.right ?? 0);
      operator.value = String(state.operator ?? "+");
    };

    left.addEventListener("input", () => state.left = Number(left.value || 0));
    right.addEventListener("input", () => state.right = Number(right.value || 0));
    operator.addEventListener("change", () => state.operator = operator.value);
    button.addEventListener("click", () => {
      emit("calculate", {
        left: Number(state.left ?? 0),
        right: Number(state.right ?? 0),
        operator: String(state.operator ?? "+"),
      });
    });

    form.append(left, operator, right, button);
    host.append(form);
    update();

    return {
      update,
      dispose() {
        form.remove();
      },
    };
  },
});
`;

const CALCULATOR_LOGIC_SOURCE = `export default defineObject({
  name: "Calculator",
  description: "Pure calculator logic. It knows nothing about the form or result display.",

  state: {},
  events: {},

  actions: {
    calculate: {
      label: "Calculate",
      inputs: {
        left: { type: "number", label: "Left", default: 0 },
        right: { type: "number", label: "Right", default: 0 },
        operator: { type: "string", label: "Operator", default: "+" },
      },
      outputs: {
        result: { type: "number", label: "Result" },
        expression: { type: "string", label: "Expression" },
      },
      run(_context, inputs) {
        const left = Number(inputs.left ?? 0);
        const right = Number(inputs.right ?? 0);
        const operator = String(inputs.operator ?? "+");

        let result = 0;
        if (operator === "+") result = left + right;
        else if (operator === "-") result = left - right;
        else if (operator === "×" || operator === "*") result = left * right;
        else if (operator === "÷" || operator === "/") result = right === 0 ? Number.NaN : left / right;

        return {
          result,
          expression: left + " " + operator + " " + right + " = " + result,
        };
      },
    },
  },

  mount({ host }) {
    const element = document.createElement("div");
    element.className = "logic-object";
    element.textContent = "Logic object · no direct UI";
    host.append(element);
    return { dispose() { element.remove(); } };
  },
});
`;

const RESULT_DISPLAY_SOURCE = `export default defineObject({
  name: "ResultDisplay",
  description: "Displays a numeric value passed in through an action input.",

  state: {
    value: 0,
  },

  events: {},

  actions: {
    setValue: {
      label: "Set value",
      inputs: {
        value: { type: "number", label: "Value", default: 0 },
      },
      run(context, inputs) {
        context.state.value = Number(inputs.value ?? 0);
      },
    },
  },

  mount({ host, state }) {
    const wrap = document.createElement("div");
    wrap.className = "result-card";
    const caption = document.createElement("span");
    caption.textContent = "Result";
    const value = document.createElement("strong");
    value.className = "result-display";
    wrap.append(caption, value);

    const update = () => {
      value.textContent = String(state.value ?? 0);
    };

    host.append(wrap);
    update();
    return {
      update,
      dispose() { wrap.remove(); },
    };
  },
});
`;


const REAL_CALCULATOR_SHELL_SOURCE = `export default defineObject({
  name: "CalculatorShell",
  description: "Visual calculator surface. It emits key presses and only renders values it receives through actions.",

  state: {
    display: "0",
    expression: "",
    memory: "",
  },

  events: {
    keyPressed: {
      label: "Key pressed",
      description: "Fires for every calculator key. The shell does not calculate anything itself.",
      outputs: {
        key: { type: "string", label: "Key" },
      },
    },
  },

  actions: {
    setView: {
      label: "Set calculator view",
      inputs: {
        display: { type: "string", label: "Display", default: "0" },
        expression: { type: "string", label: "Expression", default: "" },
        memory: { type: "string", label: "Memory", default: "" },
      },
      run(context, inputs) {
        context.state.display = String(inputs.display ?? "0");
        context.state.expression = String(inputs.expression ?? "");
        context.state.memory = String(inputs.memory ?? "");
      },
    },
  },

  mount({ host, state, emit }) {
    const root = document.createElement("div");
    root.className = "real-calculator";

    const top = document.createElement("div");
    top.className = "real-calculator__screen";
    const memory = document.createElement("div");
    memory.className = "real-calculator__memory";
    const expression = document.createElement("div");
    expression.className = "real-calculator__expression";
    const display = document.createElement("div");
    display.className = "real-calculator__display";
    top.append(memory, expression, display);

    const keys = document.createElement("div");
    keys.className = "real-calculator__keys";
    const rows = [
      ["MC", "MR", "M+", "M-"],
      ["C", "CE", "⌫", "÷"],
      ["7", "8", "9", "×"],
      ["4", "5", "6", "−"],
      ["1", "2", "3", "+"],
      ["0", ".", "=", "="],
    ];

    for (const row of rows) {
      for (let index = 0; index < row.length; index++) {
        const key = row[index];
        if (key === "=" && index === 3) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = key;
        button.dataset.key = key;
        button.className = "real-calculator__key";
        if (["÷", "×", "−", "+"].includes(key)) button.classList.add("is-operator");
        if (["MC", "MR", "M+", "M-"].includes(key)) button.classList.add("is-memory");
        if (["C", "CE", "⌫"].includes(key)) button.classList.add("is-control");
        if (key === "0") button.classList.add("is-zero");
        if (key === "=") button.classList.add("is-equals");
        button.addEventListener("click", () => emit("keyPressed", { key }));
        keys.append(button);
      }
    }

    root.append(top, keys);
    host.append(root);

    const update = () => {
      memory.textContent = String(state.memory ?? "");
      expression.textContent = String(state.expression ?? "");
      display.textContent = String(state.display ?? "0");
      display.title = String(state.display ?? "0");
    };
    update();

    return {
      update,
      dispose() { root.remove(); },
    };
  },
});
`;

const REAL_CALCULATOR_ENGINE_SOURCE = `export default defineObject({
  name: "CalculatorEngine",
  description: "Stateful calculator logic. It has no UI and knows nothing about CalculatorShell.",

  state: {
    display: "0",
    accumulator: null,
    operator: "",
    waitingForOperand: false,
    expression: "",
    memory: 0,
  },

  events: {},

  actions: {
    pressKey: {
      label: "Press calculator key",
      description: "Processes one calculator key and returns the complete view model.",
      inputs: {
        key: { type: "string", label: "Key", default: "0" },
      },
      outputs: {
        display: { type: "string", label: "Display" },
        expression: { type: "string", label: "Expression" },
        memoryValue: { type: "number", label: "Memory value" },
        memoryLabel: { type: "string", label: "Memory label" },
      },
      run(context, inputs) {
        const state = context.state;
        const key = String(inputs.key ?? "");

        const currentNumber = () => Number(String(state.display ?? "0"));
        const format = (value) => {
          if (!Number.isFinite(value)) return "Error";
          const rounded = Number(value.toPrecision(12));
          return Object.is(rounded, -0) ? "0" : String(rounded);
        };
        const calculate = (left, operator, right) => {
          if (operator === "+") return left + right;
          if (operator === "−" || operator === "-") return left - right;
          if (operator === "×" || operator === "*") return left * right;
          if (operator === "÷" || operator === "/") return right === 0 ? Number.NaN : left / right;
          return right;
        };
        const resetAll = () => {
          state.display = "0";
          state.accumulator = null;
          state.operator = "";
          state.waitingForOperand = false;
          state.expression = "";
        };

        if (/^[0-9]$/.test(key)) {
          if (state.display === "Error" || state.waitingForOperand) {
            state.display = key;
            state.waitingForOperand = false;
          } else {
            const text = String(state.display ?? "0");
            state.display = text === "0" ? key : text + key;
          }
        } else if (key === ".") {
          if (state.display === "Error" || state.waitingForOperand) {
            state.display = "0.";
            state.waitingForOperand = false;
          } else if (!String(state.display).includes(".")) {
            state.display = String(state.display) + ".";
          }
        } else if (["+", "−", "×", "÷"].includes(key)) {
          const current = currentNumber();
          if (!Number.isFinite(current)) {
            resetAll();
          } else if (state.accumulator !== null && state.operator && !state.waitingForOperand) {
            const result = calculate(Number(state.accumulator), String(state.operator), current);
            state.display = format(result);
            state.accumulator = result;
          } else {
            state.accumulator = current;
          }
          state.operator = key;
          state.expression = String(state.display) + " " + key;
          state.waitingForOperand = true;
        } else if (key === "=") {
          if (state.accumulator !== null && state.operator) {
            const right = currentNumber();
            const left = Number(state.accumulator);
            const operator = String(state.operator);
            const result = calculate(left, operator, right);
            state.expression = format(left) + " " + operator + " " + format(right) + " =";
            state.display = format(result);
            state.accumulator = null;
            state.operator = "";
            state.waitingForOperand = true;
          }
        } else if (key === "CE") {
          state.display = "0";
          state.waitingForOperand = false;
        } else if (key === "C") {
          resetAll();
        } else if (key === "⌫") {
          if (!state.waitingForOperand && state.display !== "Error") {
            const text = String(state.display ?? "0");
            state.display = text.length <= 1 || (text.length === 2 && text.startsWith("-")) ? "0" : text.slice(0, -1);
          }
        } else if (key === "MC") {
          state.memory = 0;
        } else if (key === "MR") {
          state.display = format(Number(state.memory ?? 0));
          state.waitingForOperand = true;
        } else if (key === "M+") {
          const current = currentNumber();
          if (Number.isFinite(current)) state.memory = Number(state.memory ?? 0) + current;
        } else if (key === "M-") {
          const current = currentNumber();
          if (Number.isFinite(current)) state.memory = Number(state.memory ?? 0) - current;
        }

        const memoryValue = Number(state.memory ?? 0);
        return {
          display: String(state.display ?? "0"),
          expression: String(state.expression ?? ""),
          memoryValue,
          memoryLabel: memoryValue === 0 ? "" : "M  " + format(memoryValue),
        };
      },
    },
  },
});
`;

await main();
