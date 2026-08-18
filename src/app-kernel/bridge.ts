import type { BlackboardEntry } from "../client/model.ts";
import type { RuntimeTrace } from "../client/runtime.ts";

export const APP_BRIDGE_VERSION = 1 as const;

export type AppToStudioMessage =
  | { source: "spork-app"; version: 1; type: "ready"; projectId: string }
  | { source: "spork-app"; version: 1; type: "trace"; projectId: string; trace: RuntimeTrace }
  | { source: "spork-app"; version: 1; type: "blackboard"; projectId: string; blackboard: Record<string, BlackboardEntry> }
  | { source: "spork-app"; version: 1; type: "error"; projectId: string; message: string; stack?: string };

export type StudioToAppMessage =
  | { source: "spork-studio"; version: 1; type: "ping" }
  | { source: "spork-studio"; version: 1; type: "reload" };

export function isStudioMessage(value: unknown): value is StudioToAppMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StudioToAppMessage>;
  return message.source === "spork-studio" && message.version === APP_BRIDGE_VERSION &&
    (message.type === "ping" || message.type === "reload");
}
