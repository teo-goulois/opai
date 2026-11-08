import type { Machine } from "@opai/context/machines";
import { Badge } from "@opai/ui/components/ui/badge";
import { DescriptionItem, DescriptionList } from "@opai/ui/components/ui/description-list";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { MachineIcon } from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";

import { SkillSharing, type SkillRow } from "@/components/skills/skill-list";
import { m } from "@/paraglide/messages.js";
import { formatDate, formatRelative } from "@/utils/format";

import { SyncNow } from "./sync-now";

/** Every machine that syncs the instance: what it has not shared, and what it uses. */
export function MachineList({ machines, skills }: { machines: Machine[]; skills: SkillRow[] }) {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageTitle>{m.machines_title()}</PageTitle>
          <SyncNow />
        </div>
        <PageMeta>
          <span>{m.machines_count({ count: machines.length })}</span>
          <span>{m.machines_hint()}</span>
        </PageMeta>
      </PageHeader>
      {machines.map((machine) => (
        <MachineSection key={machine.name} machine={machine} skills={byName} />
      ))}
    </div>
  );
}

function MachineSection({ machine, skills }: { machine: Machine; skills: Map<string, SkillRow> }) {
  const id = `machine-${machine.name}`;
  const unshared = machine.unshared ? Object.entries(machine.unshared) : undefined;
  return (
    <PageSection aria-labelledby={id} className="border-t border-neutral-3 pt-l">
      <PageSectionTitle id={id} className="items-center">
        <MachineIcon aria-hidden className="text-neutral-7" />
        {machine.name}
        {machine.current ? <Badge variant="accent">{m.machine_current()}</Badge> : null}
        {machine.declared ? (
          <Badge variant="neutral" title={m.machine_declared_hint()}>
            machines.json
          </Badge>
        ) : null}
      </PageSectionTitle>
      <DescriptionList className="gap-m">
        <DescriptionItem label={m.machine_last_activity()} title={m.machine_last_activity_hint()}>
          {machine.lastActivity ? (
            <span title={formatDate(machine.lastActivity)}>
              {formatRelative(machine.lastActivity)}
            </span>
          ) : (
            <span className="text-neutral-7">{m.machine_last_activity_none()}</span>
          )}
        </DescriptionItem>
        <DescriptionItem label={m.machine_unshared()}>
          {!unshared ? (
            <span className="text-neutral-7">
              {machine.current ? m.machine_unshared_no_remote() : m.machine_unshared_unknown()}
            </span>
          ) : unshared.length === 0 ? (
            <span className="text-neutral-7">{m.machine_unshared_none()}</span>
          ) : (
            <ul className="flex flex-wrap gap-x-m gap-y-xs">
              {unshared.map(([name, sharing]) => (
                <li key={name} className="flex items-center gap-xs">
                  <SkillName name={name} skill={skills.get(name)} />
                  <SkillSharing sharing={sharing} />
                </li>
              ))}
            </ul>
          )}
        </DescriptionItem>
        <DescriptionItem label={m.machine_skills()}>
          {machine.skills.length === 0 ? (
            <span className="text-neutral-7">{m.machine_skills_none()}</span>
          ) : (
            <div className="flex flex-col gap-xs">
              <span className="text-neutral-7">{m.machine_uses({ count: machine.uses })}</span>
              <ul className="flex flex-wrap gap-x-m gap-y-xs">
                {machine.skills.map((item) => (
                  <li key={item.skill} className="flex items-baseline gap-xxs">
                    <SkillName name={item.skill} skill={skills.get(item.skill)} />
                    <span className="text-neutral-7 tabular-nums">{item.uses}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DescriptionItem>
      </DescriptionList>
    </PageSection>
  );
}

/** A skill of the instance links to its page; another one (a plugin's, a removed one) is text. */
function SkillName({ name, skill }: { name: string; skill: SkillRow | undefined }) {
  if (!skill) return <span className="text-neutral-8">{name}</span>;
  return (
    <Link
      to="/spaces/$name/skills/$skill"
      params={{ name: skill.space, skill: skill.name }}
      className="rounded-xs font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10 focus-visible:focus-ring"
    >
      {name}
    </Link>
  );
}

export function MachineListSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-64" />
      </div>
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-40 w-full" />
      ))}
    </div>
  );
}
