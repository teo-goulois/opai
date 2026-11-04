import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

// The sites and apps the Analytics page compares, from analytics.json at the
// root of the instance: each one's project and where its numbers live, and
// the address of your own Umami. Umami website ids are public (they ship in
// each site's script tag), so they can be committed; API keys never are.
// Without the file, the page is empty.

export const UmamiInstance = z.enum(["self", "cloud"]);
export type UmamiInstance = z.infer<typeof UmamiInstance>;

export const AppId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

const CatalogApp = z.object({
  id: AppId,
  name: z.string().min(1),
  /** A label that groups apps, such as a company or a side project. */
  project: z.string().min(1),
  /** A site is a landing page or content site; an app is a product people use. */
  kind: z.enum(["site", "app"]),
  domain: z.string().nullable(),
  /** Folder of the code, relative to ~/Developer. */
  repo: z.string().nullable(),
  sources: z.object({
    /** `websiteId: null` means the site sends to Umami but its id is not known here. */
    umami: z.object({ instance: UmamiInstance, websiteId: z.string().nullable() }).optional(),
    /** Product apps on PostHog. Not read yet. */
    posthog: z.literal(true).optional(),
  }),
});
export type CatalogApp = z.infer<typeof CatalogApp>;

const Catalog = z.object({
  /** Your own Umami, the `self` instance, such as https://analytics.example.com. UMAMI_URL overrides it. */
  umamiUrl: z.url().optional(),
  apps: z.array(CatalogApp),
});
export type Catalog = z.infer<typeof Catalog>;

/** analytics.json, or no app when the instance has no such file. */
export function loadCatalog(root: string): Catalog {
  const path = join(root, "analytics.json");
  if (!existsSync(path)) return { apps: [] };
  return Catalog.parse(JSON.parse(readFileSync(path, "utf8")));
}
