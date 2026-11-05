import type { Automations, EntryFile } from "@opai/context/automations";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import {
  ItemDescription,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import {
  PageDescription,
  PageHeader,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { modelSource } from "@/components/sessions/session-source";
import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { Hint } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";

import {
  allLives,
  field,
  liveEntry,
  liveKey,
  liveSchedule,
  liveStatus,
  liveWhere,
  sameEntry,
  type AutomationActions,
  type Live,
  type Machine,
} from "./automation-data";
import { canAct, LiveButtons, Note, StatusDot } from "./automation-parts";
import { EntryPreview } from "./entry-preview";

/** One automation: where it runs and in what state, then its entry in the registry. */
export function AutomationEntry({
  entry,
  automations,
  machines,
  actions,
  view,
  onViewChange,
  onSave,
  onReload,
}: {
  entry: EntryFile;
  automations: Automations;
  machines: Machine[];
  actions: AutomationActions;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  onSave: (markdown: string, baseHash: string) => Promise<unknown>;
  onReload: () => Promise<unknown>;
}) {
  const lives = allLives(machines).filter((live) => sameEntry(liveEntry(live), entry));
  const settled = machines.every((machine) => machine.automations || machine.error);
  const what = field(entry, "What");
  const manager = field(entry, "Manager")?.replace(/\.+$/, "");
  const registry = automations.registries.find((item) => item.space === entry.space);

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/automations" />}>
                {m.nav_automations()}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{entry.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle className="text-pretty">{entry.title}</PageTitle>
          {what ? (
            <PageDescription className="line-clamp-2 text-pretty">{what}</PageDescription>
          ) : null}
        </PageHeader>
      </div>

      {actions.error ? <Note tone="error">{actions.error}</Note> : null}

      <PageSection aria-labelledby="entry-runs">
        <PageSectionTitle id="entry-runs">{m.automations_where_title()}</PageSectionTitle>
        {lives.length > 0 ? (
          <ItemList>
            {lives.map((live) => (
              <li key={liveKey(live)}>
                <LiveCard live={live} actions={actions} />
              </li>
            ))}
          </ItemList>
        ) : settled ? (
          <Hint>
            {manager ? m.automations_unseen_manager({ manager }) : m.automations_unseen()}
          </Hint>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </PageSection>

      {lives.map((live) =>
        live.kind === "codex" && live.codex.prompt ? (
          <Collapsible key={`prompt:${liveKey(live)}`} className="w-full">
            <CollapsibleTrigger>{m.automations_prompt()}</CollapsibleTrigger>
            <CollapsiblePanel variant="plain">
              <p className="max-w-prose rounded-m bg-neutral-2 p-m font-ui text-s whitespace-pre-wrap text-pretty text-neutral-9 dark:bg-neutral-3">
                {live.codex.prompt}
              </p>
            </CollapsiblePanel>
          </Collapsible>
        ) : null,
      )}

      <PageSection aria-labelledby="entry-registry">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="entry-registry">{m.automations_entry_section()}</PageSectionTitle>
          <Hint>
            {m.automations_entry_hint({ path: entry.path })}{" "}
            {registry ? (
              <Link
                to="/automations/$space"
                params={{ space: entry.space }}
                className="rounded-xs underline decoration-neutral-5 underline-offset-4 hover:text-neutral-10 hover:decoration-neutral-10 focus-visible:focus-ring"
              >
                {m.automations_open_registry()}
              </Link>
            ) : null}
          </Hint>
        </div>
        <DocumentEditor
          markdown={entry.markdown}
          hash={entry.hash}
          view={view}
          onViewChange={onViewChange}
          onSave={onSave}
          onReload={onReload}
          renderPreview={(source) => <EntryPreview source={source} />}
        />
      </PageSection>
    </article>
  );
}

/** How a Codex automation runs: in a chat, or as a task in a project. */
function codexHow(live: Extract<Live, { kind: "codex" }>) {
  const { kind, folder, model } = live.codex;
  if (kind === "heartbeat") return m.automations_posts_in_chat();
  if (!folder) return "";
  const where = m.automations_runs_in_project({ folder });
  return model ? `${where} · ${modelSource(model).label}` : where;
}

function LiveCard({ live, actions }: { live: Live; actions: AutomationActions }) {
  const status = liveStatus(live);
  const how = live.kind === "codex" ? codexHow(live) : live.agent.label;
  return (
    <ItemRow className="flex-wrap items-start">
      <span className="flex h-(--line-m) items-center">
        <StatusDot tone={status.tone} />
      </span>
      <ItemMain className="basis-64">
        <ItemTitle>
          {liveWhere(live)}
          <span className="font-regular text-neutral-7">{status.label}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-none text-neutral-8">
          {liveSchedule(live)}
        </ItemDescription>
        {how ? <ItemDescription className="wrap-anywhere">{how}</ItemDescription> : null}
      </ItemMain>
      {canAct(live) ? <LiveButtons live={live} actions={actions} /> : null}
    </ItemRow>
  );
}

export function AutomationEntrySkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-s) w-32" />
        <Skeleton className="h-(--line-l) w-72" />
        <Skeleton className="h-(--line-m) w-96 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
