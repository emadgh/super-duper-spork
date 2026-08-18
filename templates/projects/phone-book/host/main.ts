import type { AppHostContext } from "../kernel/host-api.ts";
import { closeDataSource, getDataSource } from "./database.ts";
import { ContactNotFoundError, ContactService, type ContactInput } from "./services/ContactService.ts";

export async function onStart(context: AppHostContext): Promise<void> {
  const source = await getDataSource(context);
  const service = new ContactService(source);
  if ((await service.list()).length === 0) {
    await seed(service);
  }
}

export async function onStop(): Promise<void> {
  await closeDataSource();
}

export async function handleAppRequest(request: Request, context: AppHostContext): Promise<Response> {
  const url = new URL(request.url);
  const source = await getDataSource(context);
  const service = new ContactService(source);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  try {
    if (parts.length === 2 && parts[0] === "api" && parts[1] === "contacts") {
      if (request.method === "GET") return json({ contacts: await service.list(url.searchParams.get("q") ?? "") });
      if (request.method === "POST") {
        const input = await readContact(request);
        return json({ contact: await service.create(input) }, 201);
      }
    }

    if (parts.length === 3 && parts[0] === "api" && parts[1] === "contacts") {
      const id = Number(parts[2]);
      if (request.method === "PUT") return json({ contact: await service.update(id, await readContact(request)) });
      if (request.method === "DELETE") {
        await service.remove(id);
        return json({ ok: true, id });
      }
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof ContactNotFoundError) return json({ error: error.message }, 404);
    if (error instanceof SyntaxError) return json({ error: "Invalid JSON request." }, 400);
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

async function readContact(request: Request): Promise<ContactInput> {
  const value = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Contact payload must be an object.");
  return value as ContactInput;
}

async function seed(service: ContactService): Promise<void> {
  await service.create({
    firstName: "Mina",
    lastName: "Rahimi",
    email: "mina@example.com",
    company: "Studio North",
    favorite: true,
    phones: [{ label: "mobile", value: "+44 7700 900101" }],
    notes: "Seed contact — safe to edit or delete.",
  });
  await service.create({
    firstName: "Arman",
    lastName: "Daryan",
    email: "arman@example.com",
    company: "Atlas Works",
    phones: [
      { label: "mobile", value: "+44 7700 900202" },
      { label: "work", value: "+44 20 7946 0202" },
    ],
  });
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}
