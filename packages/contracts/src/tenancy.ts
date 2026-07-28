import { z } from "zod";
import {
  EmailSchema,
  IsoDateSchema,
  PaginationMetaSchema,
  StatusSchema,
  UuidSchema,
  createSuccessSchema,
} from "./common";

const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(2)
  .max(80);

export const AdministratorSchema = z.object({
  uuid: UuidSchema,
  email: EmailSchema,
  displayName: z.string().min(1).max(120),
  status: StatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateAdministratorInputSchema = z.object({
  email: EmailSchema,
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(256),
});

export const TenantSchema = z.object({
  uuid: UuidSchema,
  name: z.string().min(1).max(160),
  slug: SlugSchema,
  status: StatusSchema,
  ownerOperatorId: UuidSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const OperatorSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  email: EmailSchema,
  displayName: z.string().min(1).max(120),
  role: z.enum(["owner", "operator"]),
  status: StatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const UserSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  email: EmailSchema,
  displayName: z.string().min(1).max(120),
  status: StatusSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  version: z.number().int().positive(),
});

export const CreateTenantInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: SlugSchema,
  owner: z.object({
    email: EmailSchema,
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(256),
  }),
});

export const CreateOperatorInputSchema = z.object({
  email: EmailSchema,
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(256),
});

export const CreateUserInputSchema = CreateOperatorInputSchema;

export const UpdateStatusInputSchema = z.object({
  status: StatusSchema,
  expectedVersion: z.number().int().positive(),
});

export const TenantResponseSchema = createSuccessSchema(TenantSchema);
export const OperatorResponseSchema = createSuccessSchema(OperatorSchema);
export const UserResponseSchema = createSuccessSchema(UserSchema);
export const TenantListResponseSchema = createSuccessSchema(
  z.object({
    items: z.array(TenantSchema),
    pagination: PaginationMetaSchema,
  }),
);
export const OperatorListResponseSchema = createSuccessSchema(
  z.object({
    items: z.array(OperatorSchema),
    pagination: PaginationMetaSchema,
  }),
);
export const UserListResponseSchema = createSuccessSchema(
  z.object({
    items: z.array(UserSchema),
    pagination: PaginationMetaSchema,
  }),
);

export type Administrator = z.infer<typeof AdministratorSchema>;
export type CreateAdministratorInput = z.infer<typeof CreateAdministratorInputSchema>;
export type CreateOperatorInput = z.infer<typeof CreateOperatorInputSchema>;
export type CreateTenantInput = z.infer<typeof CreateTenantInputSchema>;
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;
export type Operator = z.infer<typeof OperatorSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type User = z.infer<typeof UserSchema>;
