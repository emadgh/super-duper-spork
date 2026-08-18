export interface TailwindStyleBuild {
  provider: "tailwind";
  input: string;
  output: string;
  minify?: boolean;
}

export interface ProjectBuildManifest {
  version: 1;
  styles: TailwindStyleBuild[];
}

export interface BuildProviderResult {
  provider: "tailwind";
  output: string;
  stdout: string;
}

export function emptyBuildManifest(): ProjectBuildManifest {
  return { version: 1, styles: [] };
}

export async function readBuildManifest(projectRoot: URL): Promise<ProjectBuildManifest> {
  try {
    const raw = JSON.parse(await Deno.readTextFile(new URL("build.json", projectRoot))) as unknown;
    return sanitizeBuildManifest(raw);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return emptyBuildManifest();
    throw error;
  }
}

export function sanitizeBuildManifest(value: unknown): ProjectBuildManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyBuildManifest();
  const raw = value as { version?: unknown; styles?: unknown };
  const styles: TailwindStyleBuild[] = [];
  for (const entry of Array.isArray(raw.styles) ? raw.styles : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Partial<TailwindStyleBuild>;
    if (item.provider !== "tailwind") throw new Error(`Unsupported build provider: ${String(item.provider ?? "")}`);
    const input = validateRelativePath(item.input, "build input");
    const output = validatePublicOutput(item.output);
    styles.push({ provider: "tailwind", input, output, ...(item.minify === false ? { minify: false } : { minify: true }) });
  }
  return { version: 1, styles };
}

export function styleLinks(manifest: ProjectBuildManifest): string[] {
  return manifest.styles.map((entry) => `/${entry.output.replace(/^public\//, "")}`);
}

export async function runBuildProviders(
  projectRoot: URL,
  outputRoot: URL,
  manifest?: ProjectBuildManifest,
): Promise<BuildProviderResult[]> {
  const resolvedManifest = manifest ?? await readBuildManifest(projectRoot);
  const results: BuildProviderResult[] = [];
  for (const entry of resolvedManifest.styles) {
    switch (entry.provider) {
      case "tailwind":
        results.push(await runTailwind(projectRoot, outputRoot, entry));
        break;
    }
  }
  return results;
}

async function runTailwind(projectRoot: URL, outputRoot: URL, entry: TailwindStyleBuild): Promise<BuildProviderResult> {
  const inputUrl = new URL(entry.input, projectRoot);
  const outputUrl = new URL(entry.output, outputRoot);
  await assertFile(inputUrl, `Tailwind input ${entry.input}`);
  await Deno.mkdir(new URL(".", outputUrl), { recursive: true });

  const outputParent = toFsPath(new URL(".", outputUrl));
  const command = new Deno.Command(Deno.execPath(), {
    cwd: toFsPath(projectRoot),
    args: [
      "run",
      "--config",
      "deno.json",
      "--allow-read=.",
      `--allow-write=${outputParent}`,
      "--allow-env",
      "--allow-sys",
      "--allow-ffi",
      "npm:@tailwindcss/cli@4.3.3",
      "-i",
      toFsPath(inputUrl),
      "-o",
      toFsPath(outputUrl),
      ...(entry.minify === false ? [] : ["--minify"]),
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(result.stdout);
  const stderr = decoder.decode(result.stderr);
  if (!result.success) {
    throw new Error(`Tailwind build failed (${result.code}).\n${stdout}\n${stderr}`);
  }
  return { provider: "tailwind", output: entry.output, stdout: `${stdout}${stderr}` };
}

function validateRelativePath(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a path.`);
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized.includes("..\\") || normalized.includes("\0")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (!/^[A-Za-z0-9_./-]+$/.test(normalized)) throw new Error(`Invalid ${label}: ${value}`);
  return normalized;
}

function validatePublicOutput(value: unknown): string {
  const path = validateRelativePath(value, "build output");
  if (!path.startsWith("public/") || !path.endsWith(".css")) {
    throw new Error("Style build outputs must be CSS files inside public/.");
  }
  return path;
}

async function assertFile(url: URL, label: string): Promise<void> {
  try {
    const info = await Deno.stat(url);
    if (!info.isFile) throw new Error(`${label} is not a file.`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) throw new Error(`${label} was not found.`);
    throw error;
  }
}

function toFsPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  if (Deno.build.os === "windows") return path.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, "\\");
  return path;
}
