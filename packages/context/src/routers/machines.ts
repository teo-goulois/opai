// The procedure behind the app's Machines page: the machines that share the
// instance, what each one has not shared, and the skills it uses.

import { listMachines } from "../machines.ts";
import { o } from "../procedure.ts";

export const machinesRouter = {
  list: o.handler(({ context }) => listMachines(context.root)),
};
