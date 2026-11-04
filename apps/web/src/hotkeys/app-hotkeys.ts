import { defineAppHotkeys, type CustomHotkeys } from "@tanstack/react-hotkeys";

// Every shortcut of the app, with its default. The user's overrides are saved
// in localStorage and applied by HotkeysProvider; the palette shows the
// effective binding. A screen to rebind them comes with the settings page.
export const appHotkeys = defineAppHotkeys({
  "palette.open": {
    hotkey: "Mod+K",
    meta: { name: "Open the command palette" },
    options: { preventDefault: true, requireReset: true },
  },
  "theme.toggle": {
    hotkey: "D",
    meta: { name: "Switch theme" },
    options: { preventDefault: true, requireReset: true },
  },
  "document.save": {
    hotkey: "Mod+S",
    meta: { name: "Save the document" },
    // Works while typing in the Markdown field.
    options: { preventDefault: true, ignoreInputs: false },
  },
});

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}

const storageKey = "ai.hotkeys";

export function readCustomHotkeys(): CustomHotkeys | null {
  if (typeof window === "undefined") return null;
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    // HotkeysProvider validates each entry and ignores invalid ones.
    return saved && typeof saved === "object" ? (saved as CustomHotkeys) : null;
  } catch {
    return null;
  }
}

export function saveCustomHotkeys(custom: CustomHotkeys) {
  window.localStorage.setItem(storageKey, JSON.stringify(custom));
}
