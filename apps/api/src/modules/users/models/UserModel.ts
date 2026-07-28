import { UserSchema, type User } from "@stock42/contracts/tenancy";
import { z } from "zod";

export const UserDocumentSchema = UserSchema.extend({
  passwordHash: z.string().min(1),
});
export type UserDocument = z.infer<typeof UserDocumentSchema>;

export class UserModel {
  private data: UserDocument;

  constructor(input: UserDocument) {
    this.data = UserDocumentSchema.parse(input);
  }

  static create(input: {
    tenantId: string;
    email: string;
    displayName: string;
    passwordHash: string;
  }): UserModel {
    const now = new Date().toISOString();
    return new UserModel({
      uuid: crypto.randomUUID(),
      tenantId: input.tenantId,
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

  get tenantId() {
    return this.data.tenantId;
  }

  get email() {
    return this.data.email;
  }

  get passwordHash() {
    return this.data.passwordHash;
  }

  setStatus(status: UserDocument["status"]): void {
    this.data.status = status;
    this.data.updatedAt = new Date().toISOString();
    this.data.version += 1;
  }

  getData(): UserDocument {
    return { ...this.data };
  }

  toPublic(): User {
    return UserSchema.parse(this.data);
  }
}
