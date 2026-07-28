import { z } from "zod";
import { UuidSchema, createSuccessSchema } from "./common";

export const WebSocketTicketResponseSchema = createSuccessSchema(
  z.object({
    ticket: z.string().min(32),
    expiresAt: z.string().datetime({ offset: true }),
  }),
);

export const WebSocketClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    requestId: z.string().min(1).max(100),
    channel: z.string().regex(/^agent:run:[0-9a-f-]{36}$/),
    cursor: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    requestId: z.string().min(1).max(100),
    channel: z.string().min(1).max(160),
  }),
  z.object({
    type: z.literal("ping"),
    requestId: z.string().min(1).max(100),
  }),
]);

export const WebSocketServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    connectionId: UuidSchema,
  }),
  z.object({
    type: z.literal("ack"),
    requestId: z.string().min(1),
    channel: z.string().optional(),
  }),
  z.object({
    type: z.literal("event"),
    channel: z.string().min(1),
    cursor: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("pong"),
    requestId: z.string().min(1),
  }),
  z.object({
    type: z.literal("error"),
    requestId: z.string().optional(),
    code: z.string().min(1),
    message: z.string().min(1),
  }),
]);

export type WebSocketClientMessage = z.infer<typeof WebSocketClientMessageSchema>;
export type WebSocketServerMessage = z.infer<typeof WebSocketServerMessageSchema>;
