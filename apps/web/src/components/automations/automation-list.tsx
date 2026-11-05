import type { Automations, RegistryEntry } from "@opai/context/automations";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Hint } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";

import {
  allLives,
  field,
  liveDocumented,
  liveEntry,
  liveKey,
  liveName,
  liveSchedule,
  liveStatus,
  liveWhat,
  machineLives,
  sameEntry,
  sharedEntries,
  type AutomationActions,
  type Live,
  type Machine,
} from "./automation-data";
import { canAct, LiveMenu, Note, StatusDot } from "./automation-parts";

const titleLinkClassName =
  "min-w-0 truncate rounded-xs outline-none after:absolute after:inset-0 after:rounded-s focus-visible:focus-ring";

export function AutomationList({
  automations,
  machines,
  actions,
}: {
  automations: Automations;
  machines: Machine[];
  actions: AutomationActions;
}) {
  const lives = allLives(machines);
  const statuses = lives.map(liveStatus);
  const count = (tone: string) => statuses.filter((status) => status.tone === tone).length;
  const hasRegistry = automations.registries.length > 0;
  const missing = lives.filter((live) => !liveDocumented(live)).length;
  const settled = machines.every((machine) => machine.automations || machine.error);
  const unseen = automations.entries.filter(
    (entry) => !lives.some((live) => sameEntry(liveEntry(live), entry)),
  );

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.automations_title()}</PageTitle>
        <PageDescription className="text-pretty">{m.automations_description()}</PageDescription>
        <PageMeta>
          <span className="inline-flex items-center gap-xxs">
            <StatusDot tone="ok" />
            {m.automations_summary_on({ count: count("ok") })}
          </span>
          <span className="inline-flex items-center gap-xxs">
            <StatusDot tone="off" />
            {m.automations_summary_off({ count: count("off") })}
          </span>
          {count("error") > 0 ? (
            <span className="inline-flex items-center gap-xxs">
              <StatusDot tone="error" />
              {m.automations_summary_failing({ count: count("error") })}
            </span>
          ) : null}
        </PageMeta>
      </PageHeader>

      {actions.error ? <Note tone="error">{actions.error}</Note> : null}
      {hasRegistry && missing > 0 ? (
        <Note tone="warning">{m.automations_missing({ count: missing })}</Note>
      ) : null}

      {machines.map((machine) => (
        <MachineSection
          key={machine.name ?? ""}
          machine={machine}
          entries={automations.entries}
          checked={hasRegistry}
          actions={actions}
        />
      ))}

      {automations.entries.length > 0 ? (
        <PageSection aria-labelledby="automations-unseen">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="automations-unseen" count={settled ? unseen.length : undefined}>
              {m.automations_registry_only()}
            </PageSectionTitle>
            <Hint>{m.automations_registry_only_hint()}</Hint>
          </div>
          {!settled ? (
            <Skeleton className="h-24 w-full" />
          ) : unseen.length > 0 ? (
            <ItemList>
              {unseen.map((entry) => (
                <li key={`${entry.space}:${entry.id}`}>
                  <EntryRow entry={entry} />
                </li>
              ))}
            </ItemList>
          ) : (
            <Hint>{m.automations_none()}</Hint>
          )}
        </PageSection>
      ) : null}

      <PageSection aria-labelledby="automations-registry">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="automations-registry">{m.automations_registry()}</PageSectionTitle>
          <Hint>{m.automations_registry_hint()}</Hint>
        </div>
        {hasRegistry ? (
          <ItemList>
            {automations.registries.map((registry) => (
              <li key={registry.space}>
                <ItemRow
                  render={<Link to="/automations/$space" params={{ space: registry.space }} />}
                >
                  <ItemMain>
                    <ItemTitle>{m.automations_registry_of({ space: registry.space })}</ItemTitle>
                    <ItemDescription className="wrap-anywhere">{registry.path}</ItemDescription>
                  </ItemMain>
                  <ItemEnd>
                    {m.automations_registry_entries({
                      count: automations.entries.filter((entry) => entry.space === registry.space)
                        .length,
                    })}
                  </ItemEnd>
                </ItemRow>
              </li>
            ))}
          </ItemList>
        ) : (
          <Hint>{m.automations_registry_none()} spaces/&lt;space&gt;/context/ops.md</Hint>
        )}
      </PageSection>
    </div>
  );
}

/** A machine: its Codex automations, then its launchd agents. */
function MachineSection({
  machine,
  entries,
  checked,
  actions,
}: {
  machine: Machine;
  entries: RegistryEntry[];
  checked: boolean;
  actions: AutomationActions;
}) {
  const id = `automations-${machine.name ?? "local"}`;
  const title = machine.name ?? m.automations_this_machine();
  const lives = machine.automations ? machineLives(machine.automations, machine.name) : undefined;
  const shared = sharedEntries(lives ? [...lives.codex, ...lives.launchd] : []);
  return (
    <PageSection aria-labelledby={id}>
      <PageSectionTitle
        id={id}
        count={lives ? lives.codex.length + lives.launchd.length : undefined}
      >
        {title}
      </PageSectionTitle>
      {machine.error ? (
        <Note tone="error">{m.automations_machine_failed({ message: machine.error.message })}</Note>
      ) : !lives || !machine.automations ? (
        <div className="flex flex-col gap-xs" aria-busy="true">
          <Hint>{m.automations_machine_reading()}</Hint>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-l">
          {lives.codex.length > 0 ? (
            <Group title={m.automations_codex()} hint={m.automations_codex_hint()}>
              {lives.codex.map((live) => (
                <li key={liveKey(live)}>
                  <LiveRow live={live} entries={entries} checked={checked} actions={actions} />
                </li>
              ))}
            </Group>
          ) : null}
          {machine.automations.launchd ? (
            <Group title={m.automations_launchd()} hint={m.automations_launchd_hint()}>
              {lives.launchd.map((live) => (
                <li key={liveKey(live)}>
                  <LiveRow
                    live={live}
                    entries={entries}
                    checked={checked}
                    actions={actions}
                    label={shared(live)}
                  />
                </li>
              ))}
            </Group>
          ) : null}
          {lives.apps.length > 0 ? (
            <Collapsible className="w-full">
              <CollapsibleTrigger>
                {m.automations_apps({ count: lives.apps.length })}
              </CollapsibleTrigger>
              <CollapsiblePanel variant="plain">
                <ItemList>
                  {lives.apps.map((live) => (
                    <li key={liveKey(live)}>
                      <LiveRow live={live} entries={entries} checked={false} />
                    </li>
                  ))}
                </ItemList>
              </CollapsiblePanel>
            </Collapsible>
          ) : null}
        </div>
      )}
    </PageSection>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <h3 className="flex items-baseline gap-xs font-ui text-s font-medium text-neutral-8">
        {title}
        <span className="font-regular text-neutral-6">{hint}</span>
      </h3>
      <ItemList>{children}</ItemList>
    </div>
  );
}

/** Where its name leads: its entry, else (a Codex automation here) its file. */
function LiveTitle({ live, name }: { live: Live; name: string }) {
  const entry = liveEntry(live);
  if (entry) {
    return (
      <Link
        to="/automations/$space/$entry"
        params={{ space: entry.space, entry: entry.id }}
        className={titleLinkClassName}
      >
        {name}
      </Link>
    );
  }
  if (live.kind === "codex" && live.machine === undefined) {
    return (
      <Link
        to="/automations/codex"
        search={{ path: live.codex.path }}
        className={titleLinkClassName}
      >
        {name}
      </Link>
    );
  }
  return <span className="min-w-0 truncate">{name}</span>;
}

function LiveRow({
  live,
  entries,
  checked,
  actions,
  label = false,
}: {
  live: Live;
  entries: RegistryEntry[];
  checked: boolean;
  actions?: AutomationActions;
  /** Show its launchd label: another agent shares its entry. */
  label?: boolean;
}) {
  const status = liveStatus(live);
  const schedule = liveSchedule(live);
  return (
    <ItemRow className="relative has-[a]:hover:bg-neutral-3">
      <StatusDot tone={status.tone} label={status.label} />
      <ItemMain>
        <ItemTitle>
          <LiveTitle live={live} name={liveName(live, entries)} />
          {label && live.kind === "launchd" ? (
            <span className="min-w-0 truncate font-regular text-s text-neutral-7">
              {live.agent.label}
            </span>
          ) : null}
          {status.tone === "error" ? (
            <Badge variant="error">{status.label}</Badge>
          ) : status.tone === "off" ? (
            <Badge variant="neutral">{status.label}</Badge>
          ) : null}
          {checked && !liveDocumented(live) ? (
            <Badge variant="warning">{m.automations_not_in_registry()}</Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription className="line-clamp-1 wrap-anywhere">
          {liveWhat(live, entries)}
        </ItemDescription>
        <span className="font-ui text-s text-neutral-8 sm:hidden">{schedule}</span>
      </ItemMain>
      <ItemEnd className="max-w-64 text-end text-neutral-8 max-sm:hidden">{schedule}</ItemEnd>
      {actions && canAct(live) ? <LiveMenu live={live} actions={actions} /> : null}
    </ItemRow>
  );
}

/** An entry Opai cannot see run: who runs it, and what it does. */
function EntryRow({ entry }: { entry: RegistryEntry }) {
  const manager = field(entry, "Manager")
    ?.split(/[,(;:]/)[0]
    ?.trim();
  return (
    <ItemRow className="relative hover:bg-neutral-3">
      <StatusDot tone="unknown" />
      <ItemMain>
        <ItemTitle>
          <Link
            to="/automations/$space/$entry"
            params={{ space: entry.space, entry: entry.id }}
            className={titleLinkClassName}
          >
            {entry.title}
          </Link>
        </ItemTitle>
        <ItemDescription className="line-clamp-1">
          {field(entry, "What") ?? field(entry, "Trigger") ?? ""}
        </ItemDescription>
      </ItemMain>
      {manager ? <ItemEnd className="max-sm:hidden">{manager}</ItemEnd> : null}
    </ItemRow>
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
