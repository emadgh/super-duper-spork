export type ProjectPackageRole = "runtime" | "build" | "dev";
export type NodeModulesMode = "none" | "auto" | "manual";

export interface ProjectPermissions {
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

export interface ProjectPackage {
  id: string;
  alias: string;
  specifier: string;
  role: ProjectPackageRole;
  native?: boolean;
  allowScripts?: string[];
  permissions?: ProjectPermissions;
}

export interface ProjectPackageManifest {
  version: 1;
  nodeModulesDir: NodeModulesMode;
  packages: ProjectPackage[];
}

export interface PackagePreset {
  id: string;
  name: string;
  description: string;
  packages: ProjectPackage[];
  nodeModulesDir?: NodeModulesMode;
}

export const PACKAGE_PRESETS: readonly PackagePreset[] = [
  {
    id: "typeorm",
    name: "TypeORM",
    description: "TypeORM 1.1 with reflection metadata support.",
    packages: [
      {
        id: "typeorm",
        alias: "typeorm",
        specifier: "npm:typeorm@1.1.0",
        role: "runtime",
        permissions: { envAll: true },
      },
      { id: "reflect-metadata", alias: "reflect-metadata", specifier: "npm:reflect-metadata@0.2.2", role: "runtime" },
    ],
  },
  {
    id: "better-sqlite3",
    name: "Better SQLite3",
    description: "Native SQLite driver with explicit lifecycle-script and FFI requirements.",
    nodeModulesDir: "auto",
    packages: [
      {
        id: "better-sqlite3",
        alias: "better-sqlite3",
        specifier: "npm:better-sqlite3@13.0.2",
        role: "runtime",
        native: true,
        allowScripts: ["npm:better-sqlite3"],
        permissions: { ffi: true, sys: ["cpus"] },
      },
    ],
  },
  {
    id: "tailwind",
    name: "Tailwind CSS",
    description: "Tailwind CSS v4 and its CLI as build-time packages.",
    nodeModulesDir: "auto",
    packages: [
      { id: "tailwindcss", alias: "tailwindcss", specifier: "npm:tailwindcss@4.3.3", role: "build" },
      { id: "tailwindcss-cli", alias: "@tailwindcss/cli", specifier: "npm:@tailwindcss/cli@4.3.3", role: "build" },
    ],
  },
] as const;

export class ProjectPackageManager {
  constructor(readonly projectRoot: URL) {}

  async read(): Promise<ProjectPackageManifest> {
    try {
      const raw = JSON.parse(await Deno.readTextFile(new URL("packages.json", this.projectRoot))) as unknown;
      return sanitizePackageManifest(raw);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return emptyPackageManifest();
      throw error;
    }
  }

  async write(manifest: ProjectPackageManifest): Promise<ProjectPackageManifest> {
    const clean = sanitizePackageManifest(manifest);
    await Deno.writeTextFile(
      new URL("packages.json", this.projectRoot),
      `${JSON.stringify(clean, null, 2)}\n`,
    );
    await this.writeDenoConfig(clean);
    return clean;
  }

  async ensure(): Promise<ProjectPackageManifest> {
    const manifest = await this.read();
    await this.write(manifest);
    return manifest;
  }

  async addPreset(presetId: string): Promise<ProjectPackageManifest> {
    const preset = PACKAGE_PRESETS.find((item) => item.id === presetId);
    if (!preset) throw new Error(`Unknown package preset: ${presetId}`);
    const current = await this.read();
    const packages = [...current.packages];
    for (const item of preset.packages) {
      const existing = packages.findIndex((candidate) => candidate.id === item.id || candidate.alias === item.alias);
      if (existing >= 0) packages[existing] = structuredClone(item);
      else packages.push(structuredClone(item));
    }
    return await this.write({
      version: 1,
      nodeModulesDir: strongerNodeModulesMode(current.nodeModulesDir, preset.nodeModulesDir ?? "none"),
      packages,
    });
  }

  async remove(packageId: string): Promise<ProjectPackageManifest> {
    const current = await this.read();
    return await this.write({
      ...current,
      packages: current.packages.filter((item) => item.id !== packageId),
    });
  }

  async install(): Promise<{ success: true; output: string }> {
    const manifest = await this.read();
    await this.writeDenoConfig(manifest);
    const command = new Deno.Command(Deno.execPath(), {
      cwd: toFsPath(this.projectRoot),
      args: ["install", "--config", "deno.json"],
      stdout: "piped",
      stderr: "piped",
    });
    const result = await command.output();
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    if (!result.success) throw new Error(`Package install failed (${result.code}).\n${output}`);
    return { success: true, output };
  }

  async writeDenoConfig(manifest?: ProjectPackageManifest): Promise<void> {
    const clean = sanitizePackageManifest(manifest ?? await this.read());
    const imports = Object.fromEntries(clean.packages.map((item) => [item.alias, item.specifier]));
    const allowScripts = unique(clean.packages.flatMap((item) => item.allowScripts ?? []));
    const config: Record<string, unknown> = {
      nodeModulesDir: clean.nodeModulesDir,
      imports,
      lock: "deno.lock",
      compilerOptions: {
        strict: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    };
    if (allowScripts.length) config.allowScripts = allowScripts;
    await Deno.writeTextFile(new URL("deno.json", this.projectRoot), `${JSON.stringify(config, null, 2)}\n`);
  }

  effectivePermissions(manifest: ProjectPackageManifest): ProjectPermissions {
    const result: ProjectPermissions = {};
    for (const pkg of manifest.packages) mergePermissions(result, pkg.permissions ?? {});
    return normalizePermissions(result);
  }
}

export function emptyPackageManifest(): ProjectPackageManifest {
  return { version: 1, nodeModulesDir: "none", packages: [] };
}

export function sanitizePackageManifest(value: unknown): ProjectPackageManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyPackageManifest();
  const raw = value as Partial<ProjectPackageManifest>;
  const packages: ProjectPackage[] = [];
  for (const item of Array.isArray(raw.packages) ? raw.packages : []) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<ProjectPackage>;
    if (!isPackageId(candidate.id) || !isAlias(candidate.alias) || !isPackageSpecifier(candidate.specifier)) continue;
    const role: ProjectPackageRole = candidate.role === "build" || candidate.role === "dev" ? candidate.role : "runtime";
    packages.push({
      id: candidate.id,
      alias: candidate.alias,
      specifier: candidate.specifier,
      role,
      ...(candidate.native === true ? { native: true } : {}),
      ...(Array.isArray(candidate.allowScripts)
        ? { allowScripts: unique(candidate.allowScripts.filter((entry): entry is string => typeof entry === "string" && /^npm:[@A-Za-z0-9_./-]+$/.test(entry))) }
        : {}),
      ...(candidate.permissions ? { permissions: sanitizePermissions(candidate.permissions) } : {}),
    });
  }
  const nodeModulesDir: NodeModulesMode = raw.nodeModulesDir === "auto" || raw.nodeModulesDir === "manual"
    ? raw.nodeModulesDir
    : "none";
  const needsNodeModules = packages.some((item) => item.native || (item.allowScripts?.length ?? 0) > 0);
  return {
    version: 1,
    nodeModulesDir: needsNodeModules && nodeModulesDir === "none" ? "auto" : nodeModulesDir,
    packages: dedupePackages(packages),
  };
}

export function packagePresetSummaries(): Array<Omit<PackagePreset, "packages"> & { packageIds: string[] }> {
  return PACKAGE_PRESETS.map(({ packages, ...preset }) => ({ ...preset, packageIds: packages.map((item) => item.id) }));
}

export function isPackageSpecifier(value: unknown): value is string {
  return typeof value === "string" && /^(?:npm|jsr):[@A-Za-z0-9_.\/-]+(?:@[A-Za-z0-9*^~+_.-]+)?(?:\/[A-Za-z0-9_.\/-]+)?$/.test(value);
}

function isPackageId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value);
}

function isAlias(value: unknown): value is string {
  return typeof value === "string" && /^[@A-Za-z0-9][@A-Za-z0-9_./-]{0,99}$/.test(value) && !value.includes("..");
}

function sanitizePermissions(value: unknown): ProjectPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as ProjectPermissions;
  const result: ProjectPermissions = {};
  for (const key of ["read", "write", "net", "env", "run", "sys"] as const) {
    if (Array.isArray(raw[key])) {
      result[key] = unique(raw[key]!.filter((entry): entry is string => typeof entry === "string" && entry.length <= 240));
    }
  }
  if (raw.envAll === true) result.envAll = true;
  if (raw.ffi === true) result.ffi = true;
  return result;
}

function mergePermissions(target: ProjectPermissions, source: ProjectPermissions): void {
  for (const key of ["read", "write", "net", "env", "run", "sys"] as const) {
    if (source[key]?.length) target[key] = unique([...(target[key] ?? []), ...source[key]!]);
  }
  if (source.envAll) target.envAll = true;
  if (source.ffi) target.ffi = true;
}

function normalizePermissions(value: ProjectPermissions): ProjectPermissions {
  const result: ProjectPermissions = {};
  for (const key of ["read", "write", "net", "env", "run", "sys"] as const) {
    if (value[key]?.length) result[key] = unique(value[key]!);
  }
  if (value.envAll) result.envAll = true;
  if (value.ffi) result.ffi = true;
  return result;
}

function dedupePackages(packages: ProjectPackage[]): ProjectPackage[] {
  const map = new Map<string, ProjectPackage>();
  for (const item of packages) map.set(item.id, item);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function strongerNodeModulesMode(left: NodeModulesMode, right: NodeModulesMode): NodeModulesMode {
  if (left === "manual" || right === "manual") return "manual";
  if (left === "auto" || right === "auto") return "auto";
  return "none";
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function toFsPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  if (Deno.build.os === "windows") return path.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, "\\");
  return path;
}
