// Every procedure of the app: the context layer, the Spaces, Rules, Config,
// Sessions, Skills and Automations pages, the handbook, and analytics.
// The web app serves all of them; the MCP server only those mcp.ts lists.

import type { RouterClient } from "@orpc/server";

import { analyticsRouter } from "./routers/analytics.ts";
import { automationsRouter } from "./routers/automations.ts";
import { contextRouter } from "./routers/context.ts";
import { handbookRouter } from "./routers/handbook.ts";
import { sessionsRouter } from "./routers/sessions.ts";
import { skillsRouter } from "./routers/skills.ts";
import { workspaceRouter } from "./routers/workspace.ts";

export const appRouter = {
  ...contextRouter,
  ...workspaceRouter,
  sessions: sessionsRouter,
  skills: skillsRouter,
  automations: automationsRouter,
  handbook: handbookRouter,
  analytics: analyticsRouter,
};

export type AppRouterClient = RouterClient<typeof appRouter>;
