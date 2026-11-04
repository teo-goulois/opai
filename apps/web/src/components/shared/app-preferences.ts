import { useTheme } from "next-themes";
import { useCallback } from "react";

import { getLocale, locales, setLocale } from "@/paraglide/runtime.js";

export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return useCallback(
    () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    [resolvedTheme, setTheme],
  );
}

/** Switches to the next locale. Paraglide saves it in a cookie and reloads. */
export function toggleLocale() {
  const current = getLocale();
  const next = locales[(locales.indexOf(current) + 1) % locales.length] ?? current;
  void setLocale(next);
}
