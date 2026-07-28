import { z } from "zod";
import type { AgentConfig } from "@/config";

const TelegramMessageSchema = z.object({
  message_id: z.number().int().nonnegative(),
  date: z.number().int().nonnegative(),
  text: z.string().optional(),
  from: z
    .object({
      id: z.number().int().safe(),
      is_bot: z.boolean(),
    })
    .optional(),
  chat: z.object({
    id: z.number().int().safe(),
    type: z.enum(["private", "group", "supergroup", "channel"]),
  }),
});

export const TelegramUpdateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: TelegramMessageSchema.optional(),
});

const TelegramUpdatesResponseSchema = z.object({
  ok: z.literal(true),
  result: z.array(TelegramUpdateSchema),
});

const TelegramMessageResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    message_id: z.number().int().nonnegative(),
  }),
});

const TelegramErrorResponseSchema = z.object({
  ok: z.literal(false),
  error_code: z.number().int().optional(),
  description: z.string().optional(),
  parameters: z
    .object({
      retry_after: z.number().int().positive().optional(),
    })
    .optional(),
});

export type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

export class TelegramApiError extends Error {
  constructor(
    readonly code: number | null,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

function redactTelegramToken(message: string, botToken: string | undefined): string {
  if (botToken) {
    return message
      .replaceAll(botToken, "[REDACTED]")
      .replaceAll(encodeURIComponent(botToken), "[REDACTED]");
  }
  return message;
}

export function sanitizedTelegramError(
  cause: unknown,
  botToken: string | undefined,
  fallback: string,
): string {
  const message = redactTelegramToken(
    cause instanceof TelegramApiError ? cause.message : fallback,
    botToken,
  );
  return message.slice(0, 240);
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

export class TelegramClient {
  constructor(
    private readonly config: AgentConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async getUpdates(
    input: { offset: number; timeoutSeconds: number },
    signal?: AbortSignal,
  ): Promise<TelegramUpdate[]> {
    const payload = await this.call(
      "getUpdates",
      {
        offset: input.offset,
        limit: 100,
        timeout: input.timeoutSeconds,
        allowed_updates: ["message"],
      },
      signal,
      (input.timeoutSeconds + 5) * 1_000,
    );
    return TelegramUpdatesResponseSchema.parse(payload).result;
  }

  async sendMessage(chatId: string, text: string, signal?: AbortSignal): Promise<string> {
    const payload = await this.call("sendMessage", { chat_id: chatId, text }, signal, 10_000);
    return String(TelegramMessageResponseSchema.parse(payload).result.message_id);
  }

  private async call(
    method: "getUpdates" | "sendMessage",
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<unknown> {
    const token = this.config.telegram.botToken;
    if (!token) throw new TelegramApiError(null, "Telegram no está configurado.");

    const requestSignal = combinedSignal(signal, timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(
        new URL(`/bot${token}/${method}`, this.config.telegram.apiBaseUrl),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: requestSignal.signal,
        },
      );
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new TelegramApiError(null, "No fue posible contactar Telegram.");
    } finally {
      requestSignal.cleanup();
    }

    const payload: unknown = await response.json().catch(() => null);
    const telegramError = TelegramErrorResponseSchema.safeParse(payload);
    if (!response.ok || telegramError.success) {
      throw new TelegramApiError(
        telegramError.success
          ? (telegramError.data.error_code ?? response.status)
          : response.status,
        redactTelegramToken(
          telegramError.success
            ? (telegramError.data.description ?? "Telegram rechazó la operación.")
            : "Telegram respondió inválidamente.",
          token,
        ),
        telegramError.success ? (telegramError.data.parameters?.retry_after ?? null) : null,
      );
    }
    return payload;
  }
}
