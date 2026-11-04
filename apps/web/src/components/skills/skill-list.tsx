import type { SkillUsage } from "@opai/context/routers/skills";
import type { Skill, SkillSource } from "@opai/context/skills";
import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import { Field, FieldLabel } from "@opai/ui/components/ui/field";
import { Input } from "@opai/ui/components/ui/input";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";
import { AddIcon, WarningIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { approxTokens } from "@/components/sessions/session-list";
import { m } from "@/paraglide/messages.js";
import { formatDate, formatRelative } from "@/utils/format";
import { orpc } from "@/utils/orpc";

export type SkillRow = Skill & { usage: SkillUsage };
type SpaceRef = { name: string; base: boolean };

/** Where an imported skill comes from, as skills.ts describeSource writes it. */
export function sourceLabel(source: SkillSource) {
  if (source.type === "github") {
    const path = source.path ? `/${source.path}` : "";
    return `github.com/${source.repo}${path}${source.ref ? ` @ ${source.ref}` : ""}`;
  }
  return source.type === "url" ? source.url : source.path;
}

/** "3 uses · last 2 days ago", or "No observed use". */
export function usageLine(usage: SkillUsage) {
  if (usage.uses === 0) return m.skill_no_use();
  return [
    m.skill_uses_count({ count: usage.uses }),
    usage.byUser > 0 ? m.skill_uses_by_user({ count: usage.byUser }) : "",
    usage.lastUsed ? m.skill_last_used({ when: formatRelative(usage.lastUsed) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What a skill's name and description cost in every session; nothing when on request. */
export function costLine(skill: Skill) {
  if (skill.explicitOnly) return "";
  return m.skill_cost({ tokens: approxTokens(skill.name.length + skill.description.length + 4) });
}

export function SkillBadges({ skill }: { skill: Skill }) {
  return (
    <>
      {skill.explicitOnly ? (
        <Badge variant="neutral" title={m.skill_explicit_hint()}>
          {m.skill_explicit()}
        </Badge>
      ) : null}
      {skill.modified ? (
        <Badge variant="warning" title={m.skill_modified_hint()}>
          {m.skill_modified()}
        </Badge>
      ) : null}
    </>
  );
}

export function SkillList({
  skills,
  spaces,
  since,
  problems,
}: {
  skills: SkillRow[];
  spaces: SpaceRef[];
  since: string | undefined;
  problems: string[];
}) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <div className="flex flex-wrap items-start justify-between gap-s">
          <PageTitle>{m.skills_title()}</PageTitle>
          <ImportDialog spaces={spaces} />
        </div>
        <PageDescription className="text-pretty">{m.skills_hint()}</PageDescription>
        <PageMeta>
          <span>{m.skills_count({ count: skills.length })}</span>
          <span>{since ? m.skills_since({ date: formatDate(since) }) : m.skills_since_none()}</span>
        </PageMeta>
      </PageHeader>

      {problems.length > 0 ? (
        <section
          aria-labelledby="skills-problems"
          className="flex flex-col gap-xs rounded-m bg-warning-transparent px-m py-s"
        >
          <h2
            id="skills-problems"
            className="flex items-center gap-xs font-ui text-m font-medium text-neutral-10"
          >
            <WarningIcon aria-hidden />
            {m.skills_problems()}
          </h2>
          <p className="font-ui text-s text-neutral-8">{m.skills_problems_hint()}</p>
          <ul className="flex flex-col gap-xxs font-data text-s text-neutral-10">
            {problems.map((problem) => (
              <li key={problem} className="break-words">
                {problem}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {spaces.map((space) => {
        const list = skills.filter((skill) => skill.space === space.name);
        if (list.length === 0 && !space.base) return null;
        return (
          <PageSection key={space.name} aria-labelledby={`skills-${space.name}`}>
            <PageSectionTitle id={`skills-${space.name}`} count={list.length}>
              {space.name}
            </PageSectionTitle>
            {list.length > 0 ? (
              <ul className="flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2">
                {list.map((skill) => (
                  <li key={skill.name}>
                    <SkillRowLink skill={skill} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-ui text-s text-neutral-7">{m.skills_space_none()}</p>
            )}
          </PageSection>
        );
      })}
    </div>
  );
}

function SkillRowLink({ skill }: { skill: SkillRow }) {
  return (
    <Link
      to="/skills/$name"
      params={{ name: skill.name }}
      className="flex flex-col gap-xs px-m py-s outline-none transition-colors in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4 hover:bg-neutral-3 focus-visible:focus-ring focus-visible:-outline-offset-2"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-xs">
        <span className="font-data text-m font-medium text-neutral-10">{skill.name}</span>
        <SkillBadges skill={skill} />
      </span>
      <span className="line-clamp-2 font-ui text-s text-pretty text-neutral-8">
        {skill.description}
      </span>
      <span className="font-ui text-s text-neutral-7">
        {[usageLine(skill.usage), costLine(skill)].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}

function ImportDialog({ spaces }: { spaces: SpaceRef[] }) {
  const base = spaces.find((space) => space.base)?.name ?? "global";
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [space, setSpace] = useState(base);
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation(
    orpc.skills.add.mutationOptions({
      onSuccess: (skill) => {
        void queryClient.invalidateQueries({ queryKey: orpc.skills.key() });
        setOpen(false);
        setSource("");
        setName("");
        void navigate({ to: "/skills/$name", params: { name: skill.name } });
      },
    }),
  );
  const error = add.error instanceof ORPCError ? add.error.message : add.error?.message;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <AddIcon data-slot="icon" aria-hidden />
        {m.skills_import()}
      </DialogTrigger>
      <DialogPopup closeLabel={m.close()} className="w-[min(560px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{m.skills_import_title()}</DialogTitle>
        <DialogDescription>{m.skills_import_description()}</DialogDescription>
        <form
          className="flex flex-col gap-m"
          onSubmit={(event) => {
            event.preventDefault();
            if (!source.trim()) return;
            add.mutate({ source: source.trim(), space, name: name.trim() || undefined });
          }}
        >
          <Field>
            <FieldLabel>{m.skills_import_source()}</FieldLabel>
            <Input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="owner/repo/skills/name"
              autoFocus
              required
            />
          </Field>
          <div className="flex flex-col gap-xs">
            <span className="font-ui text-m font-medium text-neutral-10">
              {m.skills_import_space()}
            </span>
            <ToggleGroup
              aria-label={m.skills_import_space()}
              value={[space]}
              onValueChange={(value) => {
                if (value[0]) setSpace(value[0]);
              }}
              className="flex-wrap"
            >
              {spaces.map((item) => (
                <ToggleGroupItem key={item.name} value={item.name}>
                  {item.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Field>
            <FieldLabel>{m.skills_import_name()}</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {error ? <p className="font-ui text-s text-error">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={add.isPending || !source.trim()}>
              {m.skills_import_submit()}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function SkillListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-64" />
      </div>
      <div className="flex flex-col gap-s">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
