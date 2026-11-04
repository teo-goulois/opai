import type { SkillUsage } from "@opai/context/routers/skills";
import type { SkillDetail as Detail, UpdateResult } from "@opai/context/skills";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import { Button } from "@opai/ui/components/ui/button";
import { DescriptionItem, DescriptionList } from "@opai/ui/components/ui/description-list";
import { DiffView } from "@opai/ui/components/ui/diff";
import { Markdown } from "@opai/ui/components/ui/markdown";
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
import { RefreshIcon } from "@opai/ui/icon";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { m } from "@/paraglide/messages.js";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";

import { costLine, SkillBadges, sourceLabel, usageLine } from "./skill-list";

type Skill = Detail & { usage: SkillUsage };

export function SkillDocument({
  skill,
  spaces,
  view,
  onViewChange,
  onSave,
  onReload,
}: {
  skill: Skill;
  spaces: string[];
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  onSave: (markdown: string, baseHash: string) => Promise<unknown>;
  onReload: () => Promise<unknown>;
}) {
  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/skills" />}>{m.nav_skills()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{skill.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle className="font-data">{skill.name}</PageTitle>
          {skill.description ? (
            <PageDescription className="text-pretty">{skill.description}</PageDescription>
          ) : null}
          <PageMeta>
            <SkillBadges skill={skill} />
            <span className="font-data">{skill.folder}</span>
          </PageMeta>
        </PageHeader>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-xl">
          <DocumentEditor
            markdown={skill.markdown}
            hash={skill.hash}
            view={view}
            onViewChange={onViewChange}
            onSave={onSave}
            onReload={onReload}
            renderPreview={(source) => <Markdown>{withoutFrontMatter(source)}</Markdown>}
          />
          {skill.provenance ? <Compare skill={skill} /> : null}
        </div>

        <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
          <PageSection>
            <PageSectionTitle>{m.skill_usage()}</PageSectionTitle>
            <p className="font-ui text-s text-neutral-10">{usageLine(skill.usage)}</p>
            {costLine(skill) ? (
              <p className="font-ui text-s text-neutral-7">{costLine(skill)}</p>
            ) : null}
          </PageSection>

          <PageSection>
            <PageSectionTitle>{m.skill_details()}</PageSectionTitle>
            <DescriptionList>
              <DescriptionItem label={m.skill_space()}>
                <MoveSpace skill={skill} spaces={spaces} />
              </DescriptionItem>
              <DescriptionItem label={m.skill_source()}>
                {skill.provenance ? (
                  <span className="break-all">{sourceLabel(skill.provenance.source)}</span>
                ) : (
                  m.skill_source_none()
                )}
              </DescriptionItem>
              {skill.provenance?.revision ? (
                <DescriptionItem label={m.skill_revision()}>
                  <span className="font-data">{skill.provenance.revision.slice(0, 12)}</span>
                </DescriptionItem>
              ) : null}
              {skill.provenance ? (
                <DescriptionItem label={m.skill_updated()}>
                  {formatDate(skill.provenance.updatedAt)}
                </DescriptionItem>
              ) : null}
              {skill.provenance?.notes ? (
                <DescriptionItem label={m.skill_notes()}>{skill.provenance.notes}</DescriptionItem>
              ) : null}
              {skill.files.length > 0 ? (
                <DescriptionItem label={m.skill_files()}>
                  <ul className="flex flex-col gap-xxs font-data">
                    {skill.files.map((file) => (
                      <li key={file} className="break-all">
                        {file}
                      </li>
                    ))}
                  </ul>
                </DescriptionItem>
              ) : null}
            </DescriptionList>
          </PageSection>
        </aside>
      </div>
    </article>
  );
}

function MoveSpace({ skill, spaces }: { skill: Skill; spaces: string[] }) {
  const queryClient = useQueryClient();
  const move = useMutation(
    orpc.skills.move.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: orpc.skills.key() }),
    }),
  );
  return (
    <div className="flex flex-col gap-xs">
      <ToggleGroup
        aria-label={m.skill_move()}
        value={[skill.space]}
        disabled={move.isPending}
        onValueChange={(value) => {
          const space = value[0];
          if (space && space !== skill.space) move.mutate({ name: skill.name, space });
        }}
        className="flex-wrap"
      >
        {spaces.map((space) => (
          <ToggleGroupItem key={space} value={space}>
            {space}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {move.error ? <p className="font-ui text-s text-error">{move.error.message}</p> : null}
    </div>
  );
}

function Compare({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const compare = useMutation(orpc.skills.compare.mutationOptions());
  const apply = useMutation(
    orpc.skills.compare.mutationOptions({
      onSuccess: () => {
        compare.reset();
        void queryClient.invalidateQueries({ queryKey: orpc.skills.key() });
      },
    }),
  );
  const result: UpdateResult | undefined = compare.data;
  const error = compare.error ?? apply.error;

  return (
    <PageSection aria-labelledby="skill-compare">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <PageSectionTitle id="skill-compare">{m.skill_source()}</PageSectionTitle>
        <Button
          variant="outline"
          disabled={compare.isPending}
          onClick={() => compare.mutate({ name: skill.name })}
        >
          <RefreshIcon data-slot="icon" aria-hidden />
          {m.skill_compare()}
        </Button>
      </div>
      {error ? <p className="font-ui text-s text-error">{error.message}</p> : null}
      {result ? (
        <div className="flex flex-col gap-s">
          <p className="font-ui text-s text-neutral-8">
            {!result.diff
              ? m.skill_compare_same()
              : result.upstreamChanged
                ? m.skill_compare_upstream()
                : m.skill_compare_local()}
          </p>
          {result.upstreamChanged ? (
            result.modified ? (
              <p className="font-ui text-s text-neutral-8">
                {m.skill_apply_blocked({ name: skill.name })}
              </p>
            ) : (
              <Button
                variant="primary"
                className="w-fit"
                disabled={apply.isPending}
                onClick={() => apply.mutate({ name: skill.name, apply: true })}
              >
                {m.skill_apply()}
              </Button>
            )
          ) : null}
          {result.diff ? <DiffView diff={result.diff} /> : null}
        </div>
      ) : null}
    </PageSection>
  );
}

/** The header shows the name and description; the preview starts at the body. */
function withoutFrontMatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function SkillDetailSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-s) w-24" />
        <Skeleton className="h-(--line-l) w-48" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
