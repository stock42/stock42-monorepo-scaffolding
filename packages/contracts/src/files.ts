import { z } from "zod";
import { IsoDateSchema, UuidSchema, createSuccessSchema } from "./common";

export const UploadIntentInputSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum([
    "application/pdf",
    "text/csv",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]),
  size: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const UploadSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  ownerId: UuidSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["pending", "ready", "rejected", "deleted"]),
  createdAt: IsoDateSchema,
});

export const ArtifactSchema = z.object({
  uuid: UuidSchema,
  tenantId: UuidSchema,
  ownerId: UuidSchema,
  runId: UuidSchema.nullable(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: IsoDateSchema,
});

export const UploadIntentResponseSchema = createSuccessSchema(
  z.object({
    upload: UploadSchema,
    uploadUrl: z.string().startsWith("/"),
    requiredHeaders: z.record(z.string(), z.string()),
  }),
);
export const ArtifactResponseSchema = createSuccessSchema(ArtifactSchema);

export type Artifact = z.infer<typeof ArtifactSchema>;
export type Upload = z.infer<typeof UploadSchema>;
export type UploadIntentInput = z.infer<typeof UploadIntentInputSchema>;
