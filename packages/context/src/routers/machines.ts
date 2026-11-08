// The procedures behind the app's Machines page: the machines that share the
// instance, what each one has not shared, and the skills it uses; and "Sync
// now", which commits and pushes, so mcp.ts never offers it to agents.

import { listMachines } from "../machines.ts";
import { o } from "../procedure.ts";
import { syncNow } from "../sync-now.ts";

export const machinesRouter = {
  list: o.handler(({ context }) => listMachines(context.root)),
  sync: o.handler(({ context }) => syncNow(context.root)),
};
