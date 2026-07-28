import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const IsoDateSchema = z.string().datetime({ offset: true });
export const EmailSchema = z.string().trim().toLowerCase().email().max(254);
export const StatusSchema = z.enum(["active", "inactive"]);

export const PaginationInputSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const PaginationMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int().positive(),
});

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_ERROR",
  "INTERNAL_ERROR",
]);

export const ApiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    errorId: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export const createSuccessSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    ok: z.literal(true),
    data,
  });

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type PaginationInput = z.infer<typeof PaginationInputSchema>;
export type Status = z.infer<typeof StatusSchema>;
