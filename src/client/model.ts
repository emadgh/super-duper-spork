import type { DomChild } from "./dom-core/index.ts";

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
  props: Readonly<Record<string, unknown>>;
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

export interface ObjectConditionDefinition {
  label?: string;
  description?: string;
  inputs?: Record<string, PortDefinition>;
  test: (context: ActionContext, inputs: Record<string, unknown>) => boolean;
}

export interface RenderContext<State extends Record<string, unknown> = Record<string, unknown>> {
  state: State;
  props: Readonly<Record<string, unknown>>;
  emit: (eventName: string, payload?: unknown) => void;
}

/**
 * Legacy/escape-hatch mount contract. New visual objects should prefer `render`
 * so DomCore owns DOM creation, event cleanup, and slot discovery.
 */
export interface MountContext<State extends Record<string, unknown> = Record<string, unknown>> extends RenderContext<State> {
  host: HTMLElement;
}

export interface MountedObject {
  update?: () => void;
  dispose?: () => void;
  /** Named DOM mount points that can host child component instances. */
  slots?: Record<string, HTMLElement>;
}

export interface ObjectDefinition {
  name: string;
  description?: string;
  state?: Record<string, unknown>;
  events?: Record<string, ObjectEventDefinition>;
  conditions?: Record<string, ObjectConditionDefinition>;
  actions?: Record<string, ObjectActionDefinition>;
  /** Preferred declarative UI contract. TSX compiles to DomCore VNodes. */
  render?: (context: RenderContext) => DomChild;
  /** Low-level DOM escape hatch retained for backward compatibility. */
  mount?: (context: MountContext) => MountedObject | void;
}

export interface ProjectObjectFile {
  /** Path relative to the project's objects/ directory. */
  file: string;
  source: string;
  compiled: string;
}

export interface ProjectStyleFile {
  /** Path relative to the project's styles/ directory. */
  file: string;
  source: string;
  compiled: string;
  warnings: string[];
}

export interface ProjectInstance {
  id: string;
  objectFile: string;
  /** Per-instance configuration. A reusable component file can therefore back many configured component instances. */
  props?: Record<string, unknown>;
  /** Optional visual parent. Child components mount into a named slot exposed by the parent. */
  parent?: {
    instanceId: string;
    slot: string;
  };
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

export interface ConditionStep {
  id: string;
  condition: EventEndpoint;
  inputs: Record<string, ValueBinding>;
}

export interface ActionStep {
  id: string;
  action: EventEndpoint;
  inputs: Record<string, ValueBinding>;
  outputs: Record<string, { blackboardKey?: string }>;
}

export interface EventRule {
  id: string;
  event: EventEndpoint;
  /** Missing/empty conditions means the rule is unconditional for v3 compatibility. */
  conditions?: ConditionStep[];
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
  /** Project-owned CSS entry files, relative to styles/. */
  styles: string[];
  instances: ProjectInstance[];
  blackboard: Record<string, BlackboardEntry>;
  rules: EventRule[];
  updatedAt: string;
}

export type ProjectPackageRole = "runtime" | "build" | "dev";
export type ProjectNodeModulesMode = "none" | "auto" | "manual";

export interface ProjectPackagePermissions {
  read?: string[];
  write?: string[];
  net?: string[];
  env?: string[];
  /** Explicit capability for dependencies that enumerate process.env and cannot use a key allowlist. */
  envAll?: boolean;
  run?: string[];
  sys?: string[];
  ffi?: boolean;
}

export interface ProjectPackageDefinition {
  id: string;
  alias: string;
  specifier: string;
  role: ProjectPackageRole;
  native?: boolean;
  allowScripts?: string[];
  permissions?: ProjectPackagePermissions;
}

export interface ProjectPackageManifest {
  version: 1;
  nodeModulesDir: ProjectNodeModulesMode;
  packages: ProjectPackageDefinition[];
}

export interface PackagePresetSummary {
  id: string;
  name: string;
  description: string;
  nodeModulesDir?: ProjectNodeModulesMode;
  packageIds: string[];
}

export interface ProjectPackageState {
  manifest: ProjectPackageManifest;
  effectivePermissions: ProjectPackagePermissions;
}

export interface LoadedProject {
  manifest: ProjectManifest;
  objects: ProjectObjectFile[];
  styles: ProjectStyleFile[];
  packages: ProjectPackageState;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ActionTemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultFile: string;
}
