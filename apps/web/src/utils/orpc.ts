import { createContext } from "@opai/context/procedure";
import { appRouter, type AppRouterClient } from "@opai/context/app-router";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });
}

// On the server, procedures run in-process; in the browser, over /api/rpc.
const getClient = createIsomorphicFn()
  .server((): AppRouterClient => createRouterClient(appRouter, { context: createContext }))
  .client((): AppRouterClient =>
    createORPCClient(new RPCLink({ url: `${window.location.origin}/api/rpc` })),
  );

export const client: AppRouterClient = getClient();

export const orpc = createTanstackQueryUtils(client);
