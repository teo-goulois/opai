import { Button } from "@opai/ui/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@opai/ui/components/ui/breadcrumb";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { Markdown } from "@opai/ui/components/ui/markdown";
import { PageHeader, PageMeta, PageTitle } from "@opai/ui/components/ui/page-header";
import { InfoIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { FileState } from "@/components/config/config-page";
import { DocumentEditor } from "@/components/shared/document-editor";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

// One settings file or skill of claude/ or codex/, at its path: /config/claude/settings.json.
const fileQuery = (path: string) => orpc.harness.file.queryOptions({ input: { path } });

export const Route = createFileRoute("/config/$")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(fileQuery(params._splat ?? ""));
    } catch (error) {
      if (
        error instanceof ORPCError &&
        (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
      ) {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteError,
  notFoundComponent: FileNotFound,
  component: HarnessFilePage,
});

function HarnessFilePage() {
  const path = Route.useParams()._splat ?? "";
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = fileQuery(path);
  const { data: file } = useSuspenseQuery(query);
  const update = useMutation(
    orpc.harness.updateFile.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.harness.layout.key() });
      },
    }),
  );
  // Markdown opens rendered; settings and empty files open as source.
  const current =
    view ?? (file.language === "markdown" && file.text.trim() ? "preview" : "markdown");

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/config" />}>{m.nav_config()}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{path}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{path}</PageTitle>
          <PageMeta>
            <span>
              {file.root}/{path}
            </span>
            <FileState exists={file.exists} empty={file.text.trim() === ""} />
          </PageMeta>
        </PageHeader>
      </div>

      {!file.exists ? (
        <p className="flex items-start gap-xs font-ui text-s text-neutral-7">
          <InfoIcon aria-hidden className="mt-xxs shrink-0" />
          {m.config_file_new()}
        </p>
      ) : null}

      <DocumentEditor
        markdown={file.text}
        hash={file.hash}
        view={current}
        onViewChange={(next) => void navigate({ search: { view: next }, replace: true })}
        onSave={(text, baseHash) => update.mutateAsync({ path, text, baseHash })}
        onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
        renderPreview={(source) =>
          source.trim() === "" ? (
            <p className="py-m font-ui text-s text-neutral-7">{m.config_state_empty()}</p>
          ) : file.language === "markdown" ? (
            <Markdown>{source}</Markdown>
          ) : (
            <Markdown>{`\`\`\`${file.language}\n${source}\n\`\`\``}</Markdown>
          )
        }
      />
    </article>
  );
}

function FileNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.config_file_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.config_file_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/config" />}>
          {m.config_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
