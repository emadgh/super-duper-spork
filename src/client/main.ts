import { api } from "./api.ts";
import { CodeEditor } from "./code-editor.ts";
import { evaluateObjectFile } from "./compiler.ts";
import type {
  ActionStep,
  ActionTemplateSummary,
  ConditionStep,
  BlackboardEntry,
  EventEndpoint,
  EventRule,
  LoadedProject,
  ObjectActionDefinition,
  ObjectConditionDefinition,
  ObjectDefinition,
  ObjectEventDefinition,
  PortDefinition,
  PortType,
  PackagePresetSummary,
  ProjectObjectFile,
  ProjectSummary,
  ValueBinding,
} from "./model.ts";
import { EventRuntime, type RuntimeTrace } from "./runtime.ts";

const projectSelect = required<HTMLSelectElement>("#project-select");
const newProjectButton = required<HTMLButtonElement>("#new-project");
const revealProjectButton = required<HTMLButtonElement>("#reveal-project");
const openProjectManagerButton = required<HTMLButtonElement>("#open-project-manager");
const projectManagerDialog = required<HTMLDialogElement>("#project-manager");
const closeProjectManagerButton = required<HTMLButtonElement>("#close-project-manager");
const dialogNewProjectButton = required<HTMLButtonElement>("#dialog-new-project");
const projectGrid = required<HTMLElement>("#project-grid");
const actionLibraryDialog = required<HTMLDialogElement>("#action-library-dialog");
const closeActionLibraryButton = required<HTMLButtonElement>("#close-action-library");
const actionLibraryGrid = required<HTMLElement>("#action-library-grid");
const objectList = required<HTMLElement>("#object-list");
const objectFilter = required<HTMLInputElement>("#object-filter");
const addObjectButton = required<HTMLButtonElement>("#add-object");
const addLibraryActionButton = required<HTMLButtonElement>("#add-library-action");
const addFolderButton = required<HTMLButtonElement>("#add-folder");
const blackboardList = required<HTMLElement>("#blackboard-list");
const addBlackboardButton = required<HTMLButtonElement>("#add-blackboard");
const packageList = required<HTMLElement>("#package-list");
const packagePresetList = required<HTMLElement>("#package-preset-list");
const packagePermissions = required<HTMLElement>("#package-permissions");
const installPackagesButton = required<HTMLButtonElement>("#install-packages");
const editorHost = required<HTMLElement>("#editor-host");
const filenameLabel = required<HTMLElement>("#filename");
const editorStatus = required<HTMLElement>("#editor-status");
const dirtyDot = required<HTMLElement>("#dirty-dot");
const saveButton = required<HTMLButtonElement>("#save-object");
const revealObjectButton = required<HTMLButtonElement>("#reveal-object");
const moveObjectButton = required<HTMLButtonElement>("#move-object");
const eventsSelect = required<HTMLSelectElement>("#event-select");
const conditionsSelect = required<HTMLSelectElement>("#condition-select");
const actionsSelect = required<HTMLSelectElement>("#action-select");
const connectButton = required<HTMLButtonElement>("#connect");
const ruleList = required<HTMLElement>("#rule-list");
const ruleCreate = required<HTMLElement>("#rule-create");
const diagramTools = required<HTMLElement>("#diagram-tools");
const diagramHost = required<HTMLElement>("#diagram");
const diagramRefreshButton = required<HTMLButtonElement>("#diagram-refresh");
const eventEditorView = required<HTMLElement>("#event-editor-view");
const diagramEditorView = required<HTMLElement>("#diagram-editor-view");
const previewHost = required<HTMLElement>("#preview");
const previewPanel = required<HTMLElement>(".preview-panel");
const runButton = required<HTMLButtonElement>("#run");
const buildButton = required<HTMLButtonElement>("#build-project");
const resetButton = required<HTMLButtonElement>("#reset");
const apiSummary = required<HTMLElement>("#api-summary");
const globalStatus = required<HTMLElement>("#global-status");
const projectMeta = required<HTMLElement>("#project-meta");
const traceList = required<HTMLElement>("#trace-list");
const clearTraceButton = required<HTMLButtonElement>("#clear-trace");
const appShell = required<HTMLElement>("#app-shell");

const codeEditor = new CodeEditor();
editorHost.append(codeEditor.element);

let project: LoadedProject | null = null;
let selectedFile: string | null = null;
let dirty = false;
let runtime: EventRuntime | null = null;
let previewFrame: HTMLIFrameElement | null = null;
let definitions = new Map<string, ObjectDefinition>();
let projectSummaries: ProjectSummary[] = [];
let actionTemplates: ActionTemplateSummary[] | null = null;
let packagePresets: PackagePresetSummary[] | null = null;
let traceRows: RuntimeTrace[] = [];
let liveBlackboard: Record<string, BlackboardEntry> | null = null;
let selectedFolder = "";
let logicView: "events" | "diagram" = "events";
const collapsedFolders = new Set<string>();

codeEditor.onChange(() => {
  dirty = true;
  renderEditorStatus();
});
codeEditor.onSave(() => void saveSelectedObject());

saveButton.addEventListener("click", () => void saveSelectedObject());
runButton.addEventListener("click", () => void runProject());
buildButton.addEventListener("click", () => void buildProject());
resetButton.addEventListener("click", () => void runProject());
connectButton.addEventListener("click", () => void addRuleFromToolbar());
projectSelect.addEventListener("change", () => void switchProject(projectSelect.value));
newProjectButton.addEventListener("click", () => void createProject());
revealProjectButton.addEventListener("click", () => void revealProject());
openProjectManagerButton.addEventListener("click", () => {
  renderProjectManager();
  projectManagerDialog.showModal();
});
closeProjectManagerButton.addEventListener("click", () => projectManagerDialog.close());
dialogNewProjectButton.addEventListener("click", () => {
  projectManagerDialog.close();
  void createProject();
});
projectManagerDialog.addEventListener("click", (event) => {
  if (event.target === projectManagerDialog) projectManagerDialog.close();
});
addObjectButton.addEventListener("click", () => void addObject());
addLibraryActionButton.addEventListener("click", () => void openActionLibrary());
closeActionLibraryButton.addEventListener("click", () => actionLibraryDialog.close());
actionLibraryDialog.addEventListener("click", (event) => {
  if (event.target === actionLibraryDialog) actionLibraryDialog.close();
});
addFolderButton.addEventListener("click", () => void addObjectFolder());
revealObjectButton.addEventListener("click", () => void revealSelectedObject());
moveObjectButton.addEventListener("click", () => void moveSelectedObject());
diagramRefreshButton.addEventListener("click", renderDiagram);
addBlackboardButton.addEventListener("click", () => void addBlackboardVariable());
installPackagesButton.addEventListener("click", () => void installProjectPackages());
objectFilter.addEventListener("input", renderObjectList);
clearTraceButton.addEventListener("click", () => {
  traceRows = [];
  liveBlackboard = null;
  renderTrace();
  renderBlackboard();
});

window.addEventListener("message", (event) => {
  const message = event.data as { source?: string; version?: number; type?: string; projectId?: string; trace?: RuntimeTrace; blackboard?: Record<string, BlackboardEntry>; message?: string };
  if (message?.source !== "spork-app" || message.version !== 1 || !project || message.projectId !== project.manifest.id) return;
  if (previewFrame?.contentWindow && event.source !== previewFrame.contentWindow) return;
  if (message.type === "trace" && message.trace) appendTrace(message.trace);
  else if (message.type === "blackboard" && message.blackboard) {
    liveBlackboard = message.blackboard;
    renderBlackboard();
  } else if (message.type === "ready") setGlobalStatus("Runtime running in isolated iframe");
  else if (message.type === "error") setGlobalStatus(message.message ?? "Application runtime error", true);
});

setupNavigatorViews();
setupLogicViews();
setupSplitters();
await refreshProjects();

async function refreshProjects(preferredId?: string): Promise<void> {
  setGlobalStatus("Loading projects…");
  projectSummaries = await api.listProjects();
  projectSelect.replaceChildren();

  for (const item of projectSummaries) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    projectSelect.append(option);
  }

  const id = preferredId ?? project?.manifest.id ?? projectSummaries[0]?.id;
  if (id) {
    projectSelect.value = id;
    await switchProject(id);
  } else {
    clearWorkspace();
  }
  renderProjectManager();
  setGlobalStatus("Ready");
}

function renderProjectManager(): void {
  projectGrid.replaceChildren();
  if (!projectSummaries.length) {
    projectGrid.append(emptyMessage("No projects yet. Create the first project."));
    return;
  }

  for (const item of projectSummaries) {
    const card = document.createElement("article");
    card.className = `project-card${project?.manifest.id === item.id ? " is-current" : ""}`;
    const initial = item.name.trim().slice(0, 1).toUpperCase() || "P";
    card.innerHTML = `
      <span class="project-card-icon">${escapeHtml(initial)}</span>
      <span class="project-card-copy">
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(item.id)}</small>
        <em>${escapeHtml(formatProjectDate(item.updatedAt))}</em>
      </span>
      <span class="project-card-actions"></span>
    `;
    const actions = card.querySelector<HTMLElement>(".project-card-actions");
    if (!actions) continue;
    const reveal = document.createElement("button");
    reveal.className = "project-card-reveal";
    reveal.textContent = "Reveal";
    reveal.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await api.revealProject(item.id);
        setGlobalStatus("Project folder revealed");
      } catch (error) {
        setGlobalStatus(errorMessage(error), true);
      }
    });
    const open = document.createElement("button");
    open.className = "project-card-open";
    open.textContent = project?.manifest.id === item.id ? "Current" : "Open →";
    open.addEventListener("click", () => {
      projectManagerDialog.close();
      projectSelect.value = item.id;
      void switchProject(item.id);
    });
    actions.append(reveal, open);
    card.addEventListener("dblclick", () => {
      projectManagerDialog.close();
      projectSelect.value = item.id;
      void switchProject(item.id);
    });
    projectGrid.append(card);
  }
}

function formatProjectDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

async function switchProject(projectId: string): Promise<void> {
  if (dirty && !confirm("Discard unsaved object changes?")) {
    if (project) projectSelect.value = project.manifest.id;
    return;
  }

  runtime?.dispose();
  runtime = null;
  previewPanel.classList.remove("is-running");
  previewHost.replaceChildren(emptyMessage("Press Run to start the project."));
  traceRows = [];
  renderTrace();

  setGlobalStatus("Opening project…");
  project = await api.loadProject(projectId);
  definitions = compileDefinitions(project.objects);
  selectedFile = project.manifest.objects[0] ?? null;
  selectedFolder = "";
  dirty = false;

  renderAll();
  setGlobalStatus("Ready");
}

function renderAll(): void {
  renderObjectList();
  renderSelectedObject();
  renderBlackboard();
  void renderPackages();
  renderEventOptions();
  renderRules();
  renderDiagram();
  renderProjectMeta();
}

async function renderPackages(): Promise<void> {
  packageList.replaceChildren();
  packagePresetList.replaceChildren();
  packagePermissions.replaceChildren();
  if (!project) return;

  const state = project.packages;
  const permissions = state.effectivePermissions;
  const chips: string[] = [];
  if (permissions.ffi) chips.push("FFI");
  for (const [key, values] of Object.entries(permissions)) {
    if (key === "ffi" || !Array.isArray(values) || values.length === 0) continue;
    chips.push(`${key}: ${values.join(", ")}`);
  }
  packagePermissions.innerHTML = `
    <strong>node_modules: ${escapeHtml(state.manifest.nodeModulesDir)}</strong>
    <small>${chips.length ? `Permissions: ${chips.map(escapeHtml).join(" · ")}` : "No extra runtime permissions"}</small>
  `;

  if (!state.manifest.packages.length) {
    packageList.append(emptyMessage("No project packages. Add a preset below."));
  } else {
    for (const pkg of state.manifest.packages) {
      const row = document.createElement("article");
      row.className = "package-row";
      const nativeNote = pkg.native ? "native" : pkg.role;
      const scripts = pkg.allowScripts?.length ? `scripts: ${pkg.allowScripts.join(", ")}` : "no lifecycle scripts";
      row.innerHTML = `
        <div><strong>${escapeHtml(pkg.alias)}</strong><code>${escapeHtml(pkg.specifier)}</code></div>
        <small>${escapeHtml(nativeNote)} · ${escapeHtml(scripts)}</small>
      `;
      const remove = document.createElement("button");
      remove.className = "text-button danger-text";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => void removeProjectPackage(pkg.id));
      row.append(remove);
      packageList.append(row);
    }
  }

  packagePresets ??= await api.listPackagePresets();
  for (const preset of packagePresets) {
    const installed = preset.packageIds.every((id) => state.manifest.packages.some((pkg) => pkg.id === id));
    const card = document.createElement("button");
    card.className = `package-preset${installed ? " is-installed" : ""}`;
    card.innerHTML = `<strong>${escapeHtml(preset.name)}</strong><small>${escapeHtml(preset.description)}</small><code>${escapeHtml(preset.packageIds.join(" + "))}</code>`;
    card.disabled = installed;
    card.addEventListener("click", () => void addProjectPackagePreset(preset.id));
    packagePresetList.append(card);
  }
}

async function addProjectPackagePreset(presetId: string): Promise<void> {
  if (!project) return;
  try {
    setGlobalStatus("Adding package preset…");
    project = await api.addPackagePreset(project.manifest.id, presetId);
    await renderPackages();
    renderProjectMeta();
    setGlobalStatus("Package preset added — review permissions, then Install");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function removeProjectPackage(packageId: string): Promise<void> {
  if (!project) return;
  try {
    project = await api.removePackage(project.manifest.id, packageId);
    await renderPackages();
    setGlobalStatus("Package removed");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function installProjectPackages(): Promise<void> {
  if (!project) return;
  const packages = project.packages.manifest.packages;
  if (!packages.length) {
    setGlobalStatus("No packages to install", true);
    return;
  }
  const native = packages.filter((pkg) => pkg.native || pkg.allowScripts?.length).map((pkg) => pkg.alias);
  const message = native.length
    ? `Install project packages? Native/lifecycle packages: ${native.join(", ")}. Their declared scripts and permissions will be used.`
    : "Install/sync project packages and lockfile?";
  if (!confirm(message)) return;
  try {
    installPackagesButton.disabled = true;
    setGlobalStatus("Installing project packages…");
    const result = await api.installPackages(project.manifest.id);
    project = await api.loadProject(project.manifest.id);
    await renderPackages();
    console.info(result.output);
    setGlobalStatus("Packages installed and lockfile synchronized");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  } finally {
    installPackagesButton.disabled = false;
  }
}

function compileDefinitions(objects: ProjectObjectFile[]): Map<string, ObjectDefinition> {
  const result = new Map<string, ObjectDefinition>();
  for (const file of objects) {
    try {
      result.set(file.file, evaluateObjectFile(file));
    } catch (error) {
      console.error(error);
      setGlobalStatus(`Could not load ${file.file}`, true);
    }
  }
  return result;
}

function renderObjectList(): void {
  objectList.replaceChildren();
  if (!project) return;
  const query = objectFilter.value.trim().toLowerCase();

  if (query) {
    const matches = project.manifest.objects.filter((file) => {
      const definition = definitions.get(file);
      const name = definition?.name ?? basenameWithoutExtension(file);
      return `${name} ${file}`.toLowerCase().includes(query);
    });
    for (const file of matches) objectList.append(renderObjectTreeFile(file, 0, true));
    if (!matches.length) objectList.append(emptyMessage("No objects match this filter."));
    return;
  }

  const rootRow = document.createElement("button");
  rootRow.className = `folder-item root-folder${selectedFolder === "" ? " is-selected" : ""}`;
  rootRow.style.setProperty("--tree-depth", "0");
  rootRow.innerHTML = `<span class="tree-chevron"></span><span class="folder-glyph">⌂</span><span class="folder-name">Project Objects</span><small>${project.manifest.objects.filter((file) => !objectParentFolder(file)).length}</small>`;
  rootRow.addEventListener("click", () => {
    selectedFolder = "";
    renderObjectList();
  });
  objectList.append(rootRow);

  const folders = new Set(project.manifest.objectFolders);
  for (const file of project.manifest.objects) {
    const parent = objectParentFolder(file);
    if (parent) folders.add(parent);
  }

  renderFolderLevel("", 0, [...folders]);
  const rootFiles = project.manifest.objects.filter((file) => !objectParentFolder(file));
  for (const file of rootFiles) objectList.append(renderObjectTreeFile(file, 0));

  if (!objectList.children.length) objectList.append(emptyMessage("No objects yet. Create a folder or an object."));
}

function renderFolderLevel(parent: string, depth: number, folders: string[]): void {
  if (!project) return;
  const children = folders
    .filter((folder) => objectParentFolder(folder) === parent)
    .sort((a, b) => a.localeCompare(b));

  for (const folder of children) {
    const row = document.createElement("button");
    row.className = `folder-item${selectedFolder === folder ? " is-selected" : ""}`;
    row.style.setProperty("--tree-depth", String(depth));
    const collapsed = collapsedFolders.has(folder);
    row.innerHTML = `
      <span class="tree-chevron">${collapsed ? "›" : "⌄"}</span>
      <span class="folder-glyph">▱</span>
      <span class="folder-name">${escapeHtml(folder.split("/").at(-1) ?? folder)}</span>
      <small>${project.manifest.objects.filter((file) => objectParentFolder(file) === folder).length}</small>
    `;
    row.addEventListener("click", (event) => {
      selectedFolder = folder;
      if ((event.target as HTMLElement).classList.contains("tree-chevron")) {
        if (collapsedFolders.has(folder)) collapsedFolders.delete(folder);
        else collapsedFolders.add(folder);
      }
      renderObjectList();
    });
    objectList.append(row);

    if (collapsed) continue;
    const files = project.manifest.objects
      .filter((file) => objectParentFolder(file) === folder)
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) objectList.append(renderObjectTreeFile(file, depth + 1));
    renderFolderLevel(folder, depth + 1, folders);
  }
}

function renderObjectTreeFile(file: string, depth: number, showPath = false): HTMLElement {
  const definition = definitions.get(file);
  const name = definition?.name ?? basenameWithoutExtension(file);
  const button = document.createElement("button");
  button.className = `object-item${selectedFile === file ? " is-active" : ""}`;
  button.style.setProperty("--tree-depth", String(depth));
  button.innerHTML = `
    <span class="object-icon">${escapeHtml(name.slice(0, 2).toUpperCase())}</span>
    <span class="object-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(showPath ? file : file.split("/").at(-1) ?? file)}</small></span>
  `;
  button.addEventListener("click", () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    selectedFile = file;
    selectedFolder = objectParentFolder(file);
    dirty = false;
    renderObjectList();
    renderSelectedObject();
  });
  return button;
}

function renderSelectedObject(): void {
  if (!project || !selectedFile) {
    filenameLabel.textContent = "No object selected";
    codeEditor.setValue("");
    codeEditor.setReadOnly(true);
    apiSummary.replaceChildren(emptyInline("Create an object to begin."));
    revealObjectButton.disabled = true;
    moveObjectButton.disabled = true;
    return;
  }

  const object = project.objects.find((item) => item.file === selectedFile);
  if (!object) return;

  filenameLabel.textContent = object.file;
  revealObjectButton.disabled = false;
  moveObjectButton.disabled = false;
  codeEditor.setReadOnly(false);
  codeEditor.setValue(object.source);
  dirty = false;
  renderEditorStatus();
  renderApiSummary();
}

function renderEditorStatus(message?: string, isError = false): void {
  editorStatus.textContent = message ?? (dirty ? "Unsaved" : "Saved");
  editorStatus.classList.toggle("is-error", isError);
  dirtyDot.classList.toggle("is-visible", dirty);
}

function renderApiSummary(): void {
  apiSummary.replaceChildren();
  if (!selectedFile) return;
  const definition = definitions.get(selectedFile);
  if (!definition) {
    apiSummary.append(emptyInline("Object definition could not be evaluated."));
    return;
  }

  apiSummary.append(apiGroup("Object", [definition.name]));
  apiSummary.append(apiGroup("Events", Object.keys(definition.events ?? {}), "event"));
  apiSummary.append(apiGroup("Conditions", Object.keys(definition.conditions ?? {}), "condition"));
  apiSummary.append(apiGroup("Actions", Object.keys(definition.actions ?? {}), "action"));
}

async function saveSelectedObject(): Promise<void> {
  if (!project || !selectedFile) return;
  renderEditorStatus("Checking…");
  saveButton.disabled = true;

  try {
    const next = await api.saveObject(project.manifest.id, selectedFile, codeEditor.getValue());
    project = next;
    definitions = compileDefinitions(next.objects);
    dirty = false;
    renderEditorStatus("Saved");
    renderObjectList();
    renderApiSummary();
    renderEventOptions();
    renderRules();
    renderDiagram();
    renderProjectMeta();
  } catch (error) {
    renderEditorStatus(errorMessage(error), true);
    setGlobalStatus("Object has TypeScript errors", true);
  } finally {
    saveButton.disabled = false;
  }
}

function renderEventOptions(): void {
  fillEndpointSelect(eventsSelect, eventCatalog().map((item) => ({
    value: endpointValue(item.endpoint),
    label: `${item.endpoint.instanceId} · ${item.definition.label ?? item.endpoint.name}`,
  })), "No events available");

  conditionsSelect.replaceChildren(option("", "No condition"));
  for (const item of conditionCatalog()) {
    conditionsSelect.append(option(
      endpointValue(item.endpoint),
      `${item.endpoint.instanceId} · ${item.definition.label ?? item.endpoint.name}`,
    ));
  }

  fillEndpointSelect(actionsSelect, actionCatalog().map((item) => ({
    value: endpointValue(item.endpoint),
    label: `${item.endpoint.instanceId} · ${item.definition.label ?? item.endpoint.name}`,
  })), "No actions available");

  connectButton.disabled = !eventsSelect.value || !actionsSelect.value;
}

async function addRuleFromToolbar(): Promise<void> {
  if (!project || !eventsSelect.value || !actionsSelect.value) return;
  const event = parseEndpointValue(eventsSelect.value);
  const action = parseEndpointValue(actionsSelect.value);
  const step = createActionStep(action);
  const conditions = conditionsSelect.value
    ? [createConditionStep(parseEndpointValue(conditionsSelect.value))]
    : undefined;
  project.manifest.rules.push({ id: crypto.randomUUID(), event, ...(conditions ? { conditions } : {}), actions: [step] });
  await persistManifest();
  renderRules();
  renderDiagram();
}

function renderRules(): void {
  ruleList.replaceChildren();
  if (!project) return;

  if (!project.manifest.rules.length) {
    ruleList.append(emptyMessage("No event rules yet. Choose an event and an action above, then add the first rule."));
    return;
  }

  project.manifest.rules.forEach((rule, index) => ruleList.append(renderRuleCard(rule, index)));
}

function renderRuleCard(rule: EventRule, index: number): HTMLElement {
  const card = document.createElement("article");
  card.className = "rule-card";

  const head = document.createElement("div");
  head.className = "rule-event-row";
  head.innerHTML = `
    <span class="rule-index">${index + 1}</span>
    <span class="endpoint-chip">EVENT&nbsp; ${escapeHtml(rule.event.instanceId)}.${escapeHtml(rule.event.name)}</span>
    <span class="rule-spacer"></span>
  `;
  const deleteRule = document.createElement("button");
  deleteRule.className = "text-button danger";
  deleteRule.textContent = "Delete rule";
  deleteRule.addEventListener("click", () => void removeRule(rule.id));
  head.append(deleteRule);

  const conditionsHost = document.createElement("div");
  conditionsHost.className = "rule-conditions";
  (rule.conditions ?? []).forEach((step, stepIndex) => conditionsHost.append(renderConditionStep(rule, step, stepIndex)));

  const addConditionRow = document.createElement("div");
  addConditionRow.className = "rule-add-condition";
  const conditionSelect = document.createElement("select");
  fillEndpointSelect(conditionSelect, conditionCatalog().map((item) => ({
    value: endpointValue(item.endpoint),
    label: `${item.endpoint.instanceId} · ${item.definition.label ?? item.endpoint.name}`,
  })), "No conditions available");
  const addCondition = document.createElement("button");
  addCondition.className = "mini-button";
  addCondition.textContent = "+ Add condition";
  addCondition.disabled = !conditionSelect.value;
  addCondition.addEventListener("click", () => {
    if (!conditionSelect.value) return;
    rule.conditions ??= [];
    rule.conditions.push(createConditionStep(parseEndpointValue(conditionSelect.value)));
    void persistManifest().then(renderRules);
  });
  addConditionRow.append(conditionSelect, addCondition);
  conditionsHost.append(addConditionRow);

  const actionsHost = document.createElement("div");
  actionsHost.className = "rule-actions";
  rule.actions.forEach((step, stepIndex) => actionsHost.append(renderActionStep(rule, step, stepIndex)));

  const addRow = document.createElement("div");
  addRow.className = "rule-add-action";
  const select = document.createElement("select");
  fillEndpointSelect(select, actionCatalog().map((item) => ({
    value: endpointValue(item.endpoint),
    label: `${item.endpoint.instanceId} · ${item.definition.label ?? item.endpoint.name}`,
  })), "No actions available");
  const add = document.createElement("button");
  add.className = "mini-button";
  add.textContent = "+ Add action";
  add.disabled = !select.value;
  add.addEventListener("click", () => {
    if (!select.value) return;
    rule.actions.push(createActionStep(parseEndpointValue(select.value)));
    void persistManifest().then(renderRules);
  });
  addRow.append(select, add);
  actionsHost.append(addRow);

  card.append(head, conditionsHost, actionsHost);
  return card;
}

function renderConditionStep(rule: EventRule, step: ConditionStep, stepIndex: number): HTMLElement {
  const container = document.createElement("section");
  container.className = "condition-step";
  const condition = getConditionDefinition(step.condition);

  const head = document.createElement("div");
  head.className = "action-head";
  head.innerHTML = `
    <span class="step-number">C${String(stepIndex + 1).padStart(2, "0")}</span>
    <span class="endpoint-chip condition-endpoint">CONDITION&nbsp; ${escapeHtml(step.condition.instanceId)}.${escapeHtml(step.condition.name)}</span>
    <span class="rule-spacer"></span>
  `;
  const remove = document.createElement("button");
  remove.className = "text-button danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    rule.conditions = (rule.conditions ?? []).filter((item) => item.id !== step.id);
    void persistManifest().then(renderRules);
  });
  head.append(remove);

  const ports = document.createElement("div");
  ports.className = "condition-ports";
  const inputEntries = Object.entries(condition?.inputs ?? {});
  if (!inputEntries.length) ports.append(emptyInline("No input ports"));
  for (const [name, port] of inputEntries) ports.append(renderConditionInputPort(rule, step, name, port));

  container.append(head, ports);
  return container;
}

function renderConditionInputPort(rule: EventRule, step: ConditionStep, name: string, port: PortDefinition): HTMLElement {
  const row = document.createElement("div");
  row.className = "port-row";
  row.innerHTML = `<div class="port-name"><span class="port-dot ${port.type}"></span>${escapeHtml(port.label ?? name)}</div>`;

  const editor = document.createElement("div");
  editor.className = "binding-editor";
  const kind = document.createElement("select");
  const kinds: Array<{ value: Exclude<ValueBinding["kind"], "output">; label: string }> = [
    { value: "literal", label: "Value" },
    { value: "blackboard", label: "Blackboard" },
    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
  ];
  for (const item of kinds) kind.append(option(item.value, item.label));

  let binding = step.inputs[name] ?? defaultBinding(port);
  if (binding.kind === "output") binding = defaultBinding(port);
  step.inputs[name] = binding;
  kind.value = binding.kind;

  const valueHost = document.createElement("span");
  valueHost.style.minWidth = "0";
  const applyEditor = () => renderConditionBindingValueEditor(valueHost, rule, port, binding, (next) => {
    binding = next;
    step.inputs[name] = next;
    void persistManifest();
  });
  applyEditor();

  kind.addEventListener("change", () => {
    binding = bindingForConditionKind(kind.value as Exclude<ValueBinding["kind"], "output">, port, rule);
    step.inputs[name] = binding;
    applyEditor();
    void persistManifest();
  });

  editor.append(kind, valueHost);
  row.append(editor);
  return row;
}

function renderConditionBindingValueEditor(
  host: HTMLElement,
  rule: EventRule,
  port: PortDefinition,
  binding: Exclude<ValueBinding, { kind: "output" }>,
  onChange: (binding: Exclude<ValueBinding, { kind: "output" }>) => void,
): void {
  host.replaceChildren();
  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  const select = document.createElement("select");
  if (binding.kind === "blackboard") {
    for (const key of matchingBlackboardKeys(port.type)) select.append(option(key, key));
    select.value = binding.key;
    select.addEventListener("change", () => onChange({ kind: "blackboard", key: select.value }));
  } else if (binding.kind === "state") {
    for (const value of stateBindingOptions(port.type)) select.append(option(`${value.instanceId}|${value.path}`, `${value.instanceId}.${value.path}`));
    select.value = `${binding.instanceId}|${binding.path}`;
    select.addEventListener("change", () => {
      const [instanceId, path] = select.value.split("|");
      onChange({ kind: "state", instanceId, path });
    });
  } else if (binding.kind === "event") {
    const outputs = Object.entries(getEventDefinition(rule.event)?.outputs ?? {}).filter(([, item]) => portTypesCompatible(port.type, item.type));
    if (!outputs.length) select.append(option("", "payload"));
    for (const [name] of outputs) select.append(option(name, name));
    select.value = binding.path;
    select.addEventListener("change", () => onChange({ kind: "event", path: select.value }));
  }
  if (!select.options.length) select.append(option("", "No compatible source"));
  host.append(select);
}

function renderActionStep(rule: EventRule, step: ActionStep, stepIndex: number): HTMLElement {
  const container = document.createElement("section");
  container.className = "action-step";
  const action = getActionDefinition(step.action);

  const head = document.createElement("div");
  head.className = "action-head";
  head.innerHTML = `
    <span class="step-number">${String(stepIndex + 1).padStart(2, "0")}</span>
    <span class="endpoint-chip action-endpoint">ACTION&nbsp; ${escapeHtml(step.action.instanceId)}.${escapeHtml(step.action.name)}</span>
    <span class="rule-spacer"></span>
  `;
  const remove = document.createElement("button");
  remove.className = "text-button danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    rule.actions = rule.actions.filter((item) => item.id !== step.id);
    void persistManifest().then(renderRules);
  });
  head.append(remove);

  const ports = document.createElement("div");
  ports.className = "action-ports";
  const inputs = document.createElement("div");
  inputs.className = "port-column";
  inputs.innerHTML = `<div class="port-column-title">Inputs</div>`;
  const outputs = document.createElement("div");
  outputs.className = "port-column";
  outputs.innerHTML = `<div class="port-column-title">Outputs</div>`;

  const inputEntries = Object.entries(action?.inputs ?? {});
  if (!inputEntries.length) inputs.append(emptyInline("No input ports"));
  for (const [name, port] of inputEntries) inputs.append(renderInputPort(rule, step, name, port));

  const outputEntries = Object.entries(action?.outputs ?? {});
  if (!outputEntries.length) outputs.append(emptyInline("No output ports"));
  for (const [name, port] of outputEntries) outputs.append(renderOutputPort(step, name, port));

  ports.append(inputs, outputs);
  container.append(head, ports);
  return container;
}

function renderInputPort(rule: EventRule, step: ActionStep, name: string, port: PortDefinition): HTMLElement {
  const row = document.createElement("div");
  row.className = "port-row";
  row.innerHTML = `<div class="port-name"><span class="port-dot ${port.type}"></span>${escapeHtml(port.label ?? name)}</div>`;

  const editor = document.createElement("div");
  editor.className = "binding-editor";
  const kind = document.createElement("select");
  const kinds: Array<{ value: ValueBinding["kind"]; label: string }> = [
    { value: "literal", label: "Value" },
    { value: "blackboard", label: "Blackboard" },
    { value: "state", label: "Object state" },
    { value: "event", label: "Event output" },
    { value: "output", label: "Action output" },
  ];
  for (const item of kinds) kind.append(option(item.value, item.label));

  let binding = step.inputs[name] ?? defaultBinding(port);
  step.inputs[name] = binding;
  kind.value = binding.kind;

  const valueHost = document.createElement("span");
  valueHost.style.minWidth = "0";
  renderBindingValueEditor(valueHost, rule, step, port, binding, (next) => {
    step.inputs[name] = next;
    void persistManifest();
  });

  kind.addEventListener("change", () => {
    binding = bindingForKind(kind.value as ValueBinding["kind"], port, rule, step);
    step.inputs[name] = binding;
    renderBindingValueEditor(valueHost, rule, step, port, binding, (next) => {
      step.inputs[name] = next;
      void persistManifest();
    });
    void persistManifest();
  });

  editor.append(kind, valueHost);
  row.append(editor);
  return row;
}

function renderBindingValueEditor(
  host: HTMLElement,
  rule: EventRule,
  step: ActionStep,
  port: PortDefinition,
  binding: ValueBinding,
  onChange: (binding: ValueBinding) => void,
): void {
  host.replaceChildren();

  if (binding.kind === "literal") {
    const input = inputForPort(port, binding.value);
    input.addEventListener("change", () => onChange({ kind: "literal", value: readPortInput(input, port.type) }));
    host.append(input);
    return;
  }

  const select = document.createElement("select");

  if (binding.kind === "blackboard") {
    const keys = matchingBlackboardKeys(port.type);
    for (const key of keys) select.append(option(key, key));
    select.value = binding.key;
    select.addEventListener("change", () => onChange({ kind: "blackboard", key: select.value }));
  }

  if (binding.kind === "state") {
    const values = stateBindingOptions(port.type);
    for (const value of values) select.append(option(`${value.instanceId}|${value.path}`, `${value.instanceId}.${value.path}`));
    select.value = `${binding.instanceId}|${binding.path}`;
    select.addEventListener("change", () => {
      const [instanceId, path] = select.value.split("|");
      onChange({ kind: "state", instanceId, path });
    });
  }

  if (binding.kind === "event") {
    const event = getEventDefinition(rule.event);
    const outputs = Object.entries(event?.outputs ?? {}).filter(([, item]) => portTypesCompatible(port.type, item.type));
    if (!outputs.length) select.append(option("", "payload"));
    for (const [name] of outputs) select.append(option(name, name));
    select.value = binding.path;
    select.addEventListener("change", () => onChange({ kind: "event", path: select.value }));
  }

  if (binding.kind === "output") {
    const candidates = previousOutputOptions(rule, step, port.type);
    for (const item of candidates) select.append(option(`${item.stepId}|${item.name}`, item.label));
    select.value = `${binding.stepId}|${binding.name}`;
    select.addEventListener("change", () => {
      const [stepId, name] = select.value.split("|");
      onChange({ kind: "output", stepId, name });
    });
  }

  if (!select.options.length) select.append(option("", "No compatible source"));
  host.append(select);
}

function renderOutputPort(step: ActionStep, name: string, port: PortDefinition): HTMLElement {
  const row = document.createElement("div");
  row.className = "port-row";
  row.innerHTML = `<div class="port-name"><span class="port-dot ${port.type}"></span>${escapeHtml(port.label ?? name)}</div>`;

  const select = document.createElement("select");
  select.className = "output-target";
  select.append(option("", "Available to next action"));
  for (const key of matchingBlackboardKeys(port.type)) select.append(option(key, `Write → ${key}`));
  select.value = step.outputs[name]?.blackboardKey ?? "";
  select.addEventListener("change", () => {
    step.outputs[name] = select.value ? { blackboardKey: select.value } : {};
    void persistManifest();
  });
  row.append(select);
  return row;
}

function renderBlackboard(): void {
  blackboardList.replaceChildren();
  if (!project) return;
  const entries = Object.entries(project.manifest.blackboard);
  if (!entries.length) {
    blackboardList.append(emptyMessage("No project variables yet."));
    return;
  }

  for (const [key, entry] of entries) {
    const row = document.createElement("div");
    row.className = "blackboard-row";

    const nameInput = document.createElement("input");
    nameInput.value = key;
    nameInput.addEventListener("change", () => void renameBlackboardKey(key, nameInput.value));

    const type = document.createElement("select");
    for (const value of ["number", "string", "boolean", "any"] as PortType[]) type.append(option(value, value));
    type.value = entry.type;
    type.addEventListener("change", () => {
      entry.type = type.value as PortType;
      entry.value = coerceValue(entry.value, entry.type);
      renderBlackboard();
      void persistManifest();
    });

    const valueInput = inputForPort({ type: entry.type }, entry.value);
    valueInput.title = "Project default value";
    valueInput.addEventListener("change", () => {
      entry.value = readPortInput(valueInput, entry.type);
      void persistManifest();
    });

    const liveValue = document.createElement("span");
    liveValue.className = "blackboard-live-value";
    const runtimeEntry = liveBlackboard?.[key];
    liveValue.textContent = runtimeEntry ? formatPrimitive(runtimeEntry.value) : "—";
    liveValue.title = runtimeEntry ? "Current runtime value" : "Run the project to inspect the runtime value";

    const remove = document.createElement("button");
    remove.className = "delete-mini";
    remove.textContent = "×";
    remove.title = "Delete variable";
    remove.addEventListener("click", () => void deleteBlackboardKey(key));

    row.append(nameInput, type, valueInput, liveValue, remove);
    blackboardList.append(row);
  }
}

async function addBlackboardVariable(): Promise<void> {
  if (!project) return;
  const raw = prompt("Blackboard variable name", "value")?.trim();
  if (!raw) return;
  const key = safeVariableName(raw);
  if (!key) return;
  if (project.manifest.blackboard[key]) {
    alert("A blackboard variable with this name already exists.");
    return;
  }
  project.manifest.blackboard[key] = { type: "number", value: 0 };
  await persistManifest();
  renderBlackboard();
  renderRules();
}

async function renameBlackboardKey(oldKey: string, rawNewKey: string): Promise<void> {
  if (!project) return;
  const newKey = safeVariableName(rawNewKey);
  if (!newKey || newKey === oldKey) {
    renderBlackboard();
    return;
  }
  if (project.manifest.blackboard[newKey]) {
    alert("A blackboard variable with this name already exists.");
    renderBlackboard();
    return;
  }

  project.manifest.blackboard[newKey] = project.manifest.blackboard[oldKey];
  delete project.manifest.blackboard[oldKey];
  for (const rule of project.manifest.rules) {
    for (const step of rule.conditions ?? []) {
      for (const [name, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "blackboard" && binding.key === oldKey) step.inputs[name] = { kind: "blackboard", key: newKey };
      }
    }
    for (const step of rule.actions) {
      for (const [name, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "blackboard" && binding.key === oldKey) step.inputs[name] = { kind: "blackboard", key: newKey };
      }
      for (const output of Object.values(step.outputs)) if (output.blackboardKey === oldKey) output.blackboardKey = newKey;
    }
  }
  await persistManifest();
  renderBlackboard();
  renderRules();
}

async function deleteBlackboardKey(key: string): Promise<void> {
  if (!project || !confirm(`Delete blackboard variable "${key}"?`)) return;
  delete project.manifest.blackboard[key];
  for (const rule of project.manifest.rules) {
    for (const step of rule.conditions ?? []) {
      for (const [name, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "blackboard" && binding.key === key) step.inputs[name] = { kind: "literal", value: 0 };
      }
    }
    for (const step of rule.actions) {
      for (const [name, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "blackboard" && binding.key === key) step.inputs[name] = { kind: "literal", value: 0 };
      }
      for (const output of Object.values(step.outputs)) if (output.blackboardKey === key) delete output.blackboardKey;
    }
  }
  await persistManifest();
  renderBlackboard();
  renderRules();
}

async function removeRule(ruleId: string): Promise<void> {
  if (!project) return;
  project.manifest.rules = project.manifest.rules.filter((item) => item.id !== ruleId);
  await persistManifest();
  renderRules();
}

async function persistManifest(): Promise<void> {
  if (!project) return;
  try {
    const updated = await api.saveManifest(project.manifest.id, project.manifest);
    project.manifest = updated.manifest;
    renderProjectMeta();
    renderDiagram();
    setGlobalStatus("Saved");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function runProject(): Promise<void> {
  if (!project) return;
  if (dirty) {
    await saveSelectedObject();
    if (dirty) return;
  }

  runtime?.dispose();
  runtime = null;
  traceRows = [];
  liveBlackboard = null;
  renderTrace();
  renderBlackboard();

  try {
    runButton.disabled = true;
    setGlobalStatus("Building and starting isolated application host…");
    const launched = await api.runProject(project.manifest.id);
    const iframe = document.createElement("iframe");
    iframe.className = "app-preview-frame";
    iframe.title = `${project.manifest.name} preview`;
    iframe.sandbox.add("allow-scripts", "allow-same-origin", "allow-forms", "allow-modals", "allow-popups");
    iframe.src = `${launched.url}?studio=${Date.now()}`;
    previewFrame = iframe;
    previewHost.replaceChildren(iframe);
    previewPanel.classList.add("is-running");
    setGlobalStatus(`Application host running on port ${launched.port}`);
  } catch (error) {
    previewFrame = null;
    setGlobalStatus(errorMessage(error), true);
  } finally {
    runButton.disabled = false;
  }
}

async function buildProject(): Promise<void> {
  if (!project) return;
  if (dirty) {
    await saveSelectedObject();
    if (dirty) return;
  }
  try {
    buildButton.disabled = true;
    setGlobalStatus("Building standalone application…");
    const result = await api.buildProject(project.manifest.id);
    setGlobalStatus(`Standalone build ready: ${result.output}`);
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  } finally {
    buildButton.disabled = false;
  }
}

function appendTrace(trace: RuntimeTrace): void {
  traceRows.push(trace);
  if (traceRows.length > 80) traceRows.shift();
  renderTrace();
  traceList.scrollTop = traceList.scrollHeight;
}

function renderTrace(): void {
  traceList.replaceChildren();
  if (!traceRows.length) {
    traceList.append(emptyInline("Run the project to inspect events, conditions and actions."));
    return;
  }
  for (const trace of traceRows) {
    const row = document.createElement("div");
    row.className = `trace-row ${trace.kind}`;
    row.innerHTML = `<span class="trace-kind">${escapeHtml(trace.kind)}</span><span>${escapeHtml(trace.label)}${trace.detail ? ` <em>${escapeHtml(trace.detail)}</em>` : ""}</span>`;
    traceList.append(row);
  }
}

async function createProject(): Promise<void> {
  const name = prompt("Project name", "Untitled Project")?.trim();
  if (!name) return;
  try {
    const created = await api.createProject(name);
    await refreshProjects(created.manifest.id);
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}


async function openActionLibrary(): Promise<void> {
  if (!project) return;
  try {
    actionTemplates ??= await api.listActionTemplates();
    renderActionLibrary();
    actionLibraryDialog.showModal();
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

function renderActionLibrary(): void {
  actionLibraryGrid.replaceChildren();
  for (const template of actionTemplates ?? []) {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <span class="project-card-icon">⚡</span>
      <span class="project-card-copy">
        <strong>${escapeHtml(template.name)}</strong>
        <small>${escapeHtml(template.description)}</small>
        <em>${escapeHtml(template.category)} · ${escapeHtml(template.defaultFile)}</em>
      </span>
      <span class="project-card-actions"></span>
    `;
    const actions = card.querySelector<HTMLElement>(".project-card-actions");
    const add = document.createElement("button");
    add.className = "project-card-open";
    add.textContent = "Add →";
    add.addEventListener("click", () => void addReadyAction(template));
    actions?.append(add);
    actionLibraryGrid.append(card);
  }
  if (!actionLibraryGrid.children.length) actionLibraryGrid.append(emptyMessage("No ready actions are installed."));
}

async function addReadyAction(template: ActionTemplateSummary): Promise<void> {
  if (!project) return;
  try {
    const updated = await api.addActionTemplate(project.manifest.id, template.id, selectedFolder);
    project = updated;
    definitions = compileDefinitions(updated.objects);
    selectedFile = updated.manifest.objects.at(-1) ?? null;
    if (selectedFile) selectedFolder = objectParentFolder(selectedFile);
    dirty = false;
    actionLibraryDialog.close();
    renderAll();
    setGlobalStatus(`${template.name} added`);
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function addObject(): Promise<void> {
  if (!project) return;
  const name = prompt("Object name", "CustomObject")?.trim();
  if (!name) return;
  try {
    const updated = await api.addObject(project.manifest.id, name, selectedFolder);
    project = updated;
    definitions = compileDefinitions(updated.objects);
    selectedFile = updated.manifest.objects.at(-1) ?? null;
    if (selectedFile) selectedFolder = objectParentFolder(selectedFile);
    dirty = false;
    renderAll();
    codeEditor.focus();
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function addObjectFolder(): Promise<void> {
  if (!project) return;
  const name = prompt(selectedFolder ? `New folder inside ${selectedFolder}` : "New object folder", "Components")?.trim();
  if (!name) return;
  try {
    const updated = await api.addObjectFolder(project.manifest.id, name, selectedFolder);
    project = updated;
    definitions = compileDefinitions(updated.objects);
    const created = updated.manifest.objectFolders
      .filter((folder) => objectParentFolder(folder) === selectedFolder)
      .sort((a, b) => a.localeCompare(b))
      .at(-1);
    if (created) selectedFolder = created;
    renderAll();
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function moveSelectedObject(): Promise<void> {
  if (!project || !selectedFile) return;
  const choices = ["(root)", ...project.manifest.objectFolders];
  const current = objectParentFolder(selectedFile);
  const raw = prompt(`Move ${selectedFile.split("/").at(-1)} to folder:\n\n${choices.join("\n")}`, current || "(root)");
  if (raw === null) return;
  const folder = raw.trim() === "(root)" ? "" : raw.trim();
  if (folder && !project.manifest.objectFolders.includes(folder)) {
    alert("Choose an existing folder from the list.");
    return;
  }
  try {
    const previousFile = selectedFile;
    const updated = await api.moveObject(project.manifest.id, previousFile, folder);
    project = updated;
    definitions = compileDefinitions(updated.objects);
    const basename = previousFile.split("/").at(-1) ?? previousFile;
    selectedFile = updated.manifest.objects.find((file) => file === (folder ? `${folder}/${basename}` : basename)) ?? null;
    selectedFolder = folder;
    dirty = false;
    renderAll();
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function revealProject(): Promise<void> {
  if (!project) return;
  try {
    await api.revealProject(project.manifest.id);
    setGlobalStatus("Project folder revealed");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

async function revealSelectedObject(): Promise<void> {
  if (!project || !selectedFile) return;
  try {
    await api.revealObject(project.manifest.id, selectedFile);
    setGlobalStatus("Object revealed in folder");
  } catch (error) {
    setGlobalStatus(errorMessage(error), true);
  }
}

function eventCatalog(): Array<{ endpoint: EventEndpoint; definition: ObjectEventDefinition }> {
  if (!project) return [];
  const result: Array<{ endpoint: EventEndpoint; definition: ObjectEventDefinition }> = [];
  for (const instance of project.manifest.instances) {
    const definition = definitions.get(instance.objectFile);
    for (const [name, event] of Object.entries(definition?.events ?? {})) {
      result.push({ endpoint: { instanceId: instance.id, name }, definition: event });
    }
  }
  return result;
}

function conditionCatalog(): Array<{ endpoint: EventEndpoint; definition: ObjectConditionDefinition }> {
  if (!project) return [];
  const result: Array<{ endpoint: EventEndpoint; definition: ObjectConditionDefinition }> = [];
  for (const instance of project.manifest.instances) {
    const definition = definitions.get(instance.objectFile);
    for (const [name, condition] of Object.entries(definition?.conditions ?? {})) {
      result.push({ endpoint: { instanceId: instance.id, name }, definition: condition });
    }
  }
  return result;
}

function actionCatalog(): Array<{ endpoint: EventEndpoint; definition: ObjectActionDefinition }> {
  if (!project) return [];
  const result: Array<{ endpoint: EventEndpoint; definition: ObjectActionDefinition }> = [];
  for (const instance of project.manifest.instances) {
    const definition = definitions.get(instance.objectFile);
    for (const [name, action] of Object.entries(definition?.actions ?? {})) {
      result.push({ endpoint: { instanceId: instance.id, name }, definition: action });
    }
  }
  return result;
}

function getDefinitionForInstance(instanceId: string): ObjectDefinition | undefined {
  const instance = project?.manifest.instances.find((item) => item.id === instanceId);
  return instance ? definitions.get(instance.objectFile) : undefined;
}

function getEventDefinition(endpoint: EventEndpoint): ObjectEventDefinition | undefined {
  return getDefinitionForInstance(endpoint.instanceId)?.events?.[endpoint.name];
}

function getConditionDefinition(endpoint: EventEndpoint): ObjectConditionDefinition | undefined {
  return getDefinitionForInstance(endpoint.instanceId)?.conditions?.[endpoint.name];
}

function getActionDefinition(endpoint: EventEndpoint): ObjectActionDefinition | undefined {
  return getDefinitionForInstance(endpoint.instanceId)?.actions?.[endpoint.name];
}

function createConditionStep(endpoint: EventEndpoint): ConditionStep {
  const condition = getConditionDefinition(endpoint);
  const inputs: Record<string, ValueBinding> = {};
  for (const [name, port] of Object.entries(condition?.inputs ?? {})) inputs[name] = defaultBinding(port);
  return { id: crypto.randomUUID(), condition: endpoint, inputs };
}

function createActionStep(endpoint: EventEndpoint): ActionStep {
  const action = getActionDefinition(endpoint);
  const inputs: Record<string, ValueBinding> = {};
  for (const [name, port] of Object.entries(action?.inputs ?? {})) inputs[name] = defaultBinding(port);
  const outputs = Object.fromEntries(Object.keys(action?.outputs ?? {}).map((name) => [name, {}]));
  return { id: crypto.randomUUID(), action: endpoint, inputs, outputs };
}

function defaultBinding(port: PortDefinition): ValueBinding {
  return { kind: "literal", value: port.default ?? defaultValueForType(port.type) };
}

function bindingForKind(kind: ValueBinding["kind"], port: PortDefinition, rule: EventRule, step: ActionStep): ValueBinding {
  if (kind === "literal") return defaultBinding(port);
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };
  if (kind === "state") {
    const first = stateBindingOptions(port.type)[0];
    return { kind, instanceId: first?.instanceId ?? "", path: first?.path ?? "" };
  }
  if (kind === "event") {
    const outputs = Object.entries(getEventDefinition(rule.event)?.outputs ?? {}).filter(([, def]) => portTypesCompatible(port.type, def.type));
    return { kind, path: outputs[0]?.[0] ?? "" };
  }
  const first = previousOutputOptions(rule, step, port.type)[0];
  return { kind: "output", stepId: first?.stepId ?? "", name: first?.name ?? "" };
}

function bindingForConditionKind(
  kind: Exclude<ValueBinding["kind"], "output">,
  port: PortDefinition,
  rule: EventRule,
): Exclude<ValueBinding, { kind: "output" }> {
  if (kind === "literal") return defaultBinding(port) as Exclude<ValueBinding, { kind: "output" }>;
  if (kind === "blackboard") return { kind, key: matchingBlackboardKeys(port.type)[0] ?? "" };
  if (kind === "state") {
    const first = stateBindingOptions(port.type)[0];
    return { kind, instanceId: first?.instanceId ?? "", path: first?.path ?? "" };
  }
  const outputs = Object.entries(getEventDefinition(rule.event)?.outputs ?? {}).filter(([, def]) => portTypesCompatible(port.type, def.type));
  return { kind: "event", path: outputs[0]?.[0] ?? "" };
}

function matchingBlackboardKeys(type: PortType): string[] {
  if (!project) return [];
  return Object.entries(project.manifest.blackboard)
    .filter(([, entry]) => portTypesCompatible(type, entry.type))
    .map(([key]) => key);
}

function stateBindingOptions(type: PortType): Array<{ instanceId: string; path: string }> {
  if (!project) return [];
  const result: Array<{ instanceId: string; path: string }> = [];
  for (const instance of project.manifest.instances) {
    const state = definitions.get(instance.objectFile)?.state ?? {};
    for (const [path, value] of Object.entries(state)) {
      if (portTypesCompatible(type, typeOfValue(value))) result.push({ instanceId: instance.id, path });
    }
  }
  return result;
}

function previousOutputOptions(rule: EventRule, step: ActionStep, type: PortType): Array<{ stepId: string; name: string; label: string }> {
  const index = rule.actions.findIndex((item) => item.id === step.id);
  const result: Array<{ stepId: string; name: string; label: string }> = [];
  for (const previous of rule.actions.slice(0, Math.max(0, index))) {
    const action = getActionDefinition(previous.action);
    for (const [name, port] of Object.entries(action?.outputs ?? {})) {
      if (!portTypesCompatible(type, port.type)) continue;
      result.push({ stepId: previous.id, name, label: `${previous.action.instanceId}.${previous.action.name} → ${name}` });
    }
  }
  return result;
}

function inputForPort(port: Pick<PortDefinition, "type">, value: unknown): HTMLInputElement | HTMLSelectElement {
  if (port.type === "boolean") {
    const select = document.createElement("select");
    select.append(option("true", "true"), option("false", "false"));
    select.value = String(Boolean(value));
    return select;
  }
  const input = document.createElement("input");
  input.type = port.type === "number" ? "number" : "text";
  input.value = value === undefined || value === null ? "" : String(value);
  if (port.type === "number") input.step = "any";
  return input;
}

function readPortInput(input: HTMLInputElement | HTMLSelectElement, type: PortType): unknown {
  if (type === "number") return Number(input.value || 0);
  if (type === "boolean") return input.value === "true";
  return input.value;
}

function portTypesCompatible(target: PortType, source: PortType): boolean {
  return target === "any" || source === "any" || target === source;
}

function typeOfValue(value: unknown): PortType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "any";
}

function defaultValueForType(type: PortType): unknown {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  return "";
}

function coerceValue(value: unknown, type: PortType): unknown {
  if (type === "number") return Number(value || 0);
  if (type === "boolean") return Boolean(value);
  if (type === "string") return String(value ?? "");
  return value;
}

interface DiagramNode {
  id: string;
  type: "event" | "condition" | "action" | "blackboard";
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  inputs: string[];
  outputs: string[];
}

interface DiagramEdge {
  from: string;
  to: string;
  kind: "flow" | "data" | "blackboard";
  label?: string;
}

function setupLogicViews(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".logic-view-tab"));
  const apply = () => {
    buttons.forEach((button) => button.classList.toggle("is-active", button.dataset.logicView === logicView));
    eventEditorView.classList.toggle("is-active", logicView === "events");
    diagramEditorView.classList.toggle("is-active", logicView === "diagram");
    ruleCreate.hidden = logicView !== "events";
    diagramTools.hidden = logicView !== "diagram";
    if (logicView === "diagram") requestAnimationFrame(renderDiagram);
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      logicView = button.dataset.logicView === "diagram" ? "diagram" : "events";
      apply();
    });
  }
  apply();
}

function renderDiagram(): void {
  diagramHost.replaceChildren();
  if (!project) return;
  if (!project.manifest.rules.length) {
    diagramHost.append(emptyMessage("No connections to visualize yet."));
    return;
  }

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const boardNodeIds = new Map<string, string>();
  let maxX = 0;
  let maxY = 0;

  project.manifest.rules.forEach((rule, ruleIndex) => {
    const rowY = 36 + ruleIndex * 230;
    const eventDefinition = getEventDefinition(rule.event);
    const eventId = `event:${rule.id}`;
    nodes.push({
      id: eventId,
      type: "event",
      x: 32,
      y: rowY,
      width: 230,
      height: 92,
      title: `${rule.event.instanceId}.${rule.event.name}`,
      subtitle: eventDefinition?.label ?? "Event",
      inputs: [],
      outputs: Object.keys(eventDefinition?.outputs ?? {}),
    });

    let previousNodeId = eventId;
    const conditions = rule.conditions ?? [];
    conditions.forEach((step, stepIndex) => {
      const condition = getConditionDefinition(step.condition);
      const nodeId = `condition:${step.id}`;
      const x = 330 + stepIndex * 310;
      const portRows = Math.max(Object.keys(condition?.inputs ?? {}).length, 1);
      nodes.push({
        id: nodeId,
        type: "condition",
        x,
        y: rowY,
        width: 250,
        height: 86 + Math.min(portRows, 5) * 20,
        title: `${step.condition.instanceId}.${step.condition.name}`,
        subtitle: condition?.label ?? "Condition",
        inputs: Object.keys(condition?.inputs ?? {}),
        outputs: [],
      });
      edges.push({ from: previousNodeId, to: nodeId, kind: "flow" });
      previousNodeId = nodeId;
      for (const [inputName, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "event") {
          edges.push({ from: eventId, to: nodeId, kind: "data", label: binding.path ? `${binding.path} → ${inputName}` : inputName });
        }
      }
    });

    const conditionCount = conditions.length;
    rule.actions.forEach((step, stepIndex) => {
      const action = getActionDefinition(step.action);
      const nodeId = `action:${step.id}`;
      const x = 330 + (conditionCount + stepIndex) * 310;
      const portRows = Math.max(Object.keys(action?.inputs ?? {}).length, Object.keys(action?.outputs ?? {}).length, 1);
      const height = 86 + Math.min(portRows, 5) * 20;
      nodes.push({
        id: nodeId,
        type: "action",
        x,
        y: rowY,
        width: 250,
        height,
        title: `${step.action.instanceId}.${step.action.name}`,
        subtitle: action?.label ?? "Action",
        inputs: Object.keys(action?.inputs ?? {}),
        outputs: Object.keys(action?.outputs ?? {}),
      });
      edges.push({ from: previousNodeId, to: nodeId, kind: "flow" });
      previousNodeId = nodeId;

      for (const [inputName, binding] of Object.entries(step.inputs)) {
        if (binding.kind === "event") {
          edges.push({ from: eventId, to: nodeId, kind: "data", label: binding.path ? `${binding.path} → ${inputName}` : inputName });
        }
        if (binding.kind === "output") {
          edges.push({ from: `action:${binding.stepId}`, to: nodeId, kind: "data", label: `${binding.name} → ${inputName}` });
        }
      }

      for (const [outputName, mapping] of Object.entries(step.outputs)) {
        if (!mapping.blackboardKey) continue;
        let boardId = boardNodeIds.get(mapping.blackboardKey);
        if (!boardId) {
          boardId = `board:${mapping.blackboardKey}`;
          boardNodeIds.set(mapping.blackboardKey, boardId);
          const boardIndex = boardNodeIds.size - 1;
          const boardX = 330 + Math.max(conditionCount + rule.actions.length, 1) * 310;
          nodes.push({
            id: boardId,
            type: "blackboard",
            x: boardX,
            y: rowY + boardIndex * 78,
            width: 205,
            height: 66,
            title: mapping.blackboardKey,
            subtitle: project?.manifest.blackboard[mapping.blackboardKey]?.type ?? "blackboard",
            inputs: ["value"],
            outputs: [],
          });
        }
        edges.push({ from: nodeId, to: boardId, kind: "blackboard", label: outputName });
      }
    });
  });

  for (const node of nodes) {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const world = document.createElement("div");
  world.className = "diagram-world";
  world.style.width = `${Math.max(maxX + 80, diagramHost.clientWidth - 10)}px`;
  world.style.height = `${Math.max(maxY + 70, diagramHost.clientHeight - 10)}px`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("diagram-edges");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.innerHTML = `
    <defs>
      <marker id="arrow-flow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
      <marker id="arrow-data" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
      <marker id="arrow-board" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
    </defs>`;
  world.append(svg);

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(42, Math.abs(x2 - x1) * 0.42);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", `diagram-edge ${edge.kind}`);
    path.setAttribute("marker-end", `url(#arrow-${edge.kind === "blackboard" ? "board" : edge.kind})`);
    svg.append(path);

    if (edge.label && edge.kind !== "flow") {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String((x1 + x2) / 2));
      label.setAttribute("y", String((y1 + y2) / 2 - 6));
      label.setAttribute("class", `diagram-edge-label ${edge.kind}`);
      label.textContent = edge.label;
      svg.append(label);
    }
  }

  for (const node of nodes) {
    const element = document.createElement("article");
    element.className = `diagram-node ${node.type}`;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.style.width = `${node.width}px`;
    element.style.minHeight = `${node.height}px`;
    element.innerHTML = `
      <header><span>${node.type.toUpperCase()}</span><small>${escapeHtml(node.subtitle)}</small></header>
      <strong>${escapeHtml(node.title)}</strong>
      <div class="diagram-node-ports">
        <div>${node.inputs.map((port) => `<span class="diagram-port input">● ${escapeHtml(port)}</span>`).join("")}</div>
        <div>${node.outputs.map((port) => `<span class="diagram-port output">${escapeHtml(port)} ●</span>`).join("")}</div>
      </div>
    `;
    world.append(element);
  }

  diagramHost.append(world);
}

function setupNavigatorViews(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".activity-button"));
  const views = Array.from(document.querySelectorAll<HTMLElement>(".navigator-view"));
  for (const button of buttons) {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      views.forEach((view) => view.classList.toggle("is-active", view.id === `${button.dataset.view}-view`));
    });
  }
}

function setupSplitters(): void {
  restoreSplitterLayout();

  bindSplitter(required("#split-nav"), "x", (delta) => {
    const current = numberCssVariable("--nav-width", 252);
    document.documentElement.style.setProperty("--nav-width", `${clamp(current + delta, 180, 430)}px`);
  }, saveSplitterLayout);
  bindSplitter(required("#split-preview"), "x", (delta) => {
    const current = numberCssVariable("--preview-width", 326);
    document.documentElement.style.setProperty("--preview-width", `${clamp(current - delta, 240, 520)}px`);
  }, saveSplitterLayout);
  bindSplitter(required("#split-logic"), "y", (delta) => {
    const current = numberCssVariable("--logic-height", 330);
    const max = Math.max(220, appShell.clientHeight - 220);
    document.documentElement.style.setProperty("--logic-height", `${clamp(current - delta, 180, max)}px`);
  }, saveSplitterLayout);
}

function bindSplitter(
  element: HTMLElement,
  axis: "x" | "y",
  applyDelta: (delta: number) => void,
  onStop?: () => void,
): void {
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    let previous = axis === "x" ? event.clientX : event.clientY;
    document.body.classList.add("is-resizing");
    document.body.classList.toggle("is-row-resizing", axis === "y");

    const move = (moveEvent: PointerEvent) => {
      const current = axis === "x" ? moveEvent.clientX : moveEvent.clientY;
      const delta = current - previous;
      previous = current;
      applyDelta(delta);
    };
    const stop = () => {
      document.body.classList.remove("is-resizing", "is-row-resizing");
      onStop?.();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
  });
}

function saveSplitterLayout(): void {
  const layout = {
    nav: numberCssVariable("--nav-width", 252),
    preview: numberCssVariable("--preview-width", 326),
    logic: numberCssVariable("--logic-height", 330),
  };
  localStorage.setItem("sds.layout", JSON.stringify(layout));
}

function restoreSplitterLayout(): void {
  try {
    const raw = localStorage.getItem("sds.layout");
    if (!raw) return;
    const layout = JSON.parse(raw) as Partial<{ nav: number; preview: number; logic: number }>;
    if (Number.isFinite(layout.nav)) document.documentElement.style.setProperty("--nav-width", `${clamp(Number(layout.nav), 180, 430)}px`);
    if (Number.isFinite(layout.preview)) document.documentElement.style.setProperty("--preview-width", `${clamp(Number(layout.preview), 240, 520)}px`);
    if (Number.isFinite(layout.logic)) document.documentElement.style.setProperty("--logic-height", `${clamp(Number(layout.logic), 180, 620)}px`);
  } catch {
    localStorage.removeItem("sds.layout");
  }
}

function renderProjectMeta(): void {
  if (!project) {
    projectMeta.textContent = "No project";
    return;
  }
  const { instances, rules, blackboard } = project.manifest;
  projectMeta.textContent = `${instances.length} objects · ${rules.length} rules · ${Object.keys(blackboard).length} blackboard vars`;
}

function clearWorkspace(): void {
  project = null;
  selectedFile = null;
  definitions.clear();
  renderAll();
}

function apiGroup(label: string, values: string[], kind?: string): HTMLElement {
  const group = document.createElement("div");
  group.className = "api-group";
  const title = document.createElement("span");
  title.className = "api-label";
  title.textContent = label;
  group.append(title);
  if (!values.length) {
    const none = document.createElement("span");
    none.className = "api-chip";
    none.textContent = "none";
    group.append(none);
  } else {
    for (const value of values) {
      const chip = document.createElement("span");
      chip.className = `api-chip${kind ? ` ${kind}` : ""}`;
      chip.textContent = value;
      group.append(chip);
    }
  }
  return group;
}

function fillEndpointSelect(select: HTMLSelectElement, items: Array<{ value: string; label: string }>, emptyLabel: string): void {
  const previous = select.value;
  select.replaceChildren();
  if (!items.length) {
    const empty = option("", emptyLabel);
    empty.disabled = true;
    select.append(empty);
    return;
  }
  for (const item of items) select.append(option(item.value, item.label));
  if (items.some((item) => item.value === previous)) select.value = previous;
}

function option(value: string, label: string): HTMLOptionElement {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function endpointValue(endpoint: EventEndpoint): string {
  return `${endpoint.instanceId}::${endpoint.name}`;
}

function parseEndpointValue(value: string): EventEndpoint {
  const [instanceId, name] = value.split("::");
  return { instanceId, name };
}

function emptyMessage(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "empty-message";
  element.textContent = text;
  return element;
}

function emptyInline(text: string): HTMLElement {
  const element = document.createElement("span");
  element.className = "empty-inline";
  element.textContent = text;
  return element;
}

function objectParentFolder(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function basenameWithoutExtension(path: string): string {
  return (path.split("/").at(-1) ?? path).replace(/\.ts$/, "");
}

function safeVariableName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/^\d+/, "").slice(0, 48);
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (typeof value === "string") return value || '\"\"';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function setGlobalStatus(message: string, error = false): void {
  globalStatus.textContent = message;
  globalStatus.classList.toggle("is-error", error);
}

function numberCssVariable(name: string, fallback: number): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '\"': "&quot;",
  }[char] ?? char));
}
