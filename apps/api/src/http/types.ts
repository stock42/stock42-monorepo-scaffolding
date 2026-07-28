import type { Res } from "s42-core";

export type CoreRequest = {
  headers: Headers;
  realIp: string;
  query: Record<string, string>;
  body: unknown;
  url: string;
  method: string;
  params: Record<string, string>;
  formData: () => FormData;
};

export type CoreResponse = Res;

export type ControllerDefinition = {
  name: string;
  version: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: (request: CoreRequest, response: CoreResponse) => Promise<Response> | Response;
};
