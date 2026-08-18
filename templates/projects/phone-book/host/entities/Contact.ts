import { EntitySchema } from "typeorm";

export interface ContactRecord {
  id: number;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  company: string;
  notes: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactPhoneRecord {
  id: number;
  contactId: number;
  label: string;
  value: string;
}

export const ContactSchema = new EntitySchema<ContactRecord>({
  name: "Contact",
  tableName: "contacts",
  columns: {
    id: { type: Number, primary: true, generated: true },
    firstName: { type: String, length: 120, default: "" },
    lastName: { type: String, length: 120, default: "" },
    displayName: { type: String, length: 250 },
    email: { type: String, length: 250, default: "" },
    company: { type: String, length: 250, default: "" },
    notes: { type: "text", default: "" },
    favorite: { type: Boolean, default: false },
    createdAt: { type: Date, createDate: true },
    updatedAt: { type: Date, updateDate: true },
  },
  indices: [
    { name: "IDX_contacts_display_name", columns: ["displayName"] },
    { name: "IDX_contacts_email", columns: ["email"] },
  ],
});

export const ContactPhoneSchema = new EntitySchema<ContactPhoneRecord>({
  name: "ContactPhone",
  tableName: "contact_phones",
  columns: {
    id: { type: Number, primary: true, generated: true },
    contactId: { type: Number },
    label: { type: String, length: 40, default: "phone" },
    value: { type: String, length: 80 },
  },
  indices: [
    { name: "IDX_contact_phones_contact", columns: ["contactId"] },
    { name: "IDX_contact_phones_value", columns: ["value"] },
  ],
});
