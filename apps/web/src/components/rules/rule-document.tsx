import type { RuleDetail } from "@opai/context/rules";
import { Markdown } from "@opai/ui/components/ui/markdown";
import { PageHeader, PageMeta, PageTitle } from "@opai/ui/components/ui/page-header";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { DocumentLayout } from "@/components/shared/document-layout";
import { PromptButton, promptText } from "@/components/shared/prompt-button";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const ruleQuery = (id: string) => orpc.rules.get.queryOptions({ input: { id } });

/**
 * One rule file, read and edited in place. `crumbs` says where it sits;
 * `children` goes between its title and its text (the switches of a module).
 */
export function RuleDocument({
  id,
  crumbs,
  meta,
  view,
  onViewChange,
  children,
}: {
  id: string;
  crumbs: ReactNode;
  meta?: ReactNode;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  children?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const query = ruleQuery(id);
  const { data: rule } = useSuspenseQuery(query);
  const update = useMutation(
    orpc.rules.update.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.rules.list.key() });
      },
    }),
  );

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        {crumbs}
        <PageHeader>
          <PageTitle>{rule.title}</PageTitle>
          <PageMeta>
            <span>{rule.path}</span>
            {meta}
          </PageMeta>
        </PageHeader>
      </div>

      {children}

      <RuleEditor
        rule={rule}
        view={view}
        onViewChange={onViewChange}
        onSave={(markdown, baseHash) => update.mutateAsync({ id, markdown, baseHash })}
        onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
      />
    </article>
  );
}

function RuleEditor({
  rule,
  view,
  onViewChange,
  onSave,
  onReload,
}: {
  rule: RuleDetail;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  onSave: (markdown: string, baseHash: string) => Promise<unknown>;
  onReload: () => Promise<unknown>;
}) {
  const buildPrompt = (request: string) =>
    promptText(
      m.prompt_rule_intro({ path: `${rule.root}/${rule.path}`, title: rule.title }),
      m.prompt_request_line({ request }),
      m.prompt_rule_steps(),
    );

  return (
    <DocumentEditor
      markdown={rule.markdown}
      hash={rule.hash}
      view={view}
      onViewChange={onViewChange}
      onSave={onSave}
      onReload={onReload}
      actions={<PromptButton buildPrompt={buildPrompt} />}
      renderPreview={(source) => (
        <DocumentLayout toc={rule.sections}>
          <Markdown>{stripTitle(source)}</Markdown>
        </DocumentLayout>
      )}
    />
  );
}

/** The page header already shows the H1. */
function stripTitle(markdown: string) {
  return markdown.replace(/^\s*#\s+.+\r?\n/, "");
}
