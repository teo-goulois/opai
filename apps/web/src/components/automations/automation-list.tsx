import type {
  AgentAction,
  Automations,
  CodexAutomation,
  LaunchAgent,
  LaunchSchedule,
  MachineAutomations,
} from "@opai/context/automations";
import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { WarningIcon } from "@opai/ui/icon";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

const listClassName =
  "flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2";
const rowClassName =
  "flex flex-wrap items-start justify-between gap-x-m gap-y-xs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4";
const titleClassName = "font-ui text-m font-medium text-neutral-10";
const linkClassName =
  "w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10";

/** What the page can do to an automation of this machine. */
export type AutomationActions = {
  setStatus: (path: string, status: CodexAutomation["status"]) => void;
  archive: (path: string) => void;
  agent: (label: string, action: AgentAction) => void;
  /** The automation an action is running on: its path or label. */
  pending?: string;
  error?: string;
};

export function AutomationList({
  automations,
  actions,
}: {
  automations: Automations;
  actions: AutomationActions;
}) {
  const own = automations.launchd?.filter((agent) => !agent.fromApp) ?? [];
  const missing =
    automations.codex.filter((automation) => !automation.documented).length +
    own.filter((agent) => !agent.documented).length;
  const hasRegistry = automations.registries.length > 0;

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.automations_title()}</PageTitle>
        <PageDescription>{m.automations_description()}</PageDescription>
        <PageMeta>
          <span>{m.automations_codex_count({ count: automations.codex.length })}</span>
          {automations.launchd ? (
            <span>{m.automations_launchd_count({ count: own.length })}</span>
          ) : null}
          {automations.machines.length > 0 ? (
            <span>{m.automations_machines_count({ count: automations.machines.length })}</span>
          ) : null}
        </PageMeta>
      </PageHeader>

      {actions.error ? <Note tone="error">{actions.error}</Note> : null}
      {hasRegistry && missing > 0 ? (
        <Note tone="warning">{m.automations_missing({ count: missing })}</Note>
      ) : null}

      <PageSection aria-labelledby="automations-registry">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="automations-registry" count={automations.registries.length}>
            {m.automations_registry()}
          </PageSectionTitle>
          <p className="font-ui text-s text-neutral-7">{m.automations_registry_hint()}</p>
        </div>
        {hasRegistry ? (
          <ul className={listClassName}>
            {automations.registries.map((registry) => (
              <li key={registry.space}>
                <div className={rowClassName}>
                  <div className="flex min-w-0 flex-col gap-xxs">
                    <Link
                      to="/automations/$space"
                      params={{ space: registry.space }}
                      className={linkClassName}
                    >
                      {m.automations_registry_of({ space: registry.space })}
                    </Link>
                    <span className="font-data text-s text-neutral-7 wrap-anywhere">
                      {registry.path}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-ui text-s text-neutral-8">
            {m.automations_registry_none()}{" "}
            <span className="font-data">spaces/&lt;space&gt;/context/ops.md</span>
          </p>
        )}
      </PageSection>

      <MachineSections
        id="local"
        title={m.automations_this_machine()}
        automations={automations}
        checked={hasRegistry}
        actions={actions}
      />

      {automations.machines.map((name) => (
        <RemoteMachine key={name} name={name} checked={hasRegistry} />
      ))}
    </div>
  );
}

function Note({ tone, children }: { tone: "warning" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-xs rounded-s p-s font-ui text-s text-neutral-10 ${tone === "error" ? "bg-error-transparent" : "bg-warning-transparent"}`}
    >
      <WarningIcon aria-hidden className="mt-xxs shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{children}</p>
    </div>
  );
}

/** The Codex and launchd sections of one machine. Actions only on this one. */
function MachineSections({
  id,
  title,
  automations,
  checked,
  actions,
}: {
  id: string;
  title: string;
  automations: MachineAutomations;
  checked: boolean;
  actions?: AutomationActions;
}) {
  const own = automations.launchd?.filter((agent) => !agent.fromApp) ?? [];
  const apps = automations.launchd?.filter((agent) => agent.fromApp) ?? [];
  return (
    <PageSection aria-labelledby={`automations-${id}`}>
      <PageSectionTitle id={`automations-${id}`}>{title}</PageSectionTitle>
      <div className="flex flex-col gap-xs">
        <div className="flex flex-col gap-xxs">
          <h3 className="font-ui text-m font-medium text-neutral-9">{m.automations_codex()}</h3>
          <p className="font-ui text-s text-neutral-7">{m.automations_codex_hint()}</p>
        </div>
        {automations.codex.length > 0 ? (
          <ul className={listClassName}>
            {automations.codex.map((automation) => (
              <li key={automation.path}>
                <CodexRow automation={automation} checked={checked} actions={actions} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-ui text-s text-neutral-8">{m.automations_none()}</p>
        )}
      </div>
      {automations.launchd ? (
        <div className="flex flex-col gap-xs">
          <div className="flex flex-col gap-xxs">
            <h3 className="font-ui text-m font-medium text-neutral-9">{m.automations_launchd()}</h3>
            <p className="font-ui text-s text-neutral-7">{m.automations_launchd_hint()}</p>
          </div>
          {own.length > 0 ? (
            <ul className={listClassName}>
              {own.map((agent) => (
                <li key={agent.path}>
                  <LaunchRow agent={agent} checked={checked} actions={actions} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-ui text-s text-neutral-8">{m.automations_none()}</p>
          )}
          {apps.length > 0 ? (
            <Collapsible className="w-full">
              <CollapsibleTrigger>{m.automations_apps({ count: apps.length })}</CollapsibleTrigger>
              <CollapsiblePanel variant="plain">
                <ul className={listClassName}>
                  {apps.map((agent) => (
                    <li key={agent.path}>
                      <LaunchRow agent={agent} checked={false} />
                    </li>
                  ))}
                </ul>
              </CollapsiblePanel>
            </Collapsible>
          ) : null}
        </div>
      ) : null}
    </PageSection>
  );
}

/** Another machine, read through SSH when the page opens: a few seconds. */
function RemoteMachine({ name, checked }: { name: string; checked: boolean }) {
  const query = useQuery(
    orpc.automations.machine.queryOptions({
      input: { name },
      staleTime: 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }),
  );
  if (query.data) {
    return (
      <MachineSections
        id={`machine-${name}`}
        title={m.automations_machine({ name })}
        automations={query.data}
        checked={checked}
      />
    );
  }
  return (
    <PageSection aria-labelledby={`automations-machine-${name}`}>
      <PageSectionTitle id={`automations-machine-${name}`}>
        {m.automations_machine({ name })}
      </PageSectionTitle>
      {query.error ? (
        <Note tone="error">{m.automations_machine_failed({ message: query.error.message })}</Note>
      ) : (
        <div className="flex flex-col gap-xs" aria-busy="true">
          <p className="font-ui text-s text-neutral-7">{m.automations_machine_reading()}</p>
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </PageSection>
  );
}

function MissingBadge() {
  return <Badge variant="warning">{m.automations_not_in_registry()}</Badge>;
}

/** A button that asks before it acts. */
function Confirm({
  label,
  title,
  description,
  confirm,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirm: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" isPending={pending} />}>{label}</DialogTrigger>
      <DialogPopup closeLabel={m.close()} className="w-[min(480px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>{m.automations_cancel()}</DialogClose>
          <DialogClose render={<Button variant="danger" />} onClick={onConfirm}>
            {confirm}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function CodexRow({
  automation,
  checked,
  actions,
}: {
  automation: CodexAutomation;
  checked: boolean;
  actions?: AutomationActions | undefined;
}) {
  const pending = actions?.pending === automation.path;
  return (
    <div className={rowClassName}>
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-xxs">
        <div className="flex flex-wrap items-center gap-xs">
          <span className={titleClassName}>{automation.name}</span>
          {automation.ended ? (
            <Badge variant="neutral">{m.automations_ended()}</Badge>
          ) : automation.status === "paused" ? (
            <Badge variant="neutral">{m.automations_paused()}</Badge>
          ) : (
            <Badge variant="success">{m.automations_active()}</Badge>
          )}
          {checked && !automation.documented ? <MissingBadge /> : null}
        </div>
        <span className="font-data text-s text-neutral-7 wrap-anywhere">
          {automation.id} · {automation.schedule || m.automations_no_schedule()}
        </span>
        {automation.summary ? (
          <p className="max-w-prose font-ui text-s text-neutral-8 line-clamp-2">
            {automation.summary}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap gap-xs">
          <Button
            variant="secondary"
            isPending={pending}
            onClick={() =>
              actions.setStatus(
                automation.path,
                automation.status === "paused" ? "active" : "paused",
              )
            }
          >
            {automation.status === "paused" ? m.automations_resume() : m.automations_pause()}
          </Button>
          <Button
            variant="ghost"
            render={<Link to="/automations/codex" search={{ path: automation.path }} />}
          >
            {m.automations_edit()}
          </Button>
          <Confirm
            label={m.automations_archive()}
            title={m.automations_archive_title({ name: automation.name })}
            description={m.automations_archive_description()}
            confirm={m.automations_archive()}
            pending={pending}
            onConfirm={() => actions.archive(automation.path)}
          />
        </div>
      ) : null}
    </div>
  );
}

function scheduleText(schedule: LaunchSchedule) {
  const parts: string[] = [];
  if (schedule.everySeconds) {
    parts.push(
      schedule.everySeconds % 60 === 0
        ? m.automations_every_minutes({ count: schedule.everySeconds / 60 })
        : m.automations_every_seconds({ count: schedule.everySeconds }),
    );
  }
  for (const entry of schedule.calendar ?? []) {
    const time =
      entry.hour === undefined
        ? undefined
        : `${String(entry.hour).padStart(2, "0")}:${String(entry.minute ?? 0).padStart(2, "0")}`;
    parts.push(time ? m.automations_daily_at({ time }) : m.automations_calendar());
  }
  if (schedule.keepAlive) parts.push(m.automations_kept_alive());
  else if (schedule.atLoad) parts.push(m.automations_at_load());
  return parts.join(" · ") || m.automations_no_schedule();
}

function LaunchRow({
  agent,
  checked,
  actions,
}: {
  agent: LaunchAgent;
  checked: boolean;
  actions?: AutomationActions | undefined;
}) {
  const state = agent.state;
  const pending = actions?.pending === agent.label;
  return (
    <div className={rowClassName}>
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-xxs">
        <div className="flex flex-wrap items-center gap-xs">
          <span className={`${titleClassName} font-data`}>{agent.label}</span>
          {!state.loaded ? (
            <Badge variant="neutral">{m.automations_not_loaded()}</Badge>
          ) : state.pid ? (
            <Badge variant="success">{m.automations_running()}</Badge>
          ) : state.lastExit ? (
            <Badge variant="error">{m.automations_failed({ code: state.lastExit })}</Badge>
          ) : (
            <Badge variant="neutral">{m.automations_idle()}</Badge>
          )}
          {checked && !agent.documented ? <MissingBadge /> : null}
        </div>
        <span className="font-ui text-s text-neutral-8">{scheduleText(agent.schedule)}</span>
        <span className="font-data text-s text-neutral-7 wrap-anywhere">{agent.command}</span>
      </div>
      {actions && !agent.fromApp ? (
        <div className="flex flex-wrap gap-xs">
          {state.loaded ? (
            <>
              <Button
                variant="secondary"
                isPending={pending}
                onClick={() => actions.agent(agent.label, "restart")}
              >
                {m.automations_restart()}
              </Button>
              <Confirm
                label={m.automations_stop()}
                title={m.automations_stop_title({ label: agent.label })}
                description={m.automations_stop_description()}
                confirm={m.automations_stop()}
                pending={pending}
                onConfirm={() => actions.agent(agent.label, "stop")}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              isPending={pending}
              onClick={() => actions.agent(agent.label, "start")}
            >
              {m.automations_start()}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AutomationListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-40" />
        <Skeleton className="h-(--line-s) w-80" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
