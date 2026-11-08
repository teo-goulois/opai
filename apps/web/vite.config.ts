import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// The icon set behind @opai/ui/icon: Nucleo when it is built on this machine
// (packages/ui/src/icon/README.md), Lucide otherwise. OPAI_ICONS forces one.
const nucleo = fileURLToPath(
  new URL("../../packages/ui/src/icon/nucleo.generated.tsx", import.meta.url),
);
const icons = process.env.OPAI_ICONS || (existsSync(nucleo) ? "nucleo" : "lucide");
if (icons === "nucleo" && !existsSync(nucleo)) {
  throw new Error(
    "OPAI_ICONS=nucleo, but the Nucleo set is not built: pnpm --filter @opai/ui icons",
  );
}

export default defineConfig({
  // Localhost only: the app reads and writes the instance, with no login.
  server: {
    host: "127.0.0.1",
    port: 4748,
    strictPort: true,
    allowedHosts: ["opai.localify", ".opai.localify"],
  },
  preview: { host: "127.0.0.1", port: 4748, strictPort: true },
  resolve: {
    tsconfigPaths: true,
    alias: icons === "nucleo" ? [{ find: /^#icon-set$/, replacement: nucleo }] : [],
  },
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
      outputStructure: "message-modules",
      cookieName: "OPAI_LOCALE",
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
