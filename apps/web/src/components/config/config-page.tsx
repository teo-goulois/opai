import type {
  HarnessFileSummary,
  HarnessInstructions,
  HarnessLayout,
  HarnessSkillFolder,
} from "@opai/context/harness";
import type { RuleSummary } from "@opai/context/rules";
import { Badge } from "@opai/ui/components/ui/badge";
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
import { Link } from "@tanstack/react-router";

import { Hint } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";

/** What Claude Code and Codex read in claude/ and codex/, and the instance's own rules. */
export function ConfigPage({ layout, rules }: { layout: HarnessLayout; rules: RuleSummary[] }) {
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <PageTitle>{m.config_title()}</PageTitle>
        <PageMeta>
          <span>{layout.root}</span>
        </PageMeta>
      </PageHeader>

      <PageSection aria-labelledby="config-instructions">
        <div className="flex flex-col gap-xxs">
          <PageSectionTitle id="config-instructions" count={layout.instructions.length}>
            {m.config_instructions()}
          </PageSectionTitle>
          <Hint>{m.config_instructions_hint()}</Hint>
        </div>
        <ItemList>
          {layout.instructions.map((file) => (
            <li key={file.path}>
              <InstructionsRow file={file} />
            </li>
          ))}
        </ItemList>
      </PageSection>

      <PageSection aria-labelledby="config-files">
        <PageSectionTitle id="config-files" count={layout.files.length}>
          {m.config_settings()}
        </PageSectionTitle>
        <ItemList>
          {layout.files.map((file) => (
            <li key={file.path}>
              <FileRow file={file} />
            </li>
          ))}
        </ItemList>
      </PageSection>

      {rules.length > 0 ? (
        <PageSection aria-labelledby="config-rules">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="config-rules" count={rules.length}>
              {m.config_rules()}
            </PageSectionTitle>
            <Hint>{m.rules_scope_repository_hint()}</Hint>
          </div>
          <ItemList>
            {rules.map((rule) => (
              <li key={rule.id}>
                <ItemRow render={<Link to="/config/rules/$id" params={{ id: rule.id }} />}>
                  <ItemMain>
                    <ItemTitle>{rule.title}</ItemTitle>
                    <ItemDescription>
                      {rule.pointsTo ? m.rules_points_to({ file: rule.pointsTo }) : rule.summary}
                    </ItemDescription>
                  </ItemMain>
                  <ItemEnd>{rule.path}</ItemEnd>
                </ItemRow>
              </li>
            ))}
          </ItemList>
        </PageSection>
      ) : null}

      <PageSection aria-labelledby="config-skills">
        <PageSectionTitle
          id="config-skills"
          count={layout.skillFolders.reduce((sum, folder) => sum + folder.skills.length, 0)}
        >
          {m.config_skills()}
        </PageSectionTitle>
        <div className="flex flex-col gap-l">
          {layout.skillFolders.map((folder) => (
            <SkillFolder key={folder.path} folder={folder} />
          ))}
        </div>
      </PageSection>
    </div>
  );
}

function InstructionsRow({ file }: { file: HarnessInstructions }) {
  const global = file.target === "spaces/global/AGENTS.md";
  return (
    <ItemRow
      render={
        global ? (
          <Link to="/spaces/$name/rules/$id" params={{ name: "global", id: "global-agents" }} />
        ) : undefined
      }
    >
      <ItemMain>
        <ItemTitle>{toolName(file.tool)}</ItemTitle>
        <ItemDescription>{file.path}</ItemDescription>
      </ItemMain>
      <ItemEnd>
        {global ? (
          <span>{m.config_instructions_global()}</span>
        ) : (
          <Badge variant="warning">
            {file.target
              ? m.config_instructions_other({ target: file.target })
              : m.config_not_link()}
          </Badge>
        )}
      </ItemEnd>
    </ItemRow>
  );
}

function FileRow({ file }: { file: HarnessFileSummary }) {
  return (
    <ItemRow render={<Link to="/config/$" params={{ _splat: file.path }} />}>
      <ItemMain>
        <ItemTitle>
          {toolName(file.tool)} · {file.path.split("/").at(-1)}
        </ItemTitle>
        <ItemDescription>{file.path}</ItemDescription>
      </ItemMain>
      <ItemEnd>
        <FileState exists={file.exists} empty={file.empty} />
      </ItemEnd>
    </ItemRow>
  );
}

function SkillFolder({ folder }: { folder: HarnessSkillFolder }) {
  return (
    <div className="flex flex-col gap-s">
      <div className="flex flex-wrap items-baseline gap-x-s gap-y-xxs">
        <span className="font-ui text-m font-medium text-neutral-10">{toolName(folder.tool)}</span>
        <span className="font-ui text-s text-neutral-7">{folder.path}/</span>
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
      ) : (
        <Hint>{m.config_skills_none()}</Hint>
      )}
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
