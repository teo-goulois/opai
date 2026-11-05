import type { HandbookPage } from "@opai/context/handbook/pages";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import { Button } from "@opai/ui/components/ui/button";
import { Markdown } from "@opai/ui/components/ui/markdown";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { ExternalLinkIcon, InfoIcon, PullRequestIcon } from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";

import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { DocumentLayout } from "@/components/shared/document-layout";
import { PromptButton, promptText } from "@/components/shared/prompt-button";
import { m } from "@/paraglide/messages.js";

import { GeneratedBadge } from "./handbook-index";
import { handbookMarkdownComponents } from "./handbook-link";

export function HandbookPageView({
  page,
  site,
  publishable,
  view,
  onViewChange,
  onSave,
  onReload,
}: {
  page: HandbookPage;
  /** The published handbook's root, for links between pages. */
  site: string | undefined;
  publishable: boolean;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  onSave: (markdown: string, baseHash: string) => Promise<unknown>;
  onReload: () => Promise<unknown>;
}) {
  const buildPrompt = (request: string) =>
    promptText(
      m.prompt_handbook_intro({ title: page.title, path: page.path }),
      m.prompt_request_line({ request }),
      page.generated && m.prompt_handbook_generated(),
      m.prompt_handbook_steps(),
    );

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/handbook" />}>{m.nav_handbook()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{page.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <div className="flex flex-wrap items-center gap-xs">
            <PageTitle>{page.title}</PageTitle>
            <GeneratedBadge page={page} />
          </div>
          <PageDescription>{page.description}</PageDescription>
          <PageMeta>
            <span className="wrap-anywhere">{page.path}</span>
            {page.url ? (
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-xxs rounded-xs underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10"
              >
                {m.handbook_view_online()}
                <ExternalLinkIcon aria-hidden />
              </a>
            ) : null}
          </PageMeta>
        </PageHeader>
      </div>

      {page.generated ? <GeneratedNote publishable={publishable} /> : null}

      <DocumentEditor
        markdown={page.markdown}
        hash={page.hash}
        view={view}
        onViewChange={onViewChange}
        onSave={onSave}
        onReload={onReload}
        actions={<PromptButton buildPrompt={buildPrompt} />}
        renderPreview={(source) => (
          <DocumentLayout toc={page.sections}>
            <Markdown components={handbookMarkdownComponents(site)}>{source}</Markdown>
          </DocumentLayout>
        )}
      />
    </article>
  );
}

/** Says which part of the page comes from the instance, and how to change it. */
function GeneratedNote({ publishable }: { publishable: boolean }) {
  return (
    <div className="flex flex-wrap items-start gap-s rounded-s bg-neutral-2 p-s edge-outer dark:bg-neutral-3 font-ui text-s text-neutral-10">
      <InfoIcon aria-hidden className="mt-xxs shrink-0" />
      <p className="min-w-0 flex-1 basis-64">{m.handbook_generated_hint()}</p>
      {publishable ? (
        <div className="flex flex-wrap gap-xs">
          <Button variant="outline" render={<Link to="/handbook/publish" />}>
            <PullRequestIcon data-slot="icon" aria-hidden />
            {m.handbook_publish()}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
