import type { AppHostContext, AppHostModule } from "./host-api.ts";

const ROOT = new URL("../../", import.meta.url);
const PUBLIC = new URL("public/", ROOT);
const DATA = new URL("data/", ROOT);
const HOST = new URL("host/main.ts", ROOT);
const port = parsePort(Deno.args);

await Deno.mkdir(DATA, { recursive: true });
const context: AppHostContext = { projectRoot: ROOT, dataDir: DATA };
const hostModule = await loadHostModule();
await hostModule?.onStart?.(context);

const abort = new AbortController();
const server = Deno.serve({ port, signal: abort.signal }, async (request) => {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!hostModule?.handleAppRequest) return json({ error: "This application does not expose a host API." }, 404);
      return await hostModule.handleAppRequest(request, context);
    }
    return await serveStatic(url.pathname);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

console.log(`Spork application host: http://127.0.0.1:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  try {
    Deno.addSignalListener(signal, () => void shutdown());
  } catch {
    // Signal is unavailable on some platforms (notably Windows for SIGTERM).
  }
}

async function shutdown(): Promise<void> {
  abort.abort();
  await hostModule?.onStop?.(context);
  await server.finished.catch(() => undefined);
}

async function loadHostModule(): Promise<AppHostModule | null> {
  try {
    return await import(HOST.href) as AppHostModule;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || (error instanceof TypeError && String(error.message).includes("Module not found"))) return null;
    throw error;
  }
}

async function serveStatic(pathname: string): Promise<Response> {
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!relative || relative.includes("..") || relative.includes("\\")) return new Response("Invalid path", { status: 400 });
  const target = new URL(relative, PUBLIC);
  try {
    const bytes = await Deno.readFile(target);
    return new Response(bytes, {
      headers: {
        "content-type": contentType(relative),
        "cache-control": relative === "app-data.json" ? "no-store" : "no-cache",
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return new Response("Not found", { status: 404 });
    throw error;
  }
}

function contentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function parsePort(args: string[]): number {
  const index = args.indexOf("--port");
  const value = index >= 0 ? Number(args[index + 1]) : Number(Deno.env.get("PORT") ?? 8787);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("Invalid application port.");
  return value;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
