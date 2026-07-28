import type { ControllerDefinition, CoreRequest, CoreResponse } from "./types";
import { errorResponse } from "@/errors/handler";

export function controller(
  definition: Omit<ControllerDefinition, "handler"> & {
    handler: (request: CoreRequest, response: CoreResponse) => Promise<Response> | Response;
  },
): ControllerDefinition {
  return {
    ...definition,
    async handler(request, response) {
      try {
        return await definition.handler(request, response);
      } catch (cause) {
        return errorResponse(cause, {
          method: request.method,
          path: request.url,
          realIp: request.realIp,
        });
      }
    },
  };
}
