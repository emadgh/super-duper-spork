import "reflect-metadata";
import { DataSource } from "typeorm";
import type { AppHostContext } from "../kernel/host-api.ts";
import { ContactPhoneSchema, ContactSchema } from "./entities/Contact.ts";

let dataSource: DataSource | null = null;

export async function getDataSource(context: AppHostContext): Promise<DataSource> {
  if (dataSource?.isInitialized) return dataSource;
  const databaseUrl = new URL("phone-book.sqlite", context.dataDir);
  const source = new DataSource({
    type: "better-sqlite3",
    database: toFsPath(databaseUrl),
    entities: [ContactSchema, ContactPhoneSchema],
    synchronize: true,
    enableWAL: true,
  });
  await source.initialize();
  dataSource = source;
  return source;
}

export async function closeDataSource(): Promise<void> {
  if (!dataSource?.isInitialized) return;
  await dataSource.destroy();
  dataSource = null;
}

function toFsPath(url: URL): string {
  const path = decodeURIComponent(url.pathname);
  if (Deno.build.os === "windows") return path.replace(/^\/([A-Za-z]:\/)/, "$1").replace(/\//g, "\\");
  return path;
}
