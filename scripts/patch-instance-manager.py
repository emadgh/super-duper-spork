from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    if old not in source:
        raise SystemExit(f"Expected fragment not found in {path}: {old[:100]!r}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


# Server: manifests may now mutate instances, while instance ids/object files/parents/rules remain sanitized.
replace_once(
    "src/server.ts",
    '''function sanitizeLoadedManifest(manifest: Omit<Partial<ProjectManifest>, "version" | "objectFolders"> & { id?: string; version?: number; objectFolders?: unknown }): ProjectManifest {
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
    styles: Array.isArray(manifest.styles) ? manifest.styles.filter((value): value is string => typeof value === "string").map(validateStylePath) : [],
    instances: Array.isArray(manifest.instances)
      ? manifest.instances.filter(isInstance).map(sanitizeProjectInstance)
      : [],
    blackboard: sanitizeBlackboard(manifest.blackboard),
    rules: sanitizeRules(manifest.rules),
    updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
  };
}''',
    '''function sanitizeLoadedManifest(manifest: Omit<Partial<ProjectManifest>, "version" | "objectFolders"> & { id?: string; version?: number; objectFolders?: unknown }): ProjectManifest {
  const id = validateProjectId(String(manifest.id ?? ""));
  const objects = Array.isArray(manifest.objects) ? manifest.objects.map(validateObjectPath) : [];
  const explicitFolders = Array.isArray(manifest.objectFolders)
    ? manifest.objectFolders.filter((value): value is string => typeof value === "string").map(validateObjectFolder).filter(Boolean)
    : [];
  const instances = sanitizeInstances(manifest.instances, new Set(objects));
  const validInstances = new Set(instances.map((item) => item.id));
  return {
    version: 3,
    id,
    name: typeof manifest.name === "string" && manifest.name.trim() ? manifest.name.trim() : id,
    objects,
    objectFolders: normalizeFolders(explicitFolders, objects),
    styles: Array.isArray(manifest.styles) ? manifest.styles.filter((value): value is string => typeof value === "string").map(validateStylePath) : [],
    instances,
    blackboard: sanitizeBlackboard(manifest.blackboard),
    rules: sanitizeRules(manifest.rules).filter((rule) => ruleUsesOnlyInstances(rule, validInstances)),
    updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
  };
}''',
)

replace_once(
    "src/server.ts",
    '''function sanitizeManifest(input: ProjectManifest, current: ProjectManifest): ProjectManifest {
  const validObjects = new Set(current.objects);
  const validInstances = new Set(current.instances.map((item) => item.id));

  const blackboard = sanitizeBlackboard(input.blackboard);
  const rules = sanitizeRules(input.rules).filter((rule) => {
    if (!validInstances.has(rule.event.instanceId)) return false;
    if (!(rule.conditions ?? []).every((step) => validInstances.has(step.condition.instanceId))) return false;
    return rule.actions.every((step) => validInstances.has(step.action.instanceId));
  });

  return {
    ...current,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name,
    objects: current.objects.filter((file) => validObjects.has(file)),
    objectFolders: normalizeFolders(current.objectFolders, current.objects),
    styles: current.styles,
    instances: current.instances,
    blackboard,
    rules,
    updatedAt: new Date().toISOString(),
  };
}''',
    '''function sanitizeManifest(input: ProjectManifest, current: ProjectManifest): ProjectManifest {
  const validObjects = new Set(current.objects);
  const instances = sanitizeInstances(input.instances, validObjects);
  const validInstances = new Set(instances.map((item) => item.id));

  const blackboard = sanitizeBlackboard(input.blackboard);
  const rules = sanitizeRules(input.rules).filter((rule) => ruleUsesOnlyInstances(rule, validInstances));

  return {
    ...current,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : current.name,
    objects: current.objects.filter((file) => validObjects.has(file)),
    objectFolders: normalizeFolders(current.objectFolders, current.objects),
    styles: current.styles,
    instances,
    blackboard,
    rules,
    updatedAt: new Date().toISOString(),
  };
}

function sanitizeInstances(value: unknown, validObjects: Set<string>): ProjectInstance[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, ProjectInstance>();
  for (const raw of value) {
    if (!isInstance(raw)) continue;
    const instance = sanitizeProjectInstance(raw);
    if (!validObjects.has(instance.objectFile) || unique.has(instance.id)) continue;
    unique.set(instance.id, instance);
  }
  const ids = new Set(unique.keys());
  return [...unique.values()].map((instance) => {
    if (!instance.parent || instance.parent.instanceId === instance.id || !ids.has(instance.parent.instanceId)) {
      const { parent: _parent, ...root } = instance;
      return root;
    }
    return instance;
  });
}

function ruleUsesOnlyInstances(rule: EventRule, validInstances: Set<string>): boolean {
  if (!validInstances.has(rule.event.instanceId)) return false;
  if (!(rule.conditions ?? []).every((step) => validInstances.has(step.condition.instanceId) && bindingsUseOnlyInstances(step.inputs, validInstances))) return false;
  return rule.actions.every((step) => validInstances.has(step.action.instanceId) && bindingsUseOnlyInstances(step.inputs, validInstances));
}

function bindingsUseOnlyInstances(bindings: Record<string, ValueBinding>, validInstances: Set<string>): boolean {
  for (const binding of Object.values(bindings)) {
    if (binding.kind === "state" && !validInstances.has(binding.instanceId)) return false;
    if (binding.kind === "expression") {
      const references = binding.source.matchAll(/@state\.([A-Za-z_][A-Za-z0-9_-]{0,79})\./g);
      for (const match of references) if (!validInstances.has(match[1])) return false;
    }
  }
  return true;
}''',
)

# Objects navigator: selected type gets a compact instance manager.
replace_once(
    "src/client/index.html",
    '''        <div id="object-list" class="object-list object-tree"></div>
        <div class="navigator-footer">Folders and object files are managed by the project. Select a folder before creating an object to place it there.</div>''',
    '''        <div id="object-list" class="object-list object-tree"></div>
        <section class="instance-panel">
          <div class="instance-titlebar">
            <div><span class="eyebrow">SELECTED TYPE</span><strong>Instances</strong></div>
            <button id="add-instance" class="icon-button" title="Create another instance">＋</button>
          </div>
          <div id="instance-list" class="instance-list"></div>
          <div id="instance-properties" class="instance-properties"></div>
        </section>
        <div class="navigator-footer">Object files define reusable types. Instances own independent runtime state and per-instance property values.</div>''',
)

# Main editor wiring.
replace_once(
    "src/client/main.ts",
    '''const objectList = required<HTMLElement>("#object-list");
const objectFilter = required<HTMLInputElement>("#object-filter");''',
    '''const objectList = required<HTMLElement>("#object-list");
const instanceList = required<HTMLElement>("#instance-list");
const instanceProperties = required<HTMLElement>("#instance-properties");
const addInstanceButton = required<HTMLButtonElement>("#add-instance");
const objectFilter = required<HTMLInputElement>("#object-filter");''',
)
replace_once(
    "src/client/main.ts",
    '''let selectedFile: string | null = null;
let dirty = false;''',
    '''let selectedFile: string | null = null;
let selectedInstanceId: string | null = null;
let dirty = false;''',
)
replace_once(
    "src/client/main.ts",
    '''addObjectButton.addEventListener("click", () => void addObject());
addLibraryActionButton.addEventListener("click", () => void openActionLibrary());''',
    '''addObjectButton.addEventListener("click", () => void addObject());
addInstanceButton.addEventListener("click", () => void addInstance());
addLibraryActionButton.addEventListener("click", () => void openActionLibrary());''',
)
replace_once(
    "src/client/main.ts",
    '''  selectedFile = project.manifest.objects[0] ?? null;
  selectedFolder = "";
  dirty = false;''',
    '''  selectedFile = project.manifest.objects[0] ?? null;
  selectedInstanceId = selectedFile ? project.manifest.instances.find((item) => item.objectFile === selectedFile)?.id ?? null : null;
  selectedFolder = "";
  dirty = false;''',
)
replace_once(
    "src/client/main.ts",
    '''function renderAll(): void {
  renderObjectList();
  renderSelectedObject();''',
    '''function renderAll(): void {
  renderObjectList();
  renderInstances();
  renderSelectedObject();''',
)
replace_once(
    "src/client/main.ts",
    '''    selectedFile = file;
    selectedFolder = objectParentFolder(file);
    dirty = false;
    renderObjectList();
    renderSelectedObject();''',
    '''    selectedFile = file;
    selectedInstanceId = project?.manifest.instances.find((item) => item.objectFile === file)?.id ?? null;
    selectedFolder = objectParentFolder(file);
    dirty = false;
    renderObjectList();
    renderInstances();
    renderSelectedObject();''',
)
replace_once(
    "src/client/main.ts",
    '''  apiSummary.append(apiGroup("Object", [definition.name]));
  apiSummary.append(apiGroup("Events", Object.keys(definition.events ?? {}), "event"));''',
    '''  apiSummary.append(apiGroup("Object", [definition.name]));
  apiSummary.append(apiGroup("Properties", Object.keys(definition.properties ?? {})));
  apiSummary.append(apiGroup("Events", Object.keys(definition.events ?? {}), "event"));''',
)
replace_once(
    "src/client/main.ts",
    '''    renderObjectList();
    renderApiSummary();
    renderEventOptions();''',
    '''    renderObjectList();
    renderInstances();
    renderApiSummary();
    renderEventOptions();''',
)
# This fragment occurs in addReadyAction and addObject; update both.
main_path = Path("src/client/main.ts")
main_source = main_path.read_text(encoding="utf-8")
old = '''    selectedFile = updated.manifest.objects.at(-1) ?? null;
    if (selectedFile) selectedFolder = objectParentFolder(selectedFile);
    dirty = false;'''
new = '''    selectedFile = updated.manifest.objects.at(-1) ?? null;
    selectedInstanceId = selectedFile ? updated.manifest.instances.find((item) => item.objectFile === selectedFile)?.id ?? null : null;
    if (selectedFile) selectedFolder = objectParentFolder(selectedFile);
    dirty = false;'''
count = main_source.count(old)
if count < 2:
    raise SystemExit(f"Expected add-object selection fragment twice, got {count}")
main_path.write_text(main_source.replace(old, new, 2), encoding="utf-8")

replace_once(
    "src/client/main.ts",
    '''function renderSelectedObject(): void {''',
    '''function renderInstances(): void {
  instanceList.replaceChildren();
  instanceProperties.replaceChildren();
  addInstanceButton.disabled = !project || !selectedFile;
  if (!project || !selectedFile) {
    instanceList.append(emptyInline("Select an Object Type."));
    return;
  }

  const instances = project.manifest.instances.filter((item) => item.objectFile === selectedFile);
  if (!instances.some((item) => item.id === selectedInstanceId)) selectedInstanceId = instances[0]?.id ?? null;

  if (!instances.length) {
    instanceList.append(emptyInline("No instances. Create the first one."));
  }
  for (const instance of instances) {
    const row = document.createElement("div");
    row.className = `instance-row${instance.id === selectedInstanceId ? " is-selected" : ""}`;
    const select = document.createElement("button");
    select.className = "instance-select";
    select.innerHTML = `<strong>${escapeHtml(instance.id)}</strong><small>${instance.parent ? `slot: ${escapeHtml(instance.parent.slot)}` : "root"}</small>`;
    select.addEventListener("click", () => {
      selectedInstanceId = instance.id;
      renderInstances();
    });
    const remove = document.createElement("button");
    remove.className = "delete-mini";
    remove.textContent = "×";
    remove.title = `Delete ${instance.id}`;
    remove.addEventListener("click", () => void deleteInstance(instance.id));
    row.append(select, remove);
    instanceList.append(row);
  }

  const selected = project.manifest.instances.find((item) => item.id === selectedInstanceId && item.objectFile === selectedFile);
  if (!selected) return;
  const definition = definitions.get(selectedFile);
  const properties = Object.entries(definition?.properties ?? {});
  if (!properties.length) {
    instanceProperties.append(emptyInline("This Object Type declares no properties."));
    return;
  }

  const heading = document.createElement("div");
  heading.className = "instance-properties-title";
  heading.innerHTML = `<strong>${escapeHtml(selected.id)}</strong><span>Properties</span>`;
  instanceProperties.append(heading);

  for (const [name, property] of properties) {
    const row = document.createElement("label");
    row.className = "instance-property-row";
    const caption = document.createElement("span");
    caption.textContent = property.label ?? name;
    caption.title = property.description ?? name;
    const hasOverride = Object.prototype.hasOwnProperty.call(selected.props ?? {}, name);
    const input = inputForPort(property, hasOverride ? selected.props?.[name] : property.default ?? defaultValueForType(property.type));
    input.title = property.description ?? `${selected.id}.${name}`;
    input.addEventListener("change", () => void updateInstanceProperty(selected.id, name, property, readPortInput(input, property.type)));
    row.append(caption, input);
    instanceProperties.append(row);
  }
}

async function addInstance(): Promise<void> {
  if (!project || !selectedFile) return;
  const definition = definitions.get(selectedFile);
  const base = instanceIdBase(definition?.name ?? basenameWithoutExtension(selectedFile));
  const used = new Set(project.manifest.instances.map((item) => item.id));
  let index = 1;
  while (used.has(`${base}${index}`)) index++;
  const id = `${base}${index}`;
  project.manifest.instances.push({ id, objectFile: selectedFile });
  selectedInstanceId = id;
  await persistManifest();
  renderAll();
}

async function deleteInstance(instanceId: string): Promise<void> {
  if (!project) return;
  const instance = project.manifest.instances.find((item) => item.id === instanceId);
  if (!instance) return;
  const dependentRules = project.manifest.rules.filter((rule) => ruleReferencesInstance(rule, instanceId));
  const children = project.manifest.instances.filter((item) => item.parent?.instanceId === instanceId);
  const notes = [
    dependentRules.length ? `${dependentRules.length} dependent rule(s) will be removed.` : "",
    children.length ? `${children.length} child instance(s) will become root instances.` : "",
  ].filter(Boolean).join(" ");
  if (!confirm(`Delete instance "${instanceId}"?${notes ? ` ${notes}` : ""}`)) return;

  project.manifest.instances = project.manifest.instances.filter((item) => item.id !== instanceId);
  selectedInstanceId = project.manifest.instances.find((item) => item.objectFile === instance.objectFile)?.id ?? null;
  await persistManifest();
  renderAll();
}

async function updateInstanceProperty(instanceId: string, name: string, property: PortDefinition, value: unknown): Promise<void> {
  if (!project) return;
  const instance = project.manifest.instances.find((item) => item.id === instanceId);
  if (!instance) return;
  instance.props ??= {};
  if (Object.is(value, property.default)) delete instance.props[name];
  else instance.props[name] = value;
  if (!Object.keys(instance.props).length) delete instance.props;
  await persistManifest();
  renderInstances();
}

function ruleReferencesInstance(rule: EventRule, instanceId: string): boolean {
  if (rule.event.instanceId === instanceId) return true;
  if ((rule.conditions ?? []).some((step) => step.condition.instanceId === instanceId || bindingsReferenceInstance(step.inputs, instanceId))) return true;
  return rule.actions.some((step) => step.action.instanceId === instanceId || bindingsReferenceInstance(step.inputs, instanceId));
}

function bindingsReferenceInstance(bindings: Record<string, ValueBinding>, instanceId: string): boolean {
  return Object.values(bindings).some((binding) =>
    (binding.kind === "state" && binding.instanceId === instanceId) ||
    (binding.kind === "expression" && binding.source.includes(`@state.${instanceId}.`))
  );
}

function instanceIdBase(value: string): string {
  const compact = value.replace(/[^A-Za-z0-9_]/g, "") || "object";
  return compact.charAt(0).toLowerCase() + compact.slice(1);
}

function renderSelectedObject(): void {''',
)
replace_once(
    "src/client/main.ts",
    '''function clearWorkspace(): void {
  project = null;
  selectedFile = null;
  definitions.clear();''',
    '''function clearWorkspace(): void {
  project = null;
  selectedFile = null;
  selectedInstanceId = null;
  definitions.clear();''',
)

# Styling for compact instance list + property editor under the Object Type list.
styles = Path("src/client/styles.css")
css = styles.read_text(encoding="utf-8")
css += '''

/* Instance Manager */
.instance-panel { flex: 0 0 auto; max-height: 46%; min-height: 118px; display: flex; flex-direction: column; border-top: 1px solid var(--line); background: #181b22; }
.instance-titlebar { min-height: 39px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line-soft); }
.instance-titlebar strong { display: block; margin-top: 2px; font-size: 10px; }
.instance-list { max-height: 118px; overflow: auto; padding: 5px; border-bottom: 1px solid var(--line-soft); }
.instance-row { min-height: 34px; display: grid; grid-template-columns: minmax(0,1fr) 24px; gap: 4px; align-items: center; border: 1px solid transparent; border-radius: 5px; }
.instance-row:hover { background: #20242c; }
.instance-row.is-selected { border-color: rgba(123,97,255,.38); background: var(--accent-soft); }
.instance-select { min-width: 0; padding: 5px 7px; border: 0; background: transparent; color: var(--text); text-align: left; }
.instance-select strong, .instance-select small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.instance-select strong { font: 10px ui-monospace, monospace; }
.instance-select small { margin-top: 2px; color: var(--muted); font-size: 8px; }
.instance-properties { min-height: 0; overflow: auto; padding: 6px; }
.instance-properties-title { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; color: #929baa; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; }
.instance-properties-title strong { color: #c5ccd7; font: 9px ui-monospace, monospace; text-transform: none; letter-spacing: 0; }
.instance-property-row { display: grid; grid-template-columns: 82px minmax(0,1fr); gap: 5px; align-items: center; min-height: 31px; }
.instance-property-row > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #a2abb8; font-size: 9px; }
.instance-property-row input, .instance-property-row select { width: 100%; min-width: 0; min-height: 26px; padding: 0 6px; border: 1px solid #353b48; border-radius: 4px; background: #11151b; color: var(--text); font-size: 9px; }
'''
styles.write_text(css, encoding="utf-8")

# Static check must cover the new runtime tests.
replace_once(
    "deno.json",
    'tests/expression-runtime.test.ts tests/dom-core.test.ts',
    'tests/expression-runtime.test.ts tests/instance-manager.test.ts tests/dom-core.test.ts',
)

print("Instance Manager UI/server patch applied.")
