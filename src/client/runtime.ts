import { mountDom } from "./dom-core/index.ts";
import { evaluateExpression, type ExpressionReference } from "./expression.ts";
import type {
  ActionStep,
  BlackboardEntry,
  ConditionStep,
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
  props: Readonly<Record<string, unknown>>;
  mount?: MountedObject;
}

export interface RuntimeTrace {
  kind: "event" | "condition" | "action" | "error";
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
        props: Object.freeze(structuredClone(instance.props ?? {})),
      });
    }

    queueMicrotask(() => {
      for (const instance of this.#runtimeInstances.values()) {
        if (instance.definition.events?.created) this.emit(instance.id, "created");
      }
    });
  }

  mountPreview(root: HTMLElement, options: { styles?: readonly string[]; chrome?: boolean } = {}): void {
    root.replaceChildren();
    const appRoot = document.createElement("div");
    appRoot.className = "spork-app";
    if (options.styles?.length) {
      const style = document.createElement("style");
      style.dataset.sporkProjectStyles = "";
      style.textContent = options.styles.join("\n");
      root.append(style);
    }
    root.append(appRoot);
    const mounted = new Set<string>();

    const mountInstance = (instance: ProjectInstance, target: HTMLElement, embedded: boolean): void => {
      if (mounted.has(instance.id)) return;
      const runtimeInstance = this.#runtimeInstances.get(instance.id);
      if (!runtimeInstance || !isVisualDefinition(runtimeInstance.definition)) return;
      mounted.add(instance.id);

      let host: HTMLElement;
      if (embedded) {
        host = document.createElement("div");
        host.className = "preview-component";
        host.dataset.instanceId = instance.id;
        target.append(host);
      } else if (options.chrome !== false) {
        const card = document.createElement("section");
        card.className = "preview-object";
        card.dataset.instanceId = instance.id;

        const header = document.createElement("div");
        header.className = "preview-object__title";
        header.innerHTML = `<span>${escapeHtml(runtimeInstance.definition.name)}</span><code>${escapeHtml(instance.id)}</code>`;

        host = document.createElement("div");
        host.className = "preview-object__host";
        card.append(header, host);
        target.append(card);
      } else {
        host = document.createElement("div");
        host.className = "preview-component preview-component--root";
        host.dataset.instanceId = instance.id;
        target.append(host);
      }

      const baseContext = {
        state: runtimeInstance.state,
        props: runtimeInstance.props,
        emit: (eventName: string, payload?: unknown) => this.emit(instance.id, eventName, payload),
      };

      if (runtimeInstance.definition.render) {
        const domMount = mountDom(host, () => runtimeInstance.definition.render?.(baseContext));
        runtimeInstance.mount = {
          update: () => domMount.update(),
          dispose: () => domMount.dispose(),
          get slots() {
            return domMount.slots;
          },
        };
      } else if (runtimeInstance.definition.mount) {
        const mountedObject = runtimeInstance.definition.mount({ host, ...baseContext });
        runtimeInstance.mount = mountedObject || undefined;
      }

      const children = this.#instances.filter((candidate) => candidate.parent?.instanceId === instance.id);
      for (const child of children) {
        const slotName = child.parent?.slot ?? "";
        const slot = runtimeInstance.mount?.slots?.[slotName];
        if (!slot) {
          this.#trace("error", `${child.id}.mount`, `Parent ${instance.id} does not expose slot ${slotName || "<empty>"}`);
          continue;
        }
        mountInstance(child, slot, true);
      }
    };

    for (const instance of this.#instances.filter((item) => !item.parent)) mountInstance(instance, appRoot, false);

    // Invalid/missing parents should not make a visual component disappear silently.
    for (const instance of this.#instances) {
      if (mounted.has(instance.id)) continue;
      const runtimeInstance = this.#runtimeInstances.get(instance.id);
      if (!runtimeInstance || !isVisualDefinition(runtimeInstance.definition)) continue;
      this.#trace("error", `${instance.id}.mount`, "Component parent could not be resolved; mounted as a root object.");
      mountInstance({ ...instance, parent: undefined }, appRoot, false);
    }
  }

  emit(instanceId: string, eventName: string, payload?: unknown): void {
    this.#trace("event", `${instanceId}.${eventName}`);
    const matching = this.#rules.filter(
      (rule) => rule.event.instanceId === instanceId && rule.event.name === eventName,
    );

    for (const rule of matching) {
      const outputs = new Map<string, Record<string, unknown>>();
      let allowed = true;
      for (const step of rule.conditions ?? []) {
        try {
          if (!this.#runCondition(step, payload, outputs)) {
            allowed = false;
            break;
          }
        } catch (error) {
          allowed = false;
          this.#trace("error", `${step.condition.instanceId}.${step.condition.name}`, errorMessage(error));
          console.error(error);
          break;
        }
      }
      if (!allowed) continue;

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

  #runCondition(
    step: ConditionStep,
    eventPayload: unknown,
    previousOutputs: Map<string, Record<string, unknown>>,
  ): boolean {
    const target = this.#runtimeInstances.get(step.condition.instanceId);
    if (!target) throw new Error(`Unknown instance: ${step.condition.instanceId}`);

    const condition = target.definition.conditions?.[step.condition.name];
    if (!condition) throw new Error(`Unknown condition: ${step.condition.instanceId}.${step.condition.name}`);

    const inputs: Record<string, unknown> = {};
    for (const [name, port] of Object.entries(condition.inputs ?? {})) {
      const binding = step.inputs[name];
      inputs[name] = binding ? this.#resolveBinding(binding, eventPayload, previousOutputs) : port.default;
    }

    const passed = condition.test(
      {
        state: target.state,
        props: target.props,
        payload: eventPayload,
      },
      inputs,
    ) === true;
    const inputText = formatInputs(inputs);
    this.#trace("condition", `${step.condition.instanceId}.${step.condition.name}`, `${passed ? "PASS" : "FAIL"}${inputText ? ` · ${inputText}` : ""}`);
    return passed;
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
        props: target.props,
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
      case "literal": return binding.value;
      case "blackboard": return this.#blackboard[binding.key]?.value;
      case "state": return getPath(this.#runtimeInstances.get(binding.instanceId)?.state, binding.path);
      case "event": return getPath(eventPayload, binding.path);
      case "output": return previousOutputs.get(binding.stepId)?.[binding.name];
      case "expression": return evaluateExpression(
        binding.source,
        (reference) => this.#resolveExpressionReference(reference, eventPayload, previousOutputs),
      );
    }
  }

  #resolveExpressionReference(
    reference: ExpressionReference,
    eventPayload: unknown,
    previousOutputs: Map<string, Record<string, unknown>>,
  ): unknown {
    switch (reference.root) {
      case "event": return getPath(eventPayload, reference.path.join("."));
      case "board": {
        const [key, ...path] = reference.path;
        return getPath(this.#blackboard[key]?.value, path.join("."));
      }
      case "state": {
        const [instanceId, ...path] = reference.path;
        return getPath(this.#runtimeInstances.get(instanceId)?.state, path.join("."));
      }
      case "output": {
        const [stepId, ...path] = reference.path;
        return getPath(previousOutputs.get(stepId), path.join("."));
      }
    }
  }

  #trace(kind: RuntimeTrace["kind"], label: string, detail?: string): void {
    this.#options.onTrace?.({ kind, label, detail });
  }
}

function isVisualDefinition(definition: ObjectDefinition): boolean {
  return typeof definition.render === "function" || typeof definition.mount === "function";
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
  return value.replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;",
  }[char] ?? char));
}
