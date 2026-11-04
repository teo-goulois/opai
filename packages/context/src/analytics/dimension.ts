import { z } from "zod";

// The breakdowns of one app, as Umami names them. Region and city are left
// out: this instance has no city database and returns nothing for them.
export const Dimension = z.enum([
  "path",
  "entry",
  "exit",
  "title",
  "referrer",
  "channel",
  "query",
  "browser",
  "os",
  "device",
  "screen",
  "country",
  "language",
  "event",
]);
export type Dimension = z.infer<typeof Dimension>;
