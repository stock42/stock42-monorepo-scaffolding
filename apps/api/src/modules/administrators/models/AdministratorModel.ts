import { AdministratorSchema, type Administrator } from "@stock42/contracts/tenancy";
import { z } from "zod";

export const AdministratorDocumentSchema = AdministratorSchema.extend({
  passwordHash: z.string().min(1),
});

export type AdministratorDocument = z.infer<typeof AdministratorDocumentSchema>;

export class AdministratorModel {
  private data: AdministratorDocument;

  constructor(input: AdministratorDocument) {
    this.data = AdministratorDocumentSchema.parse(input);
  }

  static create(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): AdministratorModel {
    const now = new Date().toISOString();
    return new AdministratorModel({
      uuid: crypto.randomUUID(),
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      passwordHash: input.passwordHash,
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  get uuid() {
    return this.data.uuid;
  }

  get email() {
    return this.data.email;
  }

  get passwordHash() {
    return this.data.passwordHash;
  }

  setStatus(status: AdministratorDocument["status"]): void {
    this.data.status = status;
    this.data.updatedAt = new Date().toISOString();
    this.data.version += 1;
  }

  getData(): AdministratorDocument {
    return { ...this.data };
  }

  toPublic(): Administrator {
    return AdministratorSchema.parse(this.data);
  }
}
