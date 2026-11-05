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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { Markdown } from "@opai/ui/components/ui/markdown";
import { PageHeader, PageMeta, PageTitle } from "@opai/ui/components/ui/page-header";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { DocumentEditor } from "@/components/shared/document-editor";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/automations/codex")({
  validateSearch: z.object({
    path: z.string().catch(""),
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ path: search.path }),
  loader: async ({ context, deps }) => {
    try {
      await context.queryClient.ensureQueryData(
        orpc.automations.codexFile.queryOptions({ input: { path: deps.path } }),
      );
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
  notFoundComponent: CodexNotFound,
  component: CodexFilePage,
});

function CodexFilePage() {
  const { path, view = "markdown" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = orpc.automations.codexFile.queryOptions({ input: { path } });
  const { data: file } = useSuspenseQuery(query);
  const update = useMutation(
    orpc.automations.updateCodexFile.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(query.queryKey, saved);
        void queryClient.invalidateQueries({ queryKey: orpc.automations.list.key() });
      },
    }),
  );

  return (
    <article className="flex flex-col gap-xl">
      <div className="flex flex-col gap-m">
        <Breadcrumb aria-label={m.breadcrumb()}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link to="/automations" />}>
                {m.nav_automations()}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{file.id}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{file.id}</PageTitle>
          <PageMeta>
            <span className="wrap-anywhere">{file.path}</span>
            <span>{m.automations_edit_hint()}</span>
          </PageMeta>
        </PageHeader>
      </div>

      <DocumentEditor
        markdown={file.text}
        hash={file.hash}
        view={view}
        onViewChange={(next) => void navigate({ search: { path, view: next }, replace: true })}
        onSave={(text, baseHash) => update.mutateAsync({ path, text, baseHash })}
        onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
        renderPreview={(source) => <Markdown>{`\`\`\`toml\n${source}\n\`\`\``}</Markdown>}
      />
    </article>
  );
}

function CodexNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.automations_codex_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.automations_codex_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/automations" />}>
          {m.automations_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
