import { Button } from "@opai/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
} from "@opai/ui/components/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@opai/ui/components/ui/menu";
import { MoreIcon, WarningIcon } from "@opai/ui/icon";
import { cn } from "@opai/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

import type { AutomationActions, Live, Tone } from "./automation-data";

const dotColors: Record<Tone | "unknown", string> = {
  ok: "bg-success",
  off: "bg-neutral-5",
  error: "bg-error",
  unknown: "border border-neutral-6",
};

/** Green when it runs or will, grey when off, red when its last run failed. */
export function StatusDot({ tone, label }: { tone: Tone | "unknown"; label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn("size-xs shrink-0 rounded-full", dotColors[tone])}
    />
  );
}

export function Note({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-xs rounded-s p-s font-ui text-s text-neutral-10",
        tone === "error" ? "bg-error-transparent" : "bg-warning-transparent",
      )}
    >
      <WarningIcon aria-hidden className="mt-xxs shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{children}</p>
    </div>
  );
}

type Confirming = "archive" | "stop" | undefined;

/** Asks before archiving a Codex automation or stopping an agent. */
function ConfirmDialog({
  live,
  confirming,
  onClose,
  actions,
}: {
  live: Live;
  confirming: Confirming;
  onClose: () => void;
  actions: AutomationActions;
}) {
  const archive = confirming === "archive" && live.kind === "codex";
  const text = archive
    ? {
        title: m.automations_archive_title({ name: live.codex.name }),
        description: m.automations_archive_description(),
        confirm: m.automations_archive(),
      }
    : {
        title: m.automations_stop_title({
          label: live.kind === "launchd" ? live.agent.label : "",
        }),
        description: m.automations_stop_description(),
        confirm: m.automations_stop(),
      };
  return (
    <Dialog open={confirming !== undefined} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogPopup closeLabel={m.close()} className="w-[min(480px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{text.title}</DialogTitle>
        <DialogDescription>{text.description}</DialogDescription>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>{m.automations_cancel()}</DialogClose>
          <DialogClose
            render={<Button variant="danger" />}
            onClick={() => {
              if (live.kind === "codex") actions.archive(live.codex.path);
              else actions.agent(live.agent.label, "stop");
            }}
          >
            {text.confirm}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Only this Mac's automations can be changed, and only your own agents. */
export function canAct(live: Live) {
  return live.machine === undefined && (live.kind === "codex" || !live.agent.fromApp);
}

/** The actions of a row, in a menu. */
export function LiveMenu({ live, actions }: { live: Live; actions: AutomationActions }) {
  const [confirming, setConfirming] = useState<Confirming>();
  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.automations_menu()}
              isPending={actions.pending === target(live)}
              className="relative z-10"
            />
          }
        >
          <MoreIcon aria-hidden />
        </MenuTrigger>
        <MenuPopup>
          {live.kind === "codex" ? (
            <>
              <MenuItem
                onClick={() =>
                  actions.setStatus(
                    live.codex.path,
                    live.codex.status === "paused" ? "active" : "paused",
                  )
                }
              >
                {live.codex.status === "paused" ? m.automations_resume() : m.automations_pause()}
              </MenuItem>
              <MenuItem
                render={<Link to="/automations/codex" search={{ path: live.codex.path }} />}
              >
                {m.automations_edit_file()}
              </MenuItem>
              <MenuSeparator />
              <MenuItem variant="danger" onClick={() => setConfirming("archive")}>
                {m.automations_archive()}
              </MenuItem>
            </>
          ) : live.agent.state.loaded ? (
            <>
              <MenuItem onClick={() => actions.agent(live.agent.label, "restart")}>
                {m.automations_restart()}
              </MenuItem>
              <MenuItem variant="danger" onClick={() => setConfirming("stop")}>
                {m.automations_stop()}
              </MenuItem>
            </>
          ) : (
            <MenuItem onClick={() => actions.agent(live.agent.label, "start")}>
              {m.automations_start()}
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
      <ConfirmDialog
        live={live}
        confirming={confirming}
        onClose={() => setConfirming(undefined)}
        actions={actions}
      />
    </>
  );
}

const target = (live: Live) => (live.kind === "codex" ? live.codex.path : live.agent.label);

/** The same actions as buttons, on an automation's page. */
export function LiveButtons({ live, actions }: { live: Live; actions: AutomationActions }) {
  const [confirming, setConfirming] = useState<Confirming>();
  const pending = actions.pending === target(live);
  return (
    <div className="flex flex-wrap gap-xs">
      {live.kind === "codex" ? (
        <>
          <Button
            variant="secondary"
            isPending={pending}
            onClick={() =>
              actions.setStatus(
                live.codex.path,
                live.codex.status === "paused" ? "active" : "paused",
              )
            }
          >
            {live.codex.status === "paused" ? m.automations_resume() : m.automations_pause()}
          </Button>
          <Button
            variant="ghost"
            render={<Link to="/automations/codex" search={{ path: live.codex.path }} />}
          >
            {m.automations_edit_file()}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming("archive")}>
            {m.automations_archive()}
          </Button>
        </>
      ) : live.agent.state.loaded ? (
        <>
          <Button
            variant="secondary"
            isPending={pending}
            onClick={() => actions.agent(live.agent.label, "restart")}
          >
            {m.automations_restart()}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming("stop")}>
            {m.automations_stop()}
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          isPending={pending}
          onClick={() => actions.agent(live.agent.label, "start")}
        >
          {m.automations_start()}
        </Button>
      )}
      <ConfirmDialog
        live={live}
        confirming={confirming}
        onClose={() => setConfirming(undefined)}
        actions={actions}
      />
    </div>
  );
}
