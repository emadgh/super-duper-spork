import type {
  ActionStep,
  BlackboardEntry,
  EventRule,
  MountedObject,
  ObjectDefinition,
  ProjectInstance,
  ValueBinding,
} from "./model.ts";

interface RuntimeInstance {
  id: string;
  definition: ObjectDefinition;
  state: Record<string, unknown>;
  mount?: MountedObject;
}

export interface RuntimeTrace {
  kind: "event" | "action" | "error";
  label: string;
  detail?: string;
}

interface RuntimeOptions {
  onTrace?: (trace: RuntimeTrace) => void;
  onBlackboardChange?: (blackboard: Record<string, BlackboardEntry>) => void;
}

export class EventRuntime {
  readonly #definitionsByFile: Map<string, ObjectDefinition>;
  readonly #instances: ProjectInstance[];
  readonly #rules: EventRule[];
  readonly #runtimeInstances = new Map<string, RuntimeInstance>();
  readonly #blackboard: Record<string, BlackboardEntry>;
  readonly #options: RuntimeOptions;

  constructor(
    definitionsByFile: Map<string, ObjectDefinition>,
    instances: ProjectInstance[],
    rules: EventRule[],
    blackboard: Record<string, BlackboardEntry>,
    options: RuntimeOptions = {},
  ) {
    this.#definitionsByFile = definitionsByFile;
    this.#instances = instances;
    this.#rules = rules;
    this.#blackboard = structuredClone(blackboard);
    this.#options = options;

    for (const instance of instances) {
      const definition = definitionsByFile.get(instance.objectFile);
      if (!definition) continue;
      this.#runtimeInstances.set(instance.id, {
        id: instance.id,
        definition,
        state: cloneState(definition.state ?? {}),
      });
    }
  }

  mountPreview(root: HTMLElement): void {
    root.replaceChildren();

    for (const instance of this.#instances) {
      const runtimeInstance = this.#runtimeInstances.get(instance.id);
      if (!runtimeInstance || !runtimeInstance.definition.mount) continue;

      const card = document.createElement("section");
      card.className = "preview-object";
      card.dataset.instanceId = instance.id;

      const header = document.createElement("div");
      header.className = "preview-object__title";
      header.innerHTML = `<span>${escapeHtml(runtimeInstance.definition.name)}</span><code>${escapeHtml(instance.id)}</code>`;

      const host = document.createElement("div");
      host.className = "preview-object__host";

      card.append(header, host);
      root.append(card);

      const mounted = runtimeInstance.definition.mount({
        host,
        state: runtimeInstance.state,
        emit: (eventName, payload) => this.emit(instance.id, eventName, payload),
      });

      runtimeInstance.mount = mounted || undefined;
    }
  }

  emit(instanceId: string, eventName: string, payload?: unknown): void {
    this.#trace("event", `${instanceId}.${eventName}`);
    const matching = this.#rules.filter(
      (rule) => rule.event.instanceId === instanceId && rule.event.name === eventName,
    );

    for (const rule of matching) {
      const outputs = new Map<string, Record<string, unknown>>();
      for (const step of rule.actions) {
        try {
          const result = this.#runAction(step, payload, outputs);
          outputs.set(step.id, result);
        } catch (error) {
          this.#trace("error", `${step.action.instanceId}.${step.action.name}`, errorMessage(error));
          console.error(error);
        }
      }
    }
  }

  dispose(): void {
    for (const instance of this.#runtimeInstances.values()) instance.mount?.dispose?.();
    this.#runtimeInstances.clear();
  }

  getState(instanceId: string): Record<string, unknown> | undefined {
    return this.#runtimeInstances.get(instanceId)?.state;
  }

  getBlackboard(): Record<string, BlackboardEntry> {
    return structuredClone(this.#blackboard);
  }

  #runAction(
    step: ActionStep,
    eventPayload: unknown,
    previousOutputs: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const target = this.#runtimeInstances.get(step.action.instanceId);
    if (!target) throw new Error(`Unknown instance: ${step.action.instanceId}`);

    const action = target.definition.actions?.[step.action.name];
    if (!action) throw new Error(`Unknown action: ${step.action.instanceId}.${step.action.name}`);

    const inputs: Record<string, unknown> = {};
    for (const [name, port] of Object.entries(action.inputs ?? {})) {
      const binding = step.inputs[name];
      inputs[name] = binding ? this.#resolveBinding(binding, eventPayload, previousOutputs) : port.default;
    }

    this.#trace("action", `${step.action.instanceId}.${step.action.name}`, formatInputs(inputs));
    const result = action.run(
      {
        state: target.state,
        payload: eventPayload,
        emit: (nextEventName, nextPayload) => this.emit(target.id, nextEventName, nextPayload),
      },
      inputs,
    ) ?? {};

    target.mount?.update?.();

    for (const [outputName, mapping] of Object.entries(step.outputs)) {
      if (!mapping.blackboardKey || !(outputName in result)) continue;
      const entry = this.#blackboard[mapping.blackboardKey];
      if (!entry) continue;
      entry.value = result[outputName];
      this.#options.onBlackboardChange?.(this.getBlackboard());
    }

    return result;
  }

  #resolveBinding(
    binding: ValueBinding,
    eventPayload: unknown,
    previousOutputs: Map<string, Record<string, unknown>>,
  ): unknown {
    switch (binding.kind) {
      case "literal":
        return binding.value;
      case "blackboard":
        return this.#blackboard[binding.key]?.value;
      case "state":
        return getPath(this.#runtimeInstances.get(binding.instanceId)?.state, binding.path);
      case "event":
        return getPath(eventPayload, binding.path);
      case "output":
        return previousOutputs.get(binding.stepId)?.[binding.name];
    }
  }

  #trace(kind: RuntimeTrace["kind"], label: string, detail?: string): void {
    this.#options.onTrace?.({ kind, label, detail });
  }
}

function getPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let value = source;
  for (const part of path.split(".").filter(Boolean)) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function cloneState(source: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(source);
}

function formatInputs(inputs: Record<string, unknown>): string | undefined {
  const entries = Object.entries(inputs);
  if (!entries.length) return undefined;
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char] ?? char));
}
