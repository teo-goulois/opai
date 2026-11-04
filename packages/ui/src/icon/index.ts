// The only module the app imports icons from. It exports semantic names
// (SearchIcon, RulesIcon), the same in every set:
//
// - lucide.tsx, free, the default;
// - nucleo.generated.tsx, built from your own Nucleo library (README.md),
//   used by the app when it exists, or when OPAI_ICONS=nucleo.
//
// apps/web/vite.config.ts points #icon-set to the chosen set; type checks read
// lucide.tsx (package.json "imports").
export * from "#icon-set";
export type { IconProps } from "./props";
