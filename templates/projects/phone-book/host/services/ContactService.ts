import type { DataSource, EntityManager } from "typeorm";
import type { ContactPhoneRecord, ContactRecord } from "../entities/Contact.ts";
import { ContactPhoneSchema, ContactSchema } from "../entities/Contact.ts";

export interface PhoneInput {
  label: string;
  value: string;
}

export interface ContactInput {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  company?: string;
  notes?: string;
  favorite?: boolean;
  phones?: PhoneInput[];
}

export interface ContactView extends Omit<ContactRecord, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
  phones: ContactPhoneRecord[];
}

export class ContactService {
  constructor(private readonly source: DataSource) {}

  async list(query = ""): Promise<ContactView[]> {
    const contacts = await this.source.getRepository(ContactSchema).find({
      order: { favorite: "DESC", displayName: "ASC" },
    });
    const phones = await this.source.getRepository(ContactPhoneSchema).find({ order: { id: "ASC" } });
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return contacts
      .map((contact) => this.toView(contact, phones.filter((phone) => phone.contactId === contact.id)))
      .filter((contact) => !normalizedQuery || searchableContact(contact).includes(normalizedQuery));
  }

  async create(input: ContactInput): Promise<ContactView> {
    const clean = sanitizeContact(input);
    return await this.source.transaction(async (manager) => {
      const contact = await manager.getRepository(ContactSchema).save(clean.contact);
      await this.replacePhones(manager, contact.id, clean.phones);
      return await this.getById(manager, contact.id);
    });
  }

  async update(id: number, input: ContactInput): Promise<ContactView> {
    assertId(id);
    const clean = sanitizeContact(input);
    return await this.source.transaction(async (manager) => {
      const repo = manager.getRepository(ContactSchema);
      const existing = await repo.findOneBy({ id });
      if (!existing) throw new ContactNotFoundError(id);
      await repo.save({ ...existing, ...clean.contact, id });
      await this.replacePhones(manager, id, clean.phones);
      return await this.getById(manager, id);
    });
  }

  async remove(id: number): Promise<void> {
    assertId(id);
    await this.source.transaction(async (manager) => {
      const repo = manager.getRepository(ContactSchema);
      const existing = await repo.findOneBy({ id });
      if (!existing) throw new ContactNotFoundError(id);
      await manager.getRepository(ContactPhoneSchema).delete({ contactId: id });
      await repo.delete({ id });
    });
  }

  private async replacePhones(manager: EntityManager, contactId: number, phones: PhoneInput[]): Promise<void> {
    const repo = manager.getRepository(ContactPhoneSchema);
    await repo.delete({ contactId });
    if (!phones.length) return;
    await repo.save(phones.map((phone) => ({ contactId, label: phone.label, value: phone.value })));
  }

  private async getById(manager: EntityManager, id: number): Promise<ContactView> {
    const contact = await manager.getRepository(ContactSchema).findOneBy({ id });
    if (!contact) throw new ContactNotFoundError(id);
    const phones = await manager.getRepository(ContactPhoneSchema).find({ where: { contactId: id }, order: { id: "ASC" } });
    return this.toView(contact, phones);
  }

  private toView(contact: ContactRecord, phones: ContactPhoneRecord[]): ContactView {
    return {
      ...contact,
      createdAt: toIso(contact.createdAt),
      updatedAt: toIso(contact.updatedAt),
      phones,
    };
  }
}

export class ContactNotFoundError extends Error {
  constructor(readonly contactId: number) {
    super(`Contact ${contactId} was not found.`);
    this.name = "ContactNotFoundError";
  }
}

function sanitizeContact(input: ContactInput): { contact: Omit<ContactRecord, "id" | "createdAt" | "updatedAt">; phones: PhoneInput[] } {
  const firstName = cleanText(input.firstName, 120);
  const lastName = cleanText(input.lastName, 120);
  const explicitDisplay = cleanText(input.displayName, 250);
  const displayName = explicitDisplay || [firstName, lastName].filter(Boolean).join(" ") || "Unnamed contact";
  const email = cleanText(input.email, 250);
  const company = cleanText(input.company, 250);
  const notes = cleanText(input.notes, 5000, true);
  const phones = (Array.isArray(input.phones) ? input.phones : [])
    .map((phone) => ({ label: cleanText(phone?.label, 40) || "phone", value: cleanText(phone?.value, 80) }))
    .filter((phone) => phone.value.length > 0)
    .slice(0, 12);
  return {
    contact: { firstName, lastName, displayName, email, company, notes, favorite: input.favorite === true },
    phones,
  };
}

function cleanText(value: unknown, max: number, preserveLines = false): string {
  if (typeof value !== "string") return "";
  const normalized = preserveLines ? value.replace(/\r\n?/g, "\n") : value.replace(/\s+/g, " ");
  return normalized.trim().slice(0, max);
}

function searchableContact(contact: ContactView): string {
  return [
    contact.displayName,
    contact.firstName,
    contact.lastName,
    contact.email,
    contact.company,
    contact.notes,
    ...contact.phones.flatMap((phone) => [phone.label, phone.value]),
  ].join(" ").toLocaleLowerCase();
}

function assertId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid contact id.");
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString();
}
