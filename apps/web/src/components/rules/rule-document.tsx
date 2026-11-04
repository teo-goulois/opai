import type { RuleDetail } from "@opai/context/rules";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import { Markdown } from "@opai/ui/components/ui/markdown";
import { PageHeader, PageMeta, PageTitle } from "@opai/ui/components/ui/page-header";
import { Link } from "@tanstack/react-router";

import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { DocumentLayout } from "@/components/shared/document-layout";
import { PromptButton, promptText } from "@/components/shared/prompt-button";
import { m } from "@/paraglide/messages.js";

export function RuleDocument({
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
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/rules" />}>{m.nav_rules()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{rule.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{rule.title}</PageTitle>
          <PageMeta>
            <span className="font-data">{rule.path}</span>
            {rule.space ? (
              <Link
                to="/spaces/$name"
                params={{ name: rule.space }}
                className="rounded-xs underline decoration-neutral-5 underline-offset-4 transition-colors hover:text-neutral-10 hover:decoration-neutral-10"
              >
                {m.rules_scope_space({ space: rule.space })}
              </Link>
            ) : (
              <span>
                {m.rules_scope_repository()}. {m.rules_scope_repository_hint()}
              </span>
            )}
          </PageMeta>
        </PageHeader>
      </div>

      {rule.pointsTo ? (
        <p className="font-ui text-m text-neutral-8">
          {m.rules_points_to({ file: rule.pointsTo })}.{" "}
          <Link
            to="/rules/$id"
            params={{ id: rule.pointsTo.toLowerCase().replace(/\.md$/, "-md") }}
            className="rounded-xs underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10"
          >
            {rule.pointsTo}
          </Link>
        </p>
      ) : null}

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
    </article>
  );
}

/** The page header already shows the H1. */
function stripTitle(markdown: string) {
  return markdown.replace(/^\s*#\s+.+\r?\n/, "");
}
