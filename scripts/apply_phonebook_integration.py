from pathlib import Path
import json


def replace(path: str, old: str, new: str, label: str, count: int = 1) -> None:
    p = Path(path)
    source = p.read_text()
    if old not in source:
        raise RuntimeError(f"missing {label} in {path}")
    p.write_text(source.replace(old, new, count))


# Runtime lifecycle: emit `created` once after synchronous construction/mount setup.
replace(
    "src/client/runtime.ts",
    '''    for (const instance of instances) {
      const definition = definitionsByFile.get(instance.objectFile);
      if (!definition) continue;
      this.#runtimeInstances.set(instance.id, {
        id: instance.id,
        definition,
        state: cloneState(definition.state ?? {}),
        props: Object.freeze(structuredClone(instance.props ?? {})),
      });
    }
  }

  mountPreview''',
    '''    for (const instance of instances) {
      const definition = definitionsByFile.get(instance.objectFile);
      if (!definition) continue;
      this.#runtimeInstances.set(instance.id, {
        id: instance.id,
        definition,
        state: cloneState(definition.state ?? {}),
        props: Object.freeze(structuredClone(instance.props ?? {})),
      });
    }

    queueMicrotask(() => {
      for (const instance of this.#runtimeInstances.values()) {
        if (instance.definition.events?.created) this.emit(instance.id, "created");
      }
    });
  }

  mountPreview''',
    "created lifecycle",
)

# App builder: read build.json and link generated style-provider outputs.
p = Path("src/server/app-builder.ts")
s = p.read_text()
s = s.replace(
    'import type { LoadedProject, ProjectPackagePermissions } from "../client/model.ts";\n',
    'import type { LoadedProject, ProjectPackagePermissions } from "../client/model.ts";\nimport { readBuildManifest, styleLinks } from "./build-providers.ts";\n',
    1,
)
s = s.replace(
    '  const { projectId, projectRoot, outputRoot, project } = options;\n',
    '  const { projectId, projectRoot, outputRoot, project } = options;\n  const buildManifest = await readBuildManifest(projectRoot);\n',
    1,
)
s = s.replace(
    '  await Deno.writeTextFile(new URL("public/index.html", outputRoot), standaloneHtml(projectId));',
    '  await Deno.writeTextFile(new URL("public/index.html", outputRoot), standaloneHtml(projectId, styleLinks(buildManifest)));',
    1,
)
s = s.replace(
    '  await copyOptionalFile(new URL("packages.json", projectRoot), new URL("packages.json", outputRoot));',
    '  await copyOptionalFile(new URL("packages.json", projectRoot), new URL("packages.json", outputRoot));\n  await copyOptionalFile(new URL("build.json", projectRoot), new URL("build.json", outputRoot));',
    1,
)
old = 'function standaloneHtml(projectId: string): string {\n  const id = JSON.stringify(projectId);\n  return `<!doctype html>'
new = 'function standaloneHtml(projectId: string, styles: string[]): string {\n  const id = JSON.stringify(projectId);\n  const styleTags = styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("\\n  ");\n  return `<!doctype html>'
if old not in s:
    raise RuntimeError("standaloneHtml signature missing")
s = s.replace(old, new, 1)
s = s.replace('  <title>Spork App</title>\n  <style>', '  <title>Spork App</title>\n  ${styleTags}\n  <style>', 1)
p.write_text(s)

# Server build/run pipeline.
p = Path("src/server.ts")
s = p.read_text()
s = s.replace(
    'import { buildStandaloneApp } from "./server/app-builder.ts";\n',
    'import { buildStandaloneApp } from "./server/app-builder.ts";\nimport { runBuildProviders } from "./server/build-providers.ts";\n',
    1,
)
old_build = '''    if (parts.length === 4 && parts[3] === "build" && request.method === "POST") {
      const project = await loadProject(projectId);
      const outputRoot = new URL(`${projectId}/`, BUILDS_DIR);
      const result = await buildStandaloneApp({ projectId, projectRoot: projectUrl(projectId), outputRoot, project });
      return json({ ok: true, projectId, output: decodeURIComponent(result.outputRoot.pathname) });
    }'''
new_build = '''    if (parts.length === 4 && parts[3] === "build" && request.method === "POST") {
      const result = await prepareStandaloneBuild(projectId);
      return json({ ok: true, projectId, output: decodeURIComponent(result.outputRoot.pathname) });
    }'''
if old_build not in s:
    raise RuntimeError("build route missing")
s = s.replace(old_build, new_build, 1)
old_run = '''  const project = await loadProject(projectId);
  const outputRoot = new URL(`${projectId}/`, BUILDS_DIR);
  await buildStandaloneApp({ projectId, projectRoot: projectUrl(projectId), outputRoot, project });

  const install = new Deno.Command(Deno.execPath(), {'''
new_run = '''  const { outputRoot } = await prepareStandaloneBuild(projectId);

  const install = new Deno.Command(Deno.execPath(), {'''
if old_run not in s:
    raise RuntimeError("run build block missing")
s = s.replace(old_run, new_run, 1)
run_marker = 'async function runStandaloneProject(projectId: string): Promise<{ ok: true; projectId: string; url: string; port: number }> {'
prepare = '''async function prepareStandaloneBuild(projectId: string): Promise<{ outputRoot: URL }> {
  const projectRoot = projectUrl(projectId);
  const packageManager = new ProjectPackageManager(projectRoot);
  const packageManifest = await packageManager.read();
  if (packageManifest.packages.length) await packageManager.install();
  const project = await loadProject(projectId);
  const outputRoot = new URL(`${projectId}/`, BUILDS_DIR);
  await buildStandaloneApp({ projectId, projectRoot, outputRoot, project });
  await runBuildProviders(projectRoot, outputRoot);
  return { outputRoot };
}

'''
if run_marker not in s:
    raise RuntimeError("run function marker missing")
s = s.replace(run_marker, prepare + run_marker, 1)

# Template registration.
s = s.replace(
    '  await ensureProjectTemplate("calculator-modular-demo", "Calculator · Modular Demo", "calculator-modular");\n',
    '  await ensureProjectTemplate("calculator-modular-demo", "Calculator · Modular Demo", "calculator-modular");\n  await ensureProjectTemplate("phone-book-demo", "Phone Book · SQLite Demo", "phone-book");\n',
    1,
)
template_anchor = '''    await packageManager.ensure();
  }
}

async function projectExists'''
template_new = '''    await packageManager.ensure();
  }
  await copyTemplateDirectory(new URL("host/", templateRoot), new URL("host/", projectUrl(projectId)));
  await copyTemplateDirectory(new URL("build/", templateRoot), new URL("build/", projectUrl(projectId)));
  await copyTemplateFile(new URL("build.json", templateRoot), new URL("build.json", projectUrl(projectId)));
}

async function copyTemplateDirectory(source: URL, target: URL): Promise<void> {
  try {
    const info = await Deno.stat(source);
    if (!info.isDirectory) return;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return;
    throw error;
  }
  await Deno.mkdir(target, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const src = new URL(entry.name + (entry.isDirectory ? "/" : ""), source);
    const dst = new URL(entry.name + (entry.isDirectory ? "/" : ""), target);
    if (entry.isDirectory) await copyTemplateDirectory(src, dst);
    else if (entry.isFile) await Deno.copyFile(src, dst);
  }
}

async function copyTemplateFile(source: URL, target: URL): Promise<void> {
  try {
    await Deno.mkdir(new URL(".", target), { recursive: true });
    await Deno.copyFile(source, target);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

async function projectExists'''
if template_anchor not in s:
    raise RuntimeError("template copy anchor missing")
s = s.replace(template_anchor, template_new, 1)
p.write_text(s)

# Contact form cancel is a UI event, not an accidental update request.
p = Path("templates/projects/phone-book/objects/UI/ContactForm.tsx")
s = p.read_text()
s = s.replace(
    '    updateRequested: { outputs: { id: { type: "number" }, contact: { type: "any" } } },',
    '    updateRequested: { outputs: { id: { type: "number" }, contact: { type: "any" } } },\n    cancelRequested: {},',
    1,
)
s = s.replace('onClick={() => emit("updateRequested", { id: 0, cancel: true })}', 'onClick={() => emit("cancelRequested")}', 1)
p.write_text(s)

# Canonical project manifest.
def action(step_id, instance, name, inputs=None):
    return {"id": step_id, "action": {"instanceId": instance, "name": name}, "inputs": inputs or {}, "outputs": {}}

def event(path):
    return {"kind": "event", "path": path}

def literal(value):
    return {"kind": "literal", "value": value}

def rule(rule_id, instance, event_name, actions):
    return {"id": rule_id, "event": {"instanceId": instance, "name": event_name}, "actions": actions}

manifest = {
    "version": 3,
    "id": "template",
    "name": "Phone Book · SQLite Demo",
    "objects": [
        "UI/PhoneBookShell.tsx", "UI/SearchBox.tsx", "UI/ContactList.tsx", "UI/ContactForm.tsx", "UI/StatusBar.tsx",
        "Data/LoadContacts.ts", "Data/CreateContact.ts", "Data/UpdateContact.ts", "Data/DeleteContact.ts",
    ],
    "objectFolders": ["UI", "Data"],
    "styles": [],
    "instances": [
        {"id": "app", "objectFile": "UI/PhoneBookShell.tsx"},
        {"id": "search", "objectFile": "UI/SearchBox.tsx", "parent": {"instanceId": "app", "slot": "search"}},
        {"id": "list", "objectFile": "UI/ContactList.tsx", "parent": {"instanceId": "app", "slot": "list"}},
        {"id": "form", "objectFile": "UI/ContactForm.tsx", "parent": {"instanceId": "app", "slot": "form"}},
        {"id": "status", "objectFile": "UI/StatusBar.tsx", "parent": {"instanceId": "app", "slot": "status"}},
        {"id": "loadContacts", "objectFile": "Data/LoadContacts.ts"},
        {"id": "createContact", "objectFile": "Data/CreateContact.ts"},
        {"id": "updateContact", "objectFile": "Data/UpdateContact.ts"},
        {"id": "deleteContact", "objectFile": "Data/DeleteContact.ts"},
    ],
    "blackboard": {},
    "rules": [],
    "updatedAt": "1970-01-01T00:00:00.000Z",
}
rules = manifest["rules"]
rules.append(rule("initial-load", "app", "created", [action("load-initial", "loadContacts", "load", {"query": literal("")})]))
rules.append(rule("search", "search", "changed", [action("load-search", "loadContacts", "load", {"query": event("query")})]))
rules.append(rule("loaded", "loadContacts", "loaded", [
    action("show-list", "list", "setContacts", {"contacts": event("contacts")}),
    action("loaded-status", "status", "set", {"message": event("message"), "kind": literal("info")}),
]))
rules.append(rule("load-failed", "loadContacts", "failed", [action("load-error", "status", "set", {"message": event("message"), "kind": literal("error")})]))
rules.append(rule("create", "form", "createRequested", [action("create-api", "createContact", "create", {"contact": event("contact")})]))
rules.append(rule("update", "form", "updateRequested", [action("update-api", "updateContact", "update", {"id": event("id"), "contact": event("contact")})]))
rules.append(rule("cancel-edit", "form", "cancelRequested", [action("reset-cancel", "form", "reset")]))
rules.append(rule("edit", "list", "editRequested", [action("edit-form", "form", "edit", {"contact": event("contact")})]))
rules.append(rule("delete", "list", "deleteRequested", [action("delete-api", "deleteContact", "remove", {"id": event("id"), "name": event("name")})]))
for source, prefix in [("createContact", "create"), ("updateContact", "update")]:
    rules.append(rule(f"{prefix}-saved", source, "saved", [
        action(f"{prefix}-reset", "form", "reset"),
        action(f"{prefix}-reload", "loadContacts", "load", {"query": literal("")}),
        action(f"{prefix}-status", "status", "set", {"message": event("message"), "kind": literal("info")}),
    ]))
rules.append(rule("delete-done", "deleteContact", "deleted", [
    action("delete-reload", "loadContacts", "load", {"query": literal("")}),
    action("delete-status", "status", "set", {"message": event("message"), "kind": literal("info")}),
]))
for source in ["createContact", "updateContact", "deleteContact"]:
    rules.append(rule(f"{source}-failed", source, "failed", [action(f"{source}-error", "status", "set", {"message": event("message"), "kind": literal("error")})]))

Path("templates/projects/phone-book/project.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
