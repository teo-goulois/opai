import type { SessionSummary } from "@opai/context/sessions";
import type { SkillCount } from "@opai/context/usage";
import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";

import { clientSource, modelSource, SourceTag } from "./session-source";

/** Claude Code or Codex. */
export function harnessLabel(harness: SessionSummary["harness"]) {
  return harness === "claude" ? m.config_tool_claude() : m.config_tool_codex();
}

/** A rough token count: about 4 characters per token. */
export function approxTokens(chars: number) {
  const tokens = Math.round(chars / 4);
  return tokens >= 1000 ? `${Math.round(tokens / 100) / 10}k` : String(tokens);
}

/** The pages after the first: whether there are more, and how to load them. */
export type MoreSessions = {
  hasMore: boolean;
  loading: boolean;
  error: string | undefined;
  load: () => void;
};

export function SessionList({
  sessions,
  skills,
  more,
}: {
  sessions: SessionSummary[];
  skills: SkillCount[];
  more: MoreSessions;
}) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.sessions_title()}</PageTitle>
        <PageMeta>
          {more.hasMore
            ? m.sessions_count_more({ count: sessions.length })
            : m.sessions_count({ count: sessions.length })}
        </PageMeta>
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_18rem]">
        {sessions.length > 0 ? (
          <div className="flex flex-col gap-m self-start">
            <ul className="-mx-s flex flex-col gap-xxs">
              {sessions.map((session) => (
                <li key={session.id}>
                  <SessionRow session={session} />
                </li>
              ))}
            </ul>
            <LoadMore more={more} />
          </div>
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

/** The client and the model of a session, each with its mark. */
export function SessionSources({ session }: { session: SessionSummary }) {
  return (
    <>
      <SourceTag
        source={clientSource(session)}
        title={m.session_client_via({ harness: harnessLabel(session.harness) })}
        className="text-neutral-9"
      />
      {session.model ? (
        <SourceTag source={modelSource(session.model)} className="text-neutral-9" />
      ) : null}
    </>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const facts = [
    formatRelative(session.updatedAt),
    m.session_prompts({ count: session.prompts }),
    m.session_tool_calls({ count: session.toolCalls }),
    session.subagents > 0 ? m.session_subagents({ count: session.subagents }) : "",
    m.session_context_tokens({ tokens: approxTokens(session.contextChars) }),
  ].filter(Boolean);
  return (
    <Link
      to="/sessions/$id"
      params={{ id: session.id }}
      className="flex flex-col gap-xs rounded-s px-s py-xs outline-none transition-colors hover:bg-neutral-3 focus-visible:focus-ring"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-xs">
        <span className="min-w-0 font-ui text-m font-medium text-pretty text-neutral-10">
          {session.title}
        </span>
        {session.space ? <Badge variant="neutral">{session.space}</Badge> : null}
      </span>
      <span className="flex flex-col gap-xxs">
        <span className="flex flex-wrap items-center gap-x-s gap-y-xxs font-ui text-s text-neutral-7">
          <SessionSources session={session} />
          <span>{facts.join(" · ")}</span>
        </span>
        {session.skills.length > 0 ? (
          <span className="flex flex-wrap gap-xxs">
            {session.skills.map((skill) => (
              <Badge key={skill} variant="neutral">
                {skill}
              </Badge>
            ))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * Loads the next page when the end of the list comes within a screen, and
 * offers a button for the keyboard, or when the page could not load.
 */
function LoadMore({ more }: { more: MoreSessions }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasMore, loading, error, load } = more;

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      },
      { rootMargin: "0px 0px 100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, error, load]);

  if (!hasMore) return null;
  return (
    <div ref={sentinel} className="flex flex-col items-start gap-xs">
      {error ? (
        <p role="alert" className="font-ui text-s text-neutral-8">
          {m.sessions_more_failed({ message: error })}
        </p>
      ) : null}
      <Button variant="ghost" isPending={loading} onClick={load}>
        {m.sessions_more()}
      </Button>
    </div>
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
                <span className="min-w-0 truncate font-ui text-s text-neutral-10">
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
