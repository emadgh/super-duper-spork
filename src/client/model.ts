export type PortType = "number" | "string" | "boolean" | "any";

export interface PortDefinition {
  label?: string;
  type: PortType;
  default?: unknown;
  description?: string;
}

export interface ObjectEventDefinition {
  label?: string;
  description?: string;
  outputs?: Record<string, PortDefinition>;
}

export interface ActionContext<State extends Record<string, unknown> = Record<string, unknown>> {
  state: State;
  payload: unknown;
  emit: (eventName: string, payload?: unknown) => void;
}

export interface ObjectActionDefinition {
  label?: string;
  description?: string;
  inputs?: Record<string, PortDefinition>;
  outputs?: Record<string, PortDefinition>;
  run: (context: ActionContext, inputs: Record<string, unknown>) => Record<string, unknown> | void;
}

export interface MountContext<State extends Record<string, unknown> = Record<string, unknown>> {
  host: HTMLElement;
  state: State;
  emit: (eventName: string, payload?: unknown) => void;
}

export interface MountedObject {
  update?: () => void;
  dispose?: () => void;
}

export interface ObjectDefinition {
  name: string;
  description?: string;
  state?: Record<string, unknown>;
  events?: Record<string, ObjectEventDefinition>;
  actions?: Record<string, ObjectActionDefinition>;
  mount?: (context: MountContext) => MountedObject | void;
}

export interface ProjectObjectFile {
  /** Path relative to the project's objects/ directory. */
  file: string;
  source: string;
  compiled: string;
}

export interface ProjectInstance {
  id: string;
  objectFile: string;
}

export interface EventEndpoint {
  instanceId: string;
  name: string;
}

export type ValueBinding =
  | { kind: "literal"; value: unknown }
  | { kind: "blackboard"; key: string }
  | { kind: "state"; instanceId: string; path: string }
  | { kind: "event"; path: string }
  | { kind: "output"; stepId: string; name: string };

export interface ActionStep {
  id: string;
  action: EventEndpoint;
  inputs: Record<string, ValueBinding>;
  outputs: Record<string, { blackboardKey?: string }>;
}

export interface EventRule {
  id: string;
  event: EventEndpoint;
  actions: ActionStep[];
}

export interface BlackboardEntry {
  type: PortType;
  value: unknown;
}

export interface ProjectManifest {
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

export interface LoadedProject {
  manifest: ProjectManifest;
  objects: ProjectObjectFile[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}
