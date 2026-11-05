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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@opai/ui/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";
import { AddIcon, WarningIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { approxTokens } from "@/components/sessions/session-list";
import { useSpaceData } from "@/components/spaces/space-data";
import { Hint, orderSpaces, SpaceDot, SpaceHeader } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { formatDate, formatRelative } from "@/utils/format";
import { orpc } from "@/utils/orpc";

export type SkillRow = Skill & { usage: SkillUsage };
type SpaceRef = { name: string; base: boolean; default?: boolean };

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

/** What the agent reads of a skill in every session: its name and description. */
export function skillChars(skill: Pick<Skill, "name" | "description">) {
  return skill.name.length + skill.description.length + 4;
}

/** What that costs in every session; nothing when on request. */
export function costLine(skill: Skill) {
  if (skill.explicitOnly) return "";
  return m.skill_cost({ tokens: approxTokens(skillChars(skill)) });
}

/** How the skill starts: picked by the agent, or only when asked for. */
export function SkillTrigger({ skill, compact }: { skill: Skill; compact?: boolean }) {
  if (skill.explicitOnly && compact) {
    return <span className="text-neutral-7">{m.skill_explicit()}</span>;
  }
  if (skill.explicitOnly) {
    return (
      <Badge variant="neutral" title={m.skill_explicit_hint()}>
        {m.skill_explicit()}
      </Badge>
    );
  }
  return compact ? null : (
    <span className="font-ui text-s text-neutral-7" title={m.skill_auto_hint()}>
      {m.skill_auto()}
    </span>
  );
}

export function SkillModified({ skill }: { skill: Skill }) {
  return skill.modified ? (
    <Badge variant="warning" title={m.skill_modified_hint()}>
      {m.skill_modified()}
    </Badge>
  ) : null;
}

/** The skills tab of a space: its own, then those it gets from the base space. */
export function SpaceSkills({ name }: { name: string }) {
  const { space, spaces, skills, ownSkills } = useSpaceData(name);
  const base = spaces.find((item) => item.base);
  const inherited = space.base ? [] : skills.filter((skill) => skill.space === base?.name);

  return (
    <div className="flex flex-col gap-xl">
      <SpaceHeader
        space={space}
        skills={ownSkills.length}
        actions={<ImportDialog spaces={spaces} defaultSpace={name} />}
      />

      <PageSection aria-labelledby="skills-own">
        <PageSectionTitle id="skills-own" count={ownSkills.length || undefined}>
          {space.base ? m.skills_every_session() : m.skills_own({ space: name })}
        </PageSectionTitle>
        {ownSkills.length > 0 ? (
          <SkillItems skills={ownSkills} />
        ) : (
          <Hint>{m.skills_space_none()}</Hint>
        )}
      </PageSection>

      {inherited.length > 0 && base ? (
        <PageSection aria-labelledby="skills-inherited">
          <PageSectionTitle id="skills-inherited" count={inherited.length}>
            {m.rules_inherited({ space: base.name })}
          </PageSectionTitle>
          <SkillItems skills={inherited} />
        </PageSection>
      ) : null}
    </div>
  );
}

function SkillItems({ skills }: { skills: SkillRow[] }) {
  return (
    <ItemList>
      {skills.map((skill) => (
        <li key={skill.name}>
          <ItemRow
            className="items-start"
            render={
              <Link
                to="/spaces/$name/skills/$skill"
                params={{ name: skill.space, skill: skill.name }}
              />
            }
          >
            <ItemMain>
              <ItemTitle>
                {skill.name}
                <SkillModified skill={skill} />
              </ItemTitle>
              <ItemDescription className="line-clamp-1">{skill.description}</ItemDescription>
            </ItemMain>
            <ItemEnd className="pt-xxs">
              <span className="hidden sm:inline">{usageLine(skill.usage)}</span>
              <SkillTrigger skill={skill} />
            </ItemEnd>
          </ItemRow>
        </li>
      ))}
    </ItemList>
  );
}

/** Every skill of the instance, to compare their use and cost across spaces. */
export function AllSkills({
  skills,
  spaces: unordered,
  since,
  problems,
}: {
  skills: SkillRow[];
  spaces: SpaceRef[];
  since: string | undefined;
  problems: string[];
}) {
  const spaces = orderSpaces(unordered.map((space) => ({ default: false, ...space })));
  const [filter, setFilter] = useState<"all" | "auto" | "manual">("all");
  const rank = (skill: SkillRow) => spaces.findIndex((space) => space.name === skill.space);
  const rows = skills
    .filter((skill) =>
      filter === "all" ? true : filter === "manual" ? skill.explicitOnly : !skill.explicitOnly,
    )
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageTitle>{m.skills_title()}</PageTitle>
          <ImportDialog spaces={spaces} />
        </div>
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
          <ul className="flex flex-col gap-xxs font-ui text-s text-neutral-10">
            {problems.map((problem) => (
              <li key={problem} className="break-words">
                {problem}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-s">
        <ToggleGroup
          aria-label={m.skill_trigger()}
          value={[filter]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === "all" || next === "auto" || next === "manual") setFilter(next);
          }}
        >
          <ToggleGroupItem value="all">{m.skills_filter_all()}</ToggleGroupItem>
          <ToggleGroupItem value="auto">{m.skill_auto()}</ToggleGroupItem>
          <ToggleGroupItem value="manual">{m.skill_explicit()}</ToggleGroupItem>
        </ToggleGroup>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.skills_column_skill()}</TableHead>
              <TableHead>{m.skill_space()}</TableHead>
              <TableHead>{m.skill_trigger()}</TableHead>
              <TableHead numeric>{m.skills_column_uses()}</TableHead>
              <TableHead numeric>{m.skills_column_cost()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((skill) => (
              <TableRow key={skill.name}>
                <TableCell className="max-w-md">
                  <div className="flex min-w-0 flex-col gap-xxs">
                    <Link
                      to="/spaces/$name/skills/$skill"
                      params={{ name: skill.space, skill: skill.name }}
                      className="flex w-fit items-center gap-xs rounded-xs font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10 focus-visible:focus-ring"
                    >
                      {skill.name}
                      <SkillModified skill={skill} />
                    </Link>
                    <span className="line-clamp-1 text-neutral-7">{skill.description}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-xs whitespace-nowrap">
                    <SpaceDot index={rank(skill)} />
                    {skill.space}
                  </span>
                </TableCell>
                <TableCell>
                  <SkillTrigger skill={skill} />
                </TableCell>
                <TableCell numeric>
                  <span title={usageLine(skill.usage)}>{skill.usage.uses}</span>
                </TableCell>
                <TableCell numeric className="text-neutral-7">
                  {skill.explicitOnly ? "—" : `≈ ${approxTokens(skillChars(skill))}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ImportDialog({
  spaces,
  defaultSpace,
}: {
  spaces: SpaceRef[];
  defaultSpace?: string;
}) {
  const base = defaultSpace ?? spaces.find((space) => space.base)?.name ?? "global";
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
        void navigate({
          to: "/spaces/$name/skills/$skill",
          params: { name: skill.space, skill: skill.name },
        });
      },
    }),
  );
  const error = add.error instanceof ORPCError ? add.error.message : add.error?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSpace(base);
        setOpen(next);
      }}
    >
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
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
