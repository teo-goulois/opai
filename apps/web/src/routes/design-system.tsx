import { Button } from "@opai/ui/components/ui/button";
import { PageDescription, PageHeader, PageTitle } from "@opai/ui/components/ui/page-header";
import { tabLinkClassName, tabLinkListClassName } from "@opai/ui/components/ui/tabs";
import {
  FitViewIcon,
  MoonIcon,
  ResetViewIcon,
  SunIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@opai/ui/icon";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useRef } from "react";
import { z } from "zod";

import { ComponentCanvas, type CanvasControls } from "@/components/design-system/canvas";
import { DesignSystemCanvasGroups } from "@/components/design-system/design-system-canvas";
import { DesignSystemList } from "@/components/design-system/design-system-list";
import { useThemeToggle } from "@/components/shared/app-preferences";
import { m } from "@/paraglide/messages.js";

// Dev only: every component of the app, as a list or on a pan-and-zoom canvas.
export const Route = createFileRoute("/design-system")({
  validateSearch: z.object({
    view: z.enum(["list", "canvas"]).optional().catch(undefined),
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignSystemPage,
});

function ViewTabs({ view }: { view: "list" | "canvas" }) {
  return (
    <nav aria-label={m.view()} className={tabLinkListClassName}>
      <Link
        to="/design-system"
        search={{}}
        activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
        aria-current={view === "list" ? "page" : undefined}
        className={tabLinkClassName}
      >
        {m.design_system_tab_list()}
      </Link>
      <Link
        to="/design-system"
        search={{ view: "canvas" }}
        activeOptions={{ exact: true, includeSearch: true, explicitUndefined: true }}
        aria-current={view === "canvas" ? "page" : undefined}
        className={tabLinkClassName}
      >
        {m.design_system_tab_canvas()}
      </Link>
    </nav>
  );
}

function DesignSystemPage() {
  const { view = "list" } = Route.useSearch();
  return view === "canvas" ? <CanvasView /> : <ListView />;
}

function ListView() {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.design_system_title()}</PageTitle>
        <PageDescription>{m.design_system_description()}</PageDescription>
      </PageHeader>
      <ViewTabs view="list" />
      <DesignSystemList />
    </div>
  );
}

/** Fills the area right of the sidebar (below the top bar on phones). */
function CanvasView() {
  const controls = useRef<CanvasControls | null>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const toggleTheme = useThemeToggle();

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-0 flex flex-col md:start-64 md:top-0">
      <div className="flex flex-wrap items-end justify-between gap-x-l gap-y-xs bg-neutral-1 px-m pt-s sm:px-xl edge-bottom edge-neutral-4">
        <div className="flex items-end gap-l">
          <h1 className="pb-xs font-brand text-m font-medium text-neutral-10">
            {m.design_system_title()}
          </h1>
          <div className="[&>nav]:edge-transparent">
            <ViewTabs view="canvas" />
          </div>
        </div>
        <div
          role="toolbar"
          aria-label={m.canvas_toolbar()}
          className="flex items-center gap-xxs pb-xs"
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.canvas_zoom_out()}
            onClick={() => controls.current?.zoomBy(1 / 1.2)}
          >
            <ZoomOutIcon aria-hidden />
          </Button>
          <span
            ref={zoomLabel}
            aria-live="polite"
            className="min-w-12 text-center font-data text-s text-neutral-7"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.canvas_zoom_in()}
            onClick={() => controls.current?.zoomBy(1.2)}
          >
            <ZoomInIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.canvas_fit()}
            onClick={() => controls.current?.fit()}
          >
            <FitViewIcon aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.canvas_reset()}
            onClick={() => controls.current?.reset()}
          >
            <ResetViewIcon aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={m.theme_toggle()} onClick={toggleTheme}>
            <SunIcon aria-hidden className="dark:hidden" />
            <MoonIcon aria-hidden className="hidden dark:block" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ComponentCanvas
          storageKey="ai.design-system.canvas"
          label={m.canvas_label()}
          controlsRef={controls}
          zoomLabelRef={zoomLabel}
        >
          <DesignSystemCanvasGroups />
        </ComponentCanvas>
      </div>
    </div>
  );
}
