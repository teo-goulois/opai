import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";

import { appHotkeys, readCustomHotkeys, saveCustomHotkeys } from "@/hotkeys/app-hotkeys";

import { CommandPaletteProvider } from "./command-palette";

export function AppProviders({ children }: { children: ReactNode }) {
  // Read once on the client; the provider owns the state afterwards.
  const [customHotkeys] = useState(readCustomHotkeys);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <HotkeysProvider
        appHotkeys={appHotkeys}
        customHotkeys={customHotkeys}
        onCustomHotkeysChange={saveCustomHotkeys}
      >
        <CommandPaletteProvider>{children}</CommandPaletteProvider>
      </HotkeysProvider>
    </ThemeProvider>
  );
}
