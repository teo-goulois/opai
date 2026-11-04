import { Button } from "@opai/ui/components/ui/button";
import {
  SidebarSheet,
  SidebarSheetPopup,
  SidebarSheetTitle,
  SidebarSheetTrigger,
} from "@opai/ui/components/ui/sidebar";
import { SidebarIcon } from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex min-h-svh">
      {/* Desktop: a fixed column. Phones: the same sidebar in a sheet. */}
      <div className="sticky top-0 hidden h-svh w-64 shrink-0 md:block">
        <AppSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col md:edge-start md:edge-neutral-4">
        <header className="sticky top-0 z-10 flex items-center gap-xs bg-neutral-1 px-s py-xs edge-bottom edge-neutral-4 md:hidden">
          <SidebarSheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SidebarSheetTrigger
              render={<Button variant="ghost" size="icon" aria-label={m.sidebar_open()} />}
            >
              <SidebarIcon aria-hidden />
            </SidebarSheetTrigger>
            <SidebarSheetPopup>
              <SidebarSheetTitle>{m.sidebar_title()}</SidebarSheetTitle>
              <AppSidebar onNavigate={() => setSheetOpen(false)} />
            </SidebarSheetPopup>
          </SidebarSheet>
          <Link to="/" className="rounded-xs font-data text-m font-medium">
            {m.app_name()}
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-m py-l sm:px-xl sm:py-xl">
          {children}
        </main>
      </div>
    </div>
  );
}
