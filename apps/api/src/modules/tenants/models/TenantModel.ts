import { TenantSchema, type Tenant } from "@stock42/contracts/tenancy";
import type { z } from "zod";

export const TenantDocumentSchema = TenantSchema;
export type TenantDocument = z.infer<typeof TenantDocumentSchema>;

export class TenantModel {
  private data: TenantDocument;

  constructor(input: TenantDocument) {
    this.data = TenantDocumentSchema.parse(input);
  }

  static create(input: {
    uuid?: string;
    name: string;
    slug: string;
    ownerOperatorId: string;
  }): TenantModel {
    const now = new Date().toISOString();
    return new TenantModel({
      uuid: input.uuid ?? crypto.randomUUID(),
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      ownerOperatorId: input.ownerOperatorId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  get uuid() {
    return this.data.uuid;
  }

  get slug() {
    return this.data.slug;
  }

  setStatus(status: TenantDocument["status"]): void {
    this.data.status = status;
    this.data.updatedAt = new Date().toISOString();
    this.data.version += 1;
  }

  getData(): TenantDocument {
    return { ...this.data };
  }

  toPublic(): Tenant {
    return TenantSchema.parse(this.data);
  }
}
