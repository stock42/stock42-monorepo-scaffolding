import { OperatorSchema, type Operator } from "@stock42/contracts/tenancy";
import { z } from "zod";

export const OperatorDocumentSchema = OperatorSchema.extend({
  passwordHash: z.string().min(1),
});
export type OperatorDocument = z.infer<typeof OperatorDocumentSchema>;

export class OperatorModel {
  private data: OperatorDocument;

  constructor(input: OperatorDocument) {
    this.data = OperatorDocumentSchema.parse(input);
  }

  static create(input: {
    uuid?: string;
    tenantId: string;
    email: string;
    displayName: string;
    role: "owner" | "operator";
    passwordHash: string;
  }): OperatorModel {
    const now = new Date().toISOString();
    return new OperatorModel({
      uuid: input.uuid ?? crypto.randomUUID(),
      tenantId: input.tenantId,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      role: input.role,
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

  get tenantId() {
    return this.data.tenantId;
  }

  get email() {
    return this.data.email;
  }

  get passwordHash() {
    return this.data.passwordHash;
  }

  get role() {
    return this.data.role;
  }

  setStatus(status: OperatorDocument["status"]): void {
    this.data.status = status;
    this.data.updatedAt = new Date().toISOString();
    this.data.version += 1;
  }

  getData(): OperatorDocument {
    return { ...this.data };
  }

  toPublic(): Operator {
    return OperatorSchema.parse(this.data);
  }
}
