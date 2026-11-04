import { createContext } from "@opai/context/procedure";
import { appRouter } from "@opai/context/app-router";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createFileRoute } from "@tanstack/react-router";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError((error) => console.error(error))],
});

// OpenAPI spec and reference at /api/rpc/api-reference.
const openApiHandler = new OpenAPIHandler(appRouter, {
  plugins: [new OpenAPIReferencePlugin({ schemaConverters: [new ZodToJsonSchemaConverter()] })],
  interceptors: [onError((error) => console.error(error))],
});

async function handle({ request }: { request: Request }) {
  const rpc = await rpcHandler.handle(request, { prefix: "/api/rpc", context: createContext() });
  if (rpc.response) return rpc.response;

  const openApi = await openApiHandler.handle(request, {
    prefix: "/api/rpc/api-reference",
    context: createContext(),
  });
  if (openApi.response) return openApi.response;

  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/rpc/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
