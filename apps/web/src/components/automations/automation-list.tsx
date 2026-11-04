import type {
  Automations,
  CodexAutomation,
  LaunchAgent,
  LaunchSchedule,
} from "@opai/context/automations";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
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
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

const listClassName =
  "flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2";
const rowClassName =
  "flex flex-col gap-xxs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4";
const titleClassName = "font-ui text-m font-medium text-neutral-10";
const linkClassName =
  "w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10";

export function AutomationList({ automations }: { automations: Automations }) {
  const own = automations.launchd?.filter((agent) => !agent.fromApp) ?? [];
  const apps = automations.launchd?.filter((agent) => agent.fromApp) ?? [];
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
        </PageMeta>
      </PageHeader>

      {hasRegistry && missing > 0 ? (
        <div
          role="status"
          className="flex items-start gap-xs rounded-s bg-warning-transparent p-s font-ui text-s text-neutral-10"
        >
          <WarningIcon aria-hidden className="mt-xxs shrink-0" />
          <p className="min-w-0 flex-1">{m.automations_missing({ count: missing })}</p>
        </div>
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

      <PageSection aria-labelledby="automations-codex">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="automations-codex" count={automations.codex.length}>
            {m.automations_codex()}
          </PageSectionTitle>
          <p className="font-ui text-s text-neutral-7">{m.automations_codex_hint()}</p>
        </div>
        {automations.codex.length > 0 ? (
          <ul className={listClassName}>
            {automations.codex.map((automation) => (
              <li key={automation.path}>
                <CodexRow automation={automation} checked={hasRegistry} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-ui text-s text-neutral-8">{m.automations_none()}</p>
        )}
      </PageSection>

      {automations.launchd ? (
        <PageSection aria-labelledby="automations-launchd">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="automations-launchd" count={own.length}>
              {m.automations_launchd()}
            </PageSectionTitle>
            <p className="font-ui text-s text-neutral-7">{m.automations_launchd_hint()}</p>
          </div>
          {own.length > 0 ? (
            <ul className={listClassName}>
              {own.map((agent) => (
                <li key={agent.path}>
                  <LaunchRow agent={agent} checked={hasRegistry} />
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
        </PageSection>
      ) : null}
    </div>
  );
}

function MissingBadge() {
  return <Badge variant="warning">{m.automations_not_in_registry()}</Badge>;
}

function CodexRow({ automation, checked }: { automation: CodexAutomation; checked: boolean }) {
  return (
    <div className={rowClassName}>
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

function LaunchRow({ agent, checked }: { agent: LaunchAgent; checked: boolean }) {
  const state = agent.state;
  return (
    <div className={rowClassName}>
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
