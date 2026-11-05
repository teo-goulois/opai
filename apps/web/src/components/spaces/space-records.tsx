import type { IssueEntry, JournalEntry } from "@opai/context/space-view";
import { Badge } from "@opai/ui/components/ui/badge";
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
import { Markdown } from "@opai/ui/components/ui/markdown";
import { PageSection } from "@opai/ui/components/ui/page-header";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";

import { useSpaceData } from "./space-data";
import { Hint, SpaceHeader } from "./space-ui";

/** A tab of a space: its header, a hint, then the records. */
function RecordsTab({ name, hint, children }: { name: string; hint: string; children: ReactNode }) {
  const { space, ownSkills } = useSpaceData(name);
  return (
    <div className="flex flex-col gap-xl">
      <SpaceHeader space={space} skills={ownSkills.length} />
      <PageSection>
        <Hint>{hint}</Hint>
        {children}
      </PageSection>
    </div>
  );
}

export function SpaceMemory({ name }: { name: string }) {
  const { space } = useSpaceData(name);
  return (
    <RecordsTab name={name} hint={m.space_memory_hint({ path: `spaces/${name}/context/memory/` })}>
      {space.facts.length > 0 ? (
        <ItemList>
          {space.facts.map((fact) => (
            <li key={fact.path}>
              <ItemRow>
                <ItemMain>
                  <ItemTitle>{fact.title}</ItemTitle>
                  <ItemDescription>{fact.path}</ItemDescription>
                </ItemMain>
              </ItemRow>
            </li>
          ))}
        </ItemList>
      ) : (
        <Hint>{m.space_memory_none()}</Hint>
      )}
    </RecordsTab>
  );
}

export function SpaceJournal({ name }: { name: string }) {
  const { space } = useSpaceData(name);
  return (
    <RecordsTab name={name} hint={m.space_journal_hint()}>
      {space.journal.length > 0 ? (
        <ItemList>
          {space.journal.map((entry) => (
            <li key={entry.path}>
              <JournalRow entry={entry} />
            </li>
          ))}
        </ItemList>
      ) : (
        <Hint>{m.space_journal_none()}</Hint>
      )}
    </RecordsTab>
  );
}

export function SpaceIssues({ name }: { name: string }) {
  const { space } = useSpaceData(name);
  return (
    <RecordsTab name={name} hint={m.space_issues_hint()}>
      {space.issues.length > 0 ? (
        <ItemList>
          {space.issues.map((issue) => (
            <li key={issue.path}>
              <IssueRow issue={issue} />
            </li>
          ))}
        </ItemList>
      ) : (
        <Hint>{m.space_issues_none()}</Hint>
      )}
    </RecordsTab>
  );
}

/** Who wrote a record, where, and when. */
function byline({ agent, machine, date }: { agent: string; machine: string; date: string }) {
  return [agent, machine, date ? formatRelative(date) : ""].filter(Boolean).join(" · ");
}

const statusVariant: Record<string, "success" | "warning" | "error" | "neutral"> = {
  validated: "success",
  implemented: "neutral",
  planned: "neutral",
  blocked: "error",
};

/** A record that opens in place on its text. */
function RecordRow({
  title,
  badges,
  lines,
  body,
  path,
}: {
  title: string;
  badges: ReactNode;
  lines: string[];
  body: string;
  path: string;
}) {
  return (
    <Collapsible className="rounded-s data-open:gap-xs data-open:bg-neutral-2">
      <CollapsibleTrigger className="px-s hover:bg-neutral-3">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-xxs">
          <span className="flex flex-wrap items-center gap-xs">
            {title}
            {badges}
          </span>
          {lines.filter(Boolean).map((line) => (
            <span key={line} className="font-ui text-s font-regular text-neutral-7">
              {line}
            </span>
          ))}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="flex flex-col gap-xs px-s pb-s">
          <Markdown>{body}</Markdown>
          <p className="font-ui text-s text-neutral-7">{path}</p>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function JournalRow({ entry }: { entry: JournalEntry }) {
  return (
    <RecordRow
      title={entry.title}
      badges={
        <>
          {entry.status ? (
            <Badge variant={statusVariant[entry.status] ?? "neutral"}>{entry.status}</Badge>
          ) : null}
          {entry.relevance ? (
            <Badge variant="neutral" title={m.space_journal_relevance()}>
              {entry.relevance}
            </Badge>
          ) : null}
        </>
      }
      lines={[entry.project, byline(entry)]}
      body={entry.body}
      path={entry.path}
    />
  );
}

function IssueRow({ issue }: { issue: IssueEntry }) {
  return (
    <RecordRow
      title={issue.title}
      badges={
        <Badge variant={issue.occurrences >= 3 ? "warning" : "neutral"}>
          {m.space_issue_occurrences({ count: issue.occurrences })}
        </Badge>
      }
      lines={[issue.key, byline(issue)]}
      body={issue.body}
      path={issue.path}
    />
  );
}
