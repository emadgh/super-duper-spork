import { evaluateObjectFile } from "../client/compiler.ts";
import type { BlackboardEntry, LoadedProject, ObjectDefinition } from "../client/model.ts";
import { EventRuntime, type RuntimeTrace } from "../client/runtime.ts";
import { APP_BRIDGE_VERSION, isStudioMessage, type AppToStudioMessage } from "./bridge.ts";

interface KernelBootstrap {
  projectId: string;
  dataUrl: string;
}

type AppMessagePayload =
  | { type: "ready"; projectId: string }
  | { type: "trace"; projectId: string; trace: RuntimeTrace }
  | { type: "blackboard"; projectId: string; blackboard: Record<string, BlackboardEntry> }
  | { type: "error"; projectId: string; message: string; stack?: string };

declare global {
  interface Window {
    __SPORK_APP__?: KernelBootstrap;
  }
}

const root = requireRoot();
const bootstrap = requireBootstrap();
let runtime: EventRuntime | null = null;

window.addEventListener("message", (event) => {
  if (!isStudioMessage(event.data)) return;
  if (event.data.type === "reload") location.reload();
  else if (event.data.type === "ping") post({ type: "ready", projectId: bootstrap.projectId });
});

window.addEventListener("error", (event) => {
  post({
    type: "error",
    projectId: bootstrap.projectId,
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
});
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  post({ type: "error", projectId: bootstrap.projectId, message: error.message, stack: error.stack });
});
window.addEventListener("beforeunload", () => runtime?.dispose());

await boot();

async function boot(): Promise<void> {
  root.replaceChildren();
  root.dataset.projectId = bootstrap.projectId;
  const response = await fetch(bootstrap.dataUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load application data (${response.status}).`);
  const project = await response.json() as LoadedProject;
  const definitions = new Map<string, ObjectDefinition>();
  for (const file of project.objects) definitions.set(file.file, evaluateObjectFile(file));

  runtime?.dispose();
  runtime = new EventRuntime(
    definitions,
    project.manifest.instances,
    project.manifest.rules,
    project.manifest.blackboard,
    {
      onTrace: (trace) => post({ type: "trace", projectId: bootstrap.projectId, trace }),
      onBlackboardChange: (blackboard) => post({ type: "blackboard", projectId: bootstrap.projectId, blackboard }),
    },
  );
  runtime.mountPreview(root, { styles: project.styles.map((style) => style.compiled), chrome: false });
  post({ type: "ready", projectId: bootstrap.projectId });
}

function requireRoot(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#spork-app-root");
  if (!element) throw new Error("App Kernel root #spork-app-root was not found.");
  return element;
}

function requireBootstrap(): KernelBootstrap {
  const value = window.__SPORK_APP__;
  if (!value || typeof value.projectId !== "string" || !value.projectId || typeof value.dataUrl !== "string" || !value.dataUrl) {
    throw new Error("App Kernel bootstrap data is missing.");
  }
  return value;
}

function post(message: AppMessagePayload): void {
  if (window.parent === window) return;
  const outgoing: AppToStudioMessage = { source: "spork-app", version: APP_BRIDGE_VERSION, ...message };
  window.parent.postMessage(outgoing, "*");
}
