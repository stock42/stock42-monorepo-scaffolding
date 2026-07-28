import { z } from "zod";
import { EmailSchema, UuidSchema, createSuccessSchema } from "./common";

export const ActorKindSchema = z.enum(["administrator", "operator", "user"]);
export const ActorRoleSchema = z.enum([
  "platform_admin",
  "tenant_owner",
  "tenant_operator",
  "tenant_user",
]);

export const SessionActorSchema = z.object({
  uuid: UuidSchema,
  kind: ActorKindSchema,
  role: ActorRoleSchema,
  tenantId: UuidSchema.nullable(),
  email: EmailSchema,
  displayName: z.string().min(1).max(120),
});

export const CsrfResponseSchema = createSuccessSchema(
  z.object({
    csrfToken: z.string().min(32),
  }),
);

export const LoginInputSchema = z
  .object({
    actorKind: ActorKindSchema,
    email: EmailSchema,
    password: z.string().min(8).max(256),
    tenantSlug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.actorKind !== "administrator" && !value.tenantSlug) {
      context.addIssue({
        code: "custom",
        path: ["tenantSlug"],
        message: "tenantSlug es obligatorio para actores de tenant",
      });
    }
  });

export const AuthResponseSchema = createSuccessSchema(
  z.object({
    actor: SessionActorSchema,
    csrfToken: z.string().min(32),
  }),
);

export const MeResponseSchema = createSuccessSchema(
  z.object({
    actor: SessionActorSchema,
  }),
);

export type ActorKind = z.infer<typeof ActorKindSchema>;
export type ActorRole = z.infer<typeof ActorRoleSchema>;
export type LoginInput = z.infer<typeof LoginInputSchema>;
export type SessionActor = z.infer<typeof SessionActorSchema>;
