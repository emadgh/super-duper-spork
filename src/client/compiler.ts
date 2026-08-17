import type { ObjectDefinition, ProjectObjectFile } from "./model.ts";

export function evaluateObjectFile(file: ProjectObjectFile): ObjectDefinition {
  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;
  const defineObject = <T extends ObjectDefinition>(definition: T): T => definition;

  const execute = new Function(
    "module",
    "exports",
    "defineObject",
    `${file.compiled}\n//# sourceURL=${file.file}`,
  );

  execute(module, exports, defineObject);

  const exported = (module.exports as { default?: unknown }).default ?? module.exports;
  if (!isObjectDefinition(exported)) {
    throw new Error(`${file.file} must export default defineObject({ ... }).`);
  }
  return exported;
}

function isObjectDefinition(value: unknown): value is ObjectDefinition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ObjectDefinition>;
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") return false;
  if (candidate.events && typeof candidate.events !== "object") return false;
  if (candidate.actions && typeof candidate.actions !== "object") return false;
  if (candidate.mount && typeof candidate.mount !== "function") return false;
  return true;
}
