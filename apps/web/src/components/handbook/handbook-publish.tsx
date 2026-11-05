import type { PublishPreview, PublishResult } from "@opai/context/handbook/publish";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import { Button } from "@opai/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import { DiffView } from "@opai/ui/components/ui/diff";
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Spinner } from "@opai/ui/components/ui/spinner";
import {
  CheckIcon,
  ExternalLinkIcon,
  PullRequestIcon,
  RefreshIcon,
  WarningIcon,
} from "@opai/ui/icon";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";

import { ErrorNote } from "./handbook-index";

type Preview =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: PublishPreview; refreshing: boolean };

export function HandbookPublish({
  preview,
  onCompare,
  onPublish,
}: {
  preview: Preview;
  onCompare: () => void;
  onPublish: (diffHash: string) => Promise<PublishResult>;
}) {
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  async function publish(diffHash: string) {
    setPublishing(true);
    setError(null);
    try {
      setResult(await onPublish(diffHash));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  }

  const busy = preview.status === "loading" || (preview.status === "ready" && preview.refreshing);

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/handbook" />}>{m.nav_handbook()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{m.handbook_publish()}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <div className="flex flex-wrap items-start justify-between gap-m">
            <div className="flex min-w-0 flex-col gap-xs">
              <PageTitle>{m.handbook_publish_title()}</PageTitle>
              <PageDescription>{m.handbook_publish_description()}</PageDescription>
            </div>
            <Button variant="outline" isPending={busy} onClick={onCompare}>
              <RefreshIcon data-slot="icon" aria-hidden />
              {m.handbook_publish_compare_again()}
            </Button>
          </div>
          {preview.status === "ready" ? (
            <PageMeta>
              <span title={preview.preview.base.subject}>
                {m.handbook_publish_base({ sha: preview.preview.base.sha.slice(0, 7) })}
              </span>
            </PageMeta>
          ) : null}
        </PageHeader>
      </div>

      {result?.status === "opened" ? (
        <Note tone="success">
          <span className="flex-1">{m.handbook_publish_opened({ branch: result.branch })}</span>
          {result.url ? (
            <Button
              variant="outline"
              render={<a href={result.url} target="_blank" rel="noreferrer" />}
            >
              {m.handbook_publish_view_pr()}
              <ExternalLinkIcon data-slot="icon" aria-hidden />
            </Button>
          ) : null}
        </Note>
      ) : null}
      {error ? <ErrorNote title={m.handbook_publish_failed()} message={error} /> : null}

      {preview.status === "loading" ? (
        <p className="flex items-center gap-xs font-ui text-m text-neutral-7" role="status">
          <Spinner aria-hidden />
          {m.handbook_publish_comparing()}
        </p>
      ) : preview.status === "error" ? (
        <ErrorNote message={preview.message} />
      ) : (
        <PreviewBody
          preview={preview.preview}
          published={result?.status === "opened"}
          publishing={publishing}
          onPublish={(hash) => void publish(hash)}
        />
      )}
    </div>
  );
}

function PreviewBody({
  preview,
  published,
  publishing,
  onPublish,
}: {
  preview: PublishPreview;
  published: boolean;
  publishing: boolean;
  onPublish: (diffHash: string) => void;
}) {
  const openPullRequests = preview.pullRequests ?? [];
  return (
    <div className="flex flex-col gap-l">
      {openPullRequests.length > 0 ? (
        <Note tone="warning">
          <div className="flex flex-col gap-xs">
            <span>{m.handbook_publish_open_prs()}</span>
            <ul className="flex flex-col gap-xxs">
              {openPullRequests.map((pr) => (
                <li key={pr.number}>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-xxs rounded-xs underline decoration-neutral-5 underline-offset-4 hover:decoration-neutral-10"
                  >
                    #{pr.number} {pr.title}
                    <ExternalLinkIcon aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Note>
      ) : null}

      {preview.files.length === 0 ? (
        <Note tone="success">{m.handbook_publish_up_to_date()}</Note>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-m">
            <p className="font-ui text-m font-medium text-neutral-10">
              {m.handbook_publish_changes({ count: preview.files.length })}
            </p>
            {published ? null : (
              <Dialog>
                <DialogTrigger render={<Button variant="primary" isPending={publishing} />}>
                  <PullRequestIcon data-slot="icon" aria-hidden />
                  {m.handbook_publish_open()}
                </DialogTrigger>
                <DialogPopup
                  closeLabel={m.close()}
                  className="w-[min(480px,calc(100vw-var(--space-xl)))]"
                >
                  <DialogTitle>{m.handbook_publish_confirm_title()}</DialogTitle>
                  <DialogDescription>{m.handbook_publish_confirm_description()}</DialogDescription>
                  <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                      {m.handbook_publish_cancel()}
                    </DialogClose>
                    <DialogClose
                      render={<Button variant="primary" />}
                      onClick={() => onPublish(preview.diffHash)}
                    >
                      {m.handbook_publish_confirm()}
                    </DialogClose>
                  </DialogFooter>
                </DialogPopup>
              </Dialog>
            )}
          </div>
          <DiffView
            diff={preview.diff}
            // The pages are what to review; the rest is derived from them.
            defaultOpen={(path) => path.startsWith("apps/web/content/")}
          />
        </>
      )}
    </div>
  );
}

function Note({ tone, children }: { tone: "success" | "warning"; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckIcon : WarningIcon;
  return (
    <div
      role="status"
      className={
        tone === "success"
          ? "flex flex-wrap items-center gap-s rounded-s bg-success-transparent p-s font-ui text-s text-neutral-10"
          : "flex flex-wrap items-start gap-s rounded-s bg-warning-transparent p-s font-ui text-s text-neutral-10"
      }
    >
      <Icon aria-hidden className="shrink-0" />
      {children}
    </div>
  );
}
