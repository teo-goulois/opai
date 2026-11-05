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
import {
  PageDescription,
  PageHeader,
  PageMeta,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { ORPCError } from "@orpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { DocumentEditor } from "@/components/shared/document-editor";
import { DocumentLayout } from "@/components/shared/document-layout";
import { RouteError } from "@/components/shared/route-error";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/automations/$space/")({
  validateSearch: z.object({
    view: z.enum(["preview", "markdown"]).optional().catch(undefined),
  }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        orpc.automations.registry.queryOptions({ input: { space: params.space } }),
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
  notFoundComponent: RegistryNotFound,
  component: RegistryPage,
});

function RegistryPage() {
  const { space } = Route.useParams();
  const { view = "preview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const query = orpc.automations.registry.queryOptions({ input: { space } });
  const { data: registry } = useSuspenseQuery(query);
  const update = useMutation(
    orpc.automations.updateRegistry.mutationOptions({
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
              <BreadcrumbPage>{m.automations_registry_of({ space })}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader>
          <PageTitle>{m.automations_registry_of({ space })}</PageTitle>
          <PageDescription className="text-pretty">{m.automations_registry_hint()}</PageDescription>
          <PageMeta>
            <span>{m.automations_registry_entries({ count: registry.entries })}</span>
            <span className="wrap-anywhere">{registry.path}</span>
          </PageMeta>
        </PageHeader>
      </div>

      <DocumentEditor
        markdown={registry.markdown}
        hash={registry.hash}
        view={view}
        onViewChange={(next) =>
          void navigate({ search: { view: next === "preview" ? undefined : next }, replace: true })
        }
        onSave={(markdown, baseHash) => update.mutateAsync({ space, markdown, baseHash })}
        onReload={() => queryClient.refetchQueries({ queryKey: query.queryKey })}
        renderPreview={(source) => (
          <DocumentLayout toc={registry.sections}>
            <Markdown>{source.replace(/^\s*#\s+.+\r?\n/, "")}</Markdown>
          </DocumentLayout>
        )}
      />
    </article>
  );
}

function RegistryNotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.automations_registry_not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.automations_registry_not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/automations" />}>
          {m.automations_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
