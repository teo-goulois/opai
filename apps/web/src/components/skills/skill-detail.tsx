import type { SkillUsage } from "@opai/context/routers/skills";
import type { SkillDetail as Detail, UpdateResult } from "@opai/context/skills";
import { Button } from "@opai/ui/components/ui/button";
import { DescriptionItem, DescriptionList } from "@opai/ui/components/ui/description-list";
import { DiffView } from "@opai/ui/components/ui/diff";
import { Markdown } from "@opai/ui/components/ui/markdown";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";
import { cn } from "@opai/ui/lib/utils";
import { RefreshIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { approxTokens } from "@/components/sessions/session-list";
import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { SpaceCrumbs } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { formatDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";

import { skillChars, SkillModified, SkillTrigger, sourceLabel, usageLine } from "./skill-list";

type Skill = Detail & { usage: SkillUsage };
export type SkillTab = "settings" | "instructions" | "source";

export function SkillDocument({
  skill,
  spaces,
  tab,
  onTabChange,
  view,
  onViewChange,
}: {
  skill: Skill;
  spaces: string[];
  tab: SkillTab;
  onTabChange: (tab: SkillTab) => void;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
}) {
  const queryClient = useQueryClient();
  const query = orpc.skills.get.queryOptions({ input: { name: skill.name } });
  const save = useMutation(
    orpc.skills.save.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, { ...saved, usage: skill.usage });
        void queryClient.invalidateQueries({ queryKey: orpc.skills.list.key() });
      },
    }),
  );
  const current = !skill.provenance && tab === "source" ? "settings" : tab;

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <SpaceCrumbs
          space={skill.space}
          section={{ label: m.nav_skills(), to: "/spaces/$name/skills" }}
          page={skill.name}
        />
        <PageHeader>
          <PageTitle>{skill.name}</PageTitle>
          <PageMeta>
            <SkillTrigger skill={skill} />
            <SkillModified skill={skill} />
            <span>{usageLine(skill.usage)}</span>
          </PageMeta>
        </PageHeader>
      </div>

      <Tabs value={current} onValueChange={(value) => onTabChange(value as SkillTab)}>
        <TabsList>
          <TabsTab value="settings">{m.skill_tab_settings()}</TabsTab>
          <TabsTab value="instructions">{m.skill_tab_instructions()}</TabsTab>
          {skill.provenance ? <TabsTab value="source">{m.skill_source()}</TabsTab> : null}
        </TabsList>

        <TabsPanel value="settings" className="mt-l">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_16rem]">
            <SkillSettings skill={skill} />
            <SkillFacts skill={skill} spaces={spaces} />
          </div>
        </TabsPanel>

        <TabsPanel value="instructions" className="mt-l">
          <DocumentEditor
            markdown={skill.markdown}
            hash={skill.hash}
            view={view}
            onViewChange={onViewChange}
            onSave={(markdown, baseHash) =>
              save.mutateAsync({ name: skill.name, markdown, baseHash })
            }
            onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
            renderPreview={(source) => <Markdown>{withoutFrontMatter(source)}</Markdown>}
          />
        </TabsPanel>

        {skill.provenance ? (
          <TabsPanel value="source" className="mt-l">
            <Compare skill={skill} />
          </TabsPanel>
        ) : null}
      </Tabs>
    </article>
  );
}

/** When the skill starts, and the description the agent reads to decide. */
function SkillSettings({ skill }: { skill: Skill }) {
  const queryClient = useQueryClient();
  const query = orpc.skills.get.queryOptions({ input: { name: skill.name } });
  // A draft only while it differs from the file, so a change made elsewhere shows.
  const [draft, setDraft] = useState<{ explicitOnly: boolean; description: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const explicitOnly = draft?.explicitOnly ?? skill.explicitOnly;
  const description = draft?.description ?? skill.description;
  const edit = (change: Partial<{ explicitOnly: boolean; description: string }>) => {
    setSaved(false);
    setDraft({ explicitOnly, description, ...change });
  };

  const configure = useMutation(
    orpc.skills.configure.mutationOptions({
      onSuccess: (next) => {
        queryClient.setQueryData(query.queryKey, { ...next, usage: skill.usage });
        void queryClient.invalidateQueries({ queryKey: orpc.skills.list.key() });
        setDraft(null);
        setSaved(true);
      },
    }),
  );
  const dirty =
    explicitOnly !== skill.explicitOnly || description.trim() !== skill.description.trim();
  const error =
    configure.error instanceof ORPCError ? configure.error.message : configure.error?.message;
  const options = [
    { value: false, title: m.skill_auto(), hint: m.skill_auto_hint() },
    {
      value: true,
      title: m.skill_explicit(),
      hint: m.skill_explicit_command({ name: skill.name }),
    },
  ];

  return (
    <form
      className="flex min-w-0 flex-col gap-xl"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        configure.mutate({
          name: skill.name,
          baseHash: skill.hash,
          explicitOnly,
          description,
        });
      }}
    >
      <fieldset className="flex flex-col gap-s">
        <legend className="mb-s font-ui text-m font-medium text-neutral-10">
          {m.skill_trigger()}
        </legend>
        <div className="grid gap-s sm:grid-cols-2">
          {options.map((option) => {
            const checked = explicitOnly === option.value;
            return (
              <label
                key={String(option.value)}
                className={cn(
                  "flex cursor-pointer flex-col gap-xxs rounded-m px-m py-s transition-colors",
                  "edge-outer has-focus-visible:focus-ring",
                  checked
                    ? "bg-neutral-2 edge-neutral-10 dark:bg-neutral-3"
                    : "edge-neutral-4 hover:bg-neutral-2",
                )}
              >
                <input
                  type="radio"
                  name="trigger"
                  className="sr-only"
                  checked={checked}
                  onChange={() => edit({ explicitOnly: option.value })}
                />
                <span className="font-ui text-m font-medium text-neutral-10">{option.title}</span>
                <span className="font-ui text-s text-pretty text-neutral-7">{option.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-s">
        <div className="flex flex-col gap-xxs">
          <label htmlFor="skill-description" className="font-ui text-m font-medium text-neutral-10">
            {m.skill_when()}
          </label>
          <p className="font-ui text-s text-pretty text-neutral-7">
            {explicitOnly
              ? m.skill_when_hint_manual()
              : m.skill_when_hint({
                  tokens: approxTokens(skillChars({ name: skill.name, description })),
                })}
          </p>
        </div>
        <Textarea
          id="skill-description"
          value={description}
          rows={5}
          onChange={(event) => edit({ description: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-s">
        <Button type="submit" variant="primary" disabled={!dirty || configure.isPending}>
          {m.editor_save()}
        </Button>
        {dirty ? (
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            {m.editor_cancel()}
          </Button>
        ) : null}
        {error ? <span className="font-ui text-s text-error">{error}</span> : null}
        {saved && !dirty && !error ? (
          <span className="font-ui text-s text-neutral-7">{m.skill_settings_saved()}</span>
        ) : null}
      </div>
    </form>
  );
}

/** Where the skill lives, and where it comes from. */
function SkillFacts({ skill, spaces }: { skill: Skill; spaces: string[] }) {
  return (
    <aside className="flex flex-col gap-l lg:sticky lg:top-xl lg:self-start">
      <PageSection>
        <PageSectionTitle>{m.skill_space()}</PageSectionTitle>
        <MoveSpace skill={skill} spaces={spaces} />
      </PageSection>
      <DescriptionList>
        <DescriptionItem label={m.skill_source()}>
          {skill.provenance ? (
            <span className="break-all">{sourceLabel(skill.provenance.source)}</span>
          ) : (
            m.skill_source_none()
          )}
        </DescriptionItem>
        {skill.provenance ? (
          <DescriptionItem label={m.skill_updated()}>
            {formatDate(skill.provenance.updatedAt)}
          </DescriptionItem>
        ) : null}
        {skill.provenance?.notes ? (
          <DescriptionItem label={m.skill_notes()}>{skill.provenance.notes}</DescriptionItem>
        ) : null}
        <DescriptionItem label={m.skill_folder()}>
          <span className="break-all">{skill.folder}</span>
        </DescriptionItem>
        {skill.files.length > 0 ? (
          <DescriptionItem label={m.skill_files()}>
            <ul className="flex flex-col gap-xxs">
              {skill.files.map((file) => (
                <li key={file} className="break-all">
                  {file}
                </li>
              ))}
            </ul>
          </DescriptionItem>
        ) : null}
      </DescriptionList>
    </aside>
  );
}

function MoveSpace({ skill, spaces }: { skill: Skill; spaces: string[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const move = useMutation(
    orpc.skills.move.mutationOptions({
      onSuccess: (_, input) => {
        void queryClient.invalidateQueries({ queryKey: orpc.skills.key() });
        void navigate({
          to: "/spaces/$name/skills/$skill",
          params: { name: input.space, skill: skill.name },
          replace: true,
        });
      },
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
    <div className="flex flex-col gap-l">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <DescriptionList className="flex-row flex-wrap gap-x-xl">
          <DescriptionItem label={m.skill_source()}>
            <span className="break-all">
              {skill.provenance ? sourceLabel(skill.provenance.source) : ""}
            </span>
          </DescriptionItem>
          {skill.provenance?.revision ? (
            <DescriptionItem label={m.skill_revision()}>
              {skill.provenance.revision.slice(0, 12)}
            </DescriptionItem>
          ) : null}
        </DescriptionList>
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
    </div>
  );
}

/** The Settings tab shows the front matter; the preview starts at the body. */
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
