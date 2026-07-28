import type { ApiErrorCodeSchema } from "@stock42/contracts/common";
import type { z } from "zod";

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
