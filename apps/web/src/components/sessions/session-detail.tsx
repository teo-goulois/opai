import type { Source } from "@opai/context/origins";
import type {
  ContextPart,
  SessionDetail as Session,
  SessionSummary,
  Step,
} from "@opai/context/sessions";
import { Badge } from "@opai/ui/components/ui/badge";
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
import { DescriptionItem, DescriptionList } from "@opai/ui/components/ui/description-list";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { cn } from "@opai/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { formatRelative } from "@/utils/format";

import { approxTokens, SessionSources } from "./session-list";
import { clientSource, modelSource, SourceTag } from "./session-source";

const cardClassName = "rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2";
const preClassName =
  "max-h-[32rem] overflow-auto rounded-s bg-neutral-2 p-s font-data text-xs whitespace-pre-wrap break-words text-neutral-9 edge-outer dark:bg-neutral-3";

const kindLabel: Record<ContextPart["kind"], () => string> = {
  system: m.session_kind_system,
  instructions: m.session_kind_instructions,
  hook: m.session_kind_hook,
  skills: m.session_kind_skills,
  tools: m.session_kind_tools,
  mcp: m.session_kind_mcp,
  message: m.session_kind_message,
  other: m.session_kind_other,
};

const originLabel: Record<Source["origin"], () => string> = {
  "claude-code": m.origin_claude_code,
  codex: m.origin_codex,
  "t3-code": m.origin_t3_code,
  opai: m.origin_opai,
  project: m.origin_project,
  account: m.origin_account,
  mcp: m.origin_mcp,
  other: m.origin_other,
};

/** "T3 Code", "Opai", "claude.ai", "Project ~/code/app", "MCP posthog". */
function sourceLabel(source: Source) {
  if (!source.name) return originLabel[source.origin]();
  if (source.origin === "account" || source.origin === "other") return source.name;
  return `${originLabel[source.origin]()} ${source.name}`;
}

/** Mine (my config, my project) stands out; the rest stays neutral. */
function OriginBadge({ source, count }: { source: Source; count?: boolean }) {
  return (
    <Badge
      variant={source.origin === "opai" || source.origin === "project" ? "accent" : "neutral"}
      title={m.session_tokens({ tokens: approxTokens(source.chars) })}
    >
      {count ? `${sourceLabel(source)} · ${source.count}` : sourceLabel(source)}
    </Badge>
  );
}

function OriginSummary({ origins, total }: { origins: Source[]; total: number }) {
  return (
    <section aria-labelledby="session-origins" className="flex flex-col gap-xs">
      <div className="flex flex-col gap-xxs">
        <h2 id="session-origins" className="font-ui text-m font-medium text-neutral-10">
          {m.session_origins_title()}
        </h2>
        <p className="max-w-prose font-ui text-s text-pretty text-neutral-7">
          {m.session_origins_hint()}
        </p>
      </div>
      <ul className={cn(cardClassName, "flex flex-col overflow-hidden")}>
        {origins.map((source) => (
          <li
            key={`${source.origin}:${source.name ?? ""}`}
            className="flex items-baseline justify-between gap-s px-m py-xs in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4"
          >
            <span className="min-w-0">
              <OriginBadge source={source} />
            </span>
            <span className="shrink-0 font-ui text-s text-neutral-8">
              {m.session_tokens({ tokens: approxTokens(source.chars) })}
              <span className="text-neutral-7">
                {" · "}
                {m.session_origin_share({
                  share: total > 0 ? Math.max(1, Math.round((source.chars / total) * 100)) : 0,
                })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sessions › the session that started it › this one. */
function SessionCrumbs({ session }: { session: Session }) {
  return (
    <Breadcrumb aria-label={m.breadcrumb()}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to="/sessions" />}>{m.nav_sessions()}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        {session.parent ? (
          <>
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbLink
                className="truncate"
                render={<Link to="/sessions/$id" params={{ id: session.parent }} />}
              >
                {session.parentTitle ?? session.parent}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        ) : null}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{session.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function SessionDetail({ session }: { session: Session }) {
  const agents = new Map(session.agents.map((agent) => [agent.id, agent]));
  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <SessionCrumbs session={session} />
        <PageHeader>
          <div className="flex flex-wrap items-center gap-xs">
            <PageTitle className="text-pretty">{session.title}</PageTitle>
            {session.parent ? (
              <Badge variant="neutral">{session.agentType ?? m.session_subagent()}</Badge>
            ) : null}
          </div>
          <PageMeta className="items-center">
            <SessionSources session={session} />
            <span>
              {[
                m.session_prompts({ count: session.prompts }),
                m.session_tool_calls({ count: session.toolCalls }),
                m.session_context_tokens({ tokens: approxTokens(session.contextChars) }),
              ].join(" · ")}
            </span>
          </PageMeta>
        </PageHeader>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Tabs defaultValue={session.parent ? "timeline" : "context"}>
          <TabsList>
            <TabsTab value="context">{m.session_tab_context()}</TabsTab>
            <TabsTab value="timeline">{m.session_tab_timeline()}</TabsTab>
            {session.agents.length > 0 ? (
              <TabsTab value="agents">
                {m.session_tab_agents()}
                <span className="font-ui text-s text-neutral-6 tabular-nums">
                  {session.agents.length}
                </span>
              </TabsTab>
            ) : null}
          </TabsList>
          <TabsPanel value="context" className="flex flex-col gap-l">
            {session.origins.length > 0 ? (
              <OriginSummary origins={session.origins} total={session.contextChars} />
            ) : null}
            <div className="flex flex-col gap-s">
              <p className="max-w-prose font-ui text-s text-pretty text-neutral-7">
                {m.session_context_hint()}
              </p>
              <ul className="flex flex-col gap-xs">
                {session.context.map((part, index) => (
                  <li key={index}>
                    <ContextRow part={part} />
                  </li>
                ))}
              </ul>
            </div>
          </TabsPanel>
          <TabsPanel value="timeline">
            {session.steps.length > 0 ? (
              <ol className="flex flex-col gap-xs">
                {session.steps.map((step, index) => (
                  <li key={index}>
                    <StepRow
                      step={step}
                      session={session.id}
                      agent={
                        step.kind === "tool" && step.agent ? agents.get(step.agent) : undefined
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-ui text-s text-neutral-7">{m.session_timeline_none()}</p>
            )}
          </TabsPanel>
          {session.agents.length > 0 ? (
            <TabsPanel value="agents" className="flex flex-col gap-s">
              <p className="max-w-prose font-ui text-s text-pretty text-neutral-7">
                {m.session_agents_hint()}
              </p>
              <ItemList>
                {session.agents.map((agent) => (
                  <li key={agent.id}>
                    <AgentRow session={session.id} agent={agent} />
                  </li>
                ))}
              </ItemList>
            </TabsPanel>
          ) : null}
        </Tabs>

        <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
          <PageSection>
            <PageSectionTitle>{m.session_details()}</PageSectionTitle>
            <DescriptionList>
              {session.space ? (
                <DescriptionItem label={m.session_space()}>
                  <Link
                    to="/spaces/$name"
                    params={{ name: session.space }}
                    className="rounded-xs underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10 focus-visible:focus-ring"
                  >
                    {session.space}
                  </Link>
                </DescriptionItem>
              ) : null}
              {session.cwd ? (
                <DescriptionItem label={m.session_folder()}>
                  <span className="break-all">{session.cwd}</span>
                </DescriptionItem>
              ) : null}
              {session.model ? (
                <DescriptionItem label={m.session_model()}>
                  <SourceTag source={modelSource(session.model)} title={session.model} />
                </DescriptionItem>
              ) : null}
              {session.client ? (
                <DescriptionItem label={m.session_client()}>
                  <SourceTag source={clientSource(session)} title={session.client} />
                </DescriptionItem>
              ) : null}
              {session.startedAt ? (
                <DescriptionItem label={m.session_started()}>
                  {formatRelative(session.startedAt)}
                </DescriptionItem>
              ) : null}
              <DescriptionItem label={m.session_file()}>
                <span className="break-all">{session.file}</span>
              </DescriptionItem>
            </DescriptionList>
          </PageSection>

          <PageSection>
            <PageSectionTitle count={session.skills.length}>
              {m.session_skills_used()}
            </PageSectionTitle>
            {session.skills.length > 0 ? (
              <ul className="flex flex-wrap gap-xxs">
                {session.skills.map((skill) => (
                  <li key={skill}>
                    <Badge variant="accent">{skill}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-ui text-s text-neutral-7">{m.session_skills_used_none()}</p>
            )}
            <p className="font-ui text-s text-neutral-7">
              {[
                m.session_skills_offered({ count: session.skillsListed.length }),
                m.session_tools_available({ count: session.tools.length }),
              ].join(" · ")}
            </p>
          </PageSection>
        </aside>
      </div>
    </article>
  );
}

function ContextRow({ part }: { part: ContextPart }) {
  return (
    <Collapsible className={cardClassName}>
      <CollapsibleTrigger className="w-full px-m py-s">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-xxs text-start">
          <span className="flex min-w-0 flex-wrap items-center gap-xs">
            <span className="min-w-0 font-ui text-m font-medium break-words text-neutral-10">
              {part.label}
            </span>
          </span>
          <span className="flex flex-wrap gap-xxs">
            {part.sources.map((source) => (
              <OriginBadge
                key={`${source.origin}:${source.name ?? ""}`}
                source={source}
                count={part.sources.length > 1}
              />
            ))}
          </span>
          <span className="font-ui text-s text-neutral-7">
            {[kindLabel[part.kind](), m.session_tokens({ tokens: approxTokens(part.chars) })].join(
              " · ",
            )}
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="px-m pb-s">
          <pre className={preClassName}>{part.text}</pre>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** How long a subagent ran: from its first line to its last step. */
function duration(agent: SessionSummary) {
  if (!agent.startedAt || !agent.endedAt) return "";
  const seconds = Math.max(
    0,
    Math.round((Date.parse(agent.endedAt) - Date.parse(agent.startedAt)) / 1000),
  );
  return seconds < 60
    ? m.session_seconds({ count: seconds })
    : m.session_minutes({ count: Math.round(seconds / 60) });
}

function AgentRow({ session, agent }: { session: string; agent: SessionSummary }) {
  return (
    <ItemRow
      render={<Link to="/sessions/$id/agents/$agent" params={{ id: session, agent: agent.id }} />}
    >
      <ItemMain>
        <ItemTitle>
          <span className="min-w-0 truncate">{agent.title}</span>
          {agent.agentType ? <Badge variant="neutral">{agent.agentType}</Badge> : null}
        </ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-s gap-y-xxs">
          {agent.model ? <SourceTag source={modelSource(agent.model)} /> : null}
          <span>
            {[m.session_tool_calls({ count: agent.toolCalls }), duration(agent)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </ItemDescription>
      </ItemMain>
      <ItemEnd>
        {agent.startedAt ? new Date(agent.startedAt).toLocaleTimeString(getLocale()) : null}
      </ItemEnd>
    </ItemRow>
  );
}

function StepRow({
  step,
  session,
  agent,
}: {
  step: Step;
  session: string;
  /** For a call that started a subagent. */
  agent?: SessionSummary | undefined;
}) {
  if (step.kind === "tool") {
    return (
      <Collapsible className={cardClassName}>
        <CollapsibleTrigger className="w-full px-m py-xs">
          <StepHeading at={step.at}>
            <span className="min-w-0 font-ui text-s font-medium break-all text-neutral-10">
              {step.name}
            </span>
            {agent ? (
              <span className="min-w-0 truncate font-ui text-s text-neutral-8">{agent.title}</span>
            ) : null}
            {step.error ? <Badge variant="error">{m.session_tool_error()}</Badge> : null}
          </StepHeading>
        </CollapsibleTrigger>
        {agent ? (
          <Link
            to="/sessions/$id/agents/$agent"
            params={{ id: session, agent: agent.id }}
            className="mx-m mb-xs flex w-fit items-center gap-xxs rounded-xs font-ui text-s text-neutral-8 underline decoration-neutral-5 underline-offset-4 transition-colors hover:text-neutral-10 hover:decoration-neutral-10 focus-visible:focus-ring"
          >
            {m.session_open_agent()}
          </Link>
        ) : null}
        <CollapsiblePanel variant="plain">
          <div className="flex flex-col gap-xs px-m pb-s">
            <span className="font-ui text-s text-neutral-7">{m.session_tool_input()}</span>
            <pre className={preClassName}>{step.input}</pre>
            <span className="font-ui text-s text-neutral-7">{m.session_tool_output()}</span>
            {step.output !== undefined ? (
              <pre className={preClassName}>{step.output}</pre>
            ) : (
              <p className="font-ui text-s text-neutral-7">{m.session_tool_no_output()}</p>
            )}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    );
  }

  if (step.kind === "context") {
    return (
      <Collapsible className={cardClassName}>
        <CollapsibleTrigger className="w-full px-m py-xs">
          <StepHeading at={step.at}>
            <span className="font-ui text-s font-medium text-neutral-8">
              {m.session_step_context()}
            </span>
            <Badge variant="neutral">{step.label}</Badge>
          </StepHeading>
        </CollapsibleTrigger>
        <CollapsiblePanel variant="plain">
          <div className="px-m pb-s">
            <pre className={preClassName}>{step.text}</pre>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    );
  }

  const prompt = step.kind === "prompt";
  return (
    <div
      className={cn(
        "flex flex-col gap-xxs px-m py-s",
        prompt ? "rounded-m bg-neutral-3" : cardClassName,
      )}
    >
      <StepHeading at={step.at}>
        <span className="font-ui text-s font-medium text-neutral-8">
          {prompt ? m.session_step_prompt() : m.session_step_reply()}
        </span>
      </StepHeading>
      <p className="font-ui text-s whitespace-pre-wrap break-words text-neutral-10">{step.text}</p>
    </div>
  );
}

function StepHeading({ at, children }: { at: string | undefined; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-xs text-start">
      {children}
      {at ? (
        <time dateTime={at} className="ms-auto font-ui text-xs text-neutral-7 tabular-nums">
          {new Date(at).toLocaleTimeString(getLocale())}
        </time>
      ) : null}
    </span>
  );
}

export function SessionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-s) w-24" />
        <Skeleton className="h-(--line-l) w-64" />
      </div>
      <Skeleton className="h-10 w-48" />
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
