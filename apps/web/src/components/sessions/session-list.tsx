import type { SessionSummary } from "@opai/context/sessions";
import type { SkillCount } from "@opai/context/usage";
import { Badge } from "@opai/ui/components/ui/badge";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";

/** Claude Code or Codex. */
export function harnessLabel(harness: SessionSummary["harness"]) {
  return harness === "claude" ? m.config_tool_claude() : m.config_tool_codex();
}

/** A rough token count: about 4 characters per token. */
export function approxTokens(chars: number) {
  const tokens = Math.round(chars / 4);
  return tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : String(tokens);
}

export function SessionList({
  sessions,
  skills,
}: {
  sessions: SessionSummary[];
  skills: SkillCount[];
}) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.sessions_title()}</PageTitle>
        <PageMeta>{m.sessions_count({ count: sessions.length })}</PageMeta>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_18rem]">
        {sessions.length > 0 ? (
          <ul className="flex flex-col self-start overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionRow session={session} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-prose font-ui text-s text-neutral-7">{m.sessions_none()}</p>
        )}

        <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
          <SkillUses skills={skills} />
        </aside>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const facts = [
    session.model,
    m.session_prompts({ count: session.prompts }),
    m.session_tool_calls({ count: session.toolCalls }),
    m.session_context_tokens({ tokens: approxTokens(session.contextChars) }),
  ].filter(Boolean);
  return (
    <Link
      to="/sessions/$id"
      params={{ id: session.id }}
      className="flex flex-col gap-xs px-m py-s outline-none transition-colors in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4 hover:bg-neutral-3 focus-visible:focus-ring focus-visible:-outline-offset-2"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-xs">
        <span className="min-w-0 font-ui text-m font-medium text-pretty text-neutral-10">
          {session.title}
        </span>
        <Badge variant="neutral">{harnessLabel(session.harness)}</Badge>
        {session.space ? <Badge variant="neutral">{session.space}</Badge> : null}
      </span>
      <span className="flex flex-col gap-xxs">
        <span className="font-ui text-s text-neutral-7">
          {[formatRelative(session.updatedAt), session.client, ...facts]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {session.skills.length > 0 ? (
          <span className="flex flex-wrap gap-xxs">
            {session.skills.map((skill) => (
              <Badge key={skill} variant="accent">
                {skill}
              </Badge>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function SkillUses({ skills }: { skills: SkillCount[] }) {
  return (
    <PageSection aria-labelledby="skill-uses">
      <div className="flex flex-col gap-xxs">
        <PageSectionTitle id="skill-uses" count={skills.length}>
          {m.skill_uses_title()}
        </PageSectionTitle>
        <p className="font-ui text-s text-pretty text-neutral-7">{m.skill_uses_hint()}</p>
      </div>
      {skills.length > 0 ? (
        <ul className="flex flex-col gap-s">
          {skills.map((skill) => (
            <li key={skill.skill} className="flex flex-col gap-xxs">
              <span className="flex items-baseline justify-between gap-xs">
                <span className="min-w-0 truncate font-data text-s text-neutral-10">
                  {skill.skill}
                </span>
                <span className="shrink-0 font-ui text-s text-neutral-8">
                  {m.skill_uses_count({ count: skill.uses })}
                </span>
              </span>
              <span className="font-ui text-xs text-neutral-7">
                {[
                  formatRelative(skill.lastUsed),
                  skill.byUser > 0 ? m.skill_uses_by_user({ count: skill.byUser }) : "",
                  skill.machines.join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-ui text-s text-neutral-7">{m.skill_uses_none()}</p>
      )}
    </PageSection>
  );
}

export function SessionListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-20" />
      </div>
      <div className="flex flex-col gap-s">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
