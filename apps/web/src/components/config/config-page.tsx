import type {
  HarnessFileSummary,
  HarnessInstructions,
  HarnessLayout,
  HarnessSkillFolder,
} from "@opai/context/harness";
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

const rowClassName =
  "flex flex-wrap items-center justify-between gap-x-m gap-y-xxs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4";
const listClassName =
  "flex flex-col overflow-hidden rounded-m bg-neutral-1 edge-outer dark:bg-neutral-2";
const linkClassName =
  "w-fit rounded-xs font-ui text-m font-medium text-neutral-10 underline decoration-transparent underline-offset-4 transition-colors hover:decoration-neutral-10";

/** What Claude Code and Codex read in claude/ and codex/. */
export function ConfigPage({ layout }: { layout: HarnessLayout }) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.config_title()}</PageTitle>
        <PageMeta>
          <span className="font-data">{layout.root}</span>
        </PageMeta>
      </PageHeader>

      <PageSection aria-labelledby="config-instructions">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="config-instructions" count={layout.instructions.length}>
            {m.config_instructions()}
          </PageSectionTitle>
          <p className="font-ui text-s text-neutral-7">{m.config_instructions_hint()}</p>
        </div>
        <ul className={listClassName}>
          {layout.instructions.map((file) => (
            <li key={file.path}>
              <InstructionsRow file={file} />
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection aria-labelledby="config-files">
        <PageSectionTitle id="config-files" count={layout.files.length}>
          {m.config_settings()}
        </PageSectionTitle>
        <ul className={listClassName}>
          {layout.files.map((file) => (
            <li key={file.path}>
              <FileRow file={file} />
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection aria-labelledby="config-skills">
        <PageSectionTitle
          id="config-skills"
          count={layout.skillFolders.reduce((sum, folder) => sum + folder.skills.length, 0)}
        >
          {m.config_skills()}
        </PageSectionTitle>
        <ul className={listClassName}>
          {layout.skillFolders.map((folder) => (
            <li key={folder.path}>
              <SkillFolderRow folder={folder} />
            </li>
          ))}
        </ul>
      </PageSection>
    </div>
  );
}

function InstructionsRow({ file }: { file: HarnessInstructions }) {
  return (
    <div className={rowClassName}>
      <div className="flex flex-col gap-xxs">
        <span className="font-ui text-m font-medium text-neutral-10">{toolName(file.tool)}</span>
        <span className="font-data text-s text-neutral-7">{file.path}</span>
      </div>
      {file.target === "spaces/global/AGENTS.md" ? (
        <Link to="/rules/$id" params={{ id: "global-agents" }} className={linkClassName}>
          {m.config_instructions_global()}
        </Link>
      ) : (
        <Badge variant="warning">
          {file.target ? m.config_instructions_other({ target: file.target }) : m.config_not_link()}
        </Badge>
      )}
    </div>
  );
}

function FileRow({ file }: { file: HarnessFileSummary }) {
  return (
    <div className={rowClassName}>
      <div className="flex flex-col gap-xxs">
        <Link to="/config/$" params={{ _splat: file.path }} className={linkClassName}>
          {toolName(file.tool)} · {file.path.split("/").at(-1)}
        </Link>
        <span className="font-data text-s text-neutral-7">{file.path}</span>
      </div>
      <FileState exists={file.exists} empty={file.empty} />
    </div>
  );
}

function SkillFolderRow({ folder }: { folder: HarnessSkillFolder }) {
  return (
    <div className="flex flex-col gap-xs px-m py-s in-[li:not(:first-child)]:edge-top in-[li:not(:first-child)]:edge-neutral-4">
      <div className="flex flex-wrap items-center justify-between gap-x-m gap-y-xxs">
        <div className="flex flex-col gap-xxs">
          <span className="font-ui text-m font-medium text-neutral-10">
            {toolName(folder.tool)}
          </span>
          <span className="font-data text-s text-neutral-7">{folder.path}/</span>
        </div>
        {folder.skills.length === 0 ? (
          <Badge variant="neutral">{m.config_skills_none()}</Badge>
        ) : null}
      </div>
      {folder.skills.length > 0 ? (
        <ul className="flex flex-wrap gap-xxs">
          {folder.skills.map((skill) => (
            <li key={skill.name}>
              {skill.hasSkillMd ? (
                <Badge
                  variant="neutral"
                  className="transition-colors hover:bg-neutral-4 hover:text-neutral-10 focus-visible:focus-ring"
                  render={<Link to="/config/$" params={{ _splat: skill.path }} />}
                >
                  {skill.name}
                </Badge>
              ) : (
                <Badge variant="warning">
                  {skill.name}: {m.config_skill_no_file()}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FileState({ exists, empty }: { exists: boolean; empty: boolean }) {
  if (!exists) return <Badge variant="neutral">{m.config_state_missing()}</Badge>;
  if (empty) return <Badge variant="neutral">{m.config_state_empty()}</Badge>;
  return <Badge variant="success">{m.config_state_filled()}</Badge>;
}

export function toolName(tool: "claude" | "codex") {
  return tool === "claude" ? m.config_tool_claude() : m.config_tool_codex();
}

export function ConfigPageSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-32" />
        <Skeleton className="h-(--line-s) w-48" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
