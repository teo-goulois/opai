import type { AppRouterClient } from "@opai/context";
import { Badge, badgeVariants } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import { Field, FieldLabel } from "@opai/ui/components/ui/field";
import { Input } from "@opai/ui/components/ui/input";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@opai/ui/components/ui/menu";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Switch } from "@opai/ui/components/ui/switch";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";
import { AddIcon, FolderIcon, MoreIcon, RefreshIcon, WarningIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Hint, orderSpaces, SpaceDot } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { formatRelative } from "@/utils/format";
import { orpc } from "@/utils/orpc";

type McpData = Awaited<ReturnType<AppRouterClient["mcp"]["list"]>>;
type ServerRow = McpData["servers"][number];
type Server = ServerRow["server"];
type SpaceRef = { name: string; base: boolean; default: boolean };
type StatusData = Awaited<ReturnType<AppRouterClient["mcp"]["status"]>>;
type ServerStatus = StatusData["servers"][number];

function errorText(error: unknown) {
  if (!error) return undefined;
  return error instanceof ORPCError || error instanceof Error ? error.message : String(error);
}

/** What a server runs: its URL, or its command line. */
export function target(server: Server) {
  return server.url ?? [server.command, ...(server.args ?? [])].join(" ");
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: orpc.mcp.key() });
}

function ClaudeOnly({ what }: { what: string[] }) {
  return what.length > 0 ? (
    <Badge variant="neutral" title={m.mcp_claude_only_hint({ what: what.join(", ") })}>
      {m.mcp_claude_only()}
    </Badge>
  ) : null;
}

/** The page's filters: what is left to do on a server, or that nothing is. */
export const FILTERS = ["sign-in", "missing", "failed", "ready"] as const;
export type Filter = (typeof FILTERS)[number];

/** Signed in by a tool for itself: that tool only, on this machine. */
function isToolOnly(row: ServerRow, status: ServerStatus | undefined) {
  return row.canSignIn && !row.signIn && status?.status === "connected" && !!status.protected;
}

/** Whether a server is in a filter; undefined while its status is still unknown. */
function matches(filter: Filter, row: ServerRow, status: ServerStatus | undefined) {
  const missing = row.secrets.some((secret) => secret.state === "missing");
  if (filter === "missing") return missing;
  if (!status) return undefined;
  if (filter === "sign-in") return status.status === "needs-auth" || isToolOnly(row, status);
  if (filter === "failed") return status.status === "failed" || status.status === "pending";
  return status.status === "connected" && !isToolOnly(row, status) && !missing;
}

function filterLabel(filter: Filter) {
  return {
    "sign-in": m.mcp_filter_sign_in,
    missing: m.mcp_filter_missing,
    failed: m.mcp_filter_failed,
    ready: m.mcp_filter_ready,
  }[filter]();
}

function filterHint(filter: Filter) {
  return {
    "sign-in": m.mcp_filter_sign_in_hint,
    missing: m.mcp_filter_missing_hint,
    failed: m.mcp_filter_failed_hint,
    ready: m.mcp_filter_ready_hint,
  }[filter]();
}

/** All servers, or those a filter keeps, with how many each one holds. */
function FilterBar({
  filter,
  onFilter,
  counts,
  total,
}: {
  filter: Filter | undefined;
  onFilter: (filter: Filter | undefined) => void;
  counts: Record<Filter, number | undefined>;
  total: number;
}) {
  const count = (value: number | undefined) => (
    <span className="font-regular text-neutral-7 tabular-nums">{value ?? "…"}</span>
  );
  return (
    <ToggleGroup
      aria-label={m.mcp_filter_label()}
      value={[filter ?? "all"]}
      onValueChange={(next) => {
        if (next[0]) onFilter(next[0] === "all" ? undefined : (next[0] as Filter));
      }}
      className="flex-wrap"
    >
      <ToggleGroupItem value="all">
        {m.mcp_filter_all()}
        {count(total)}
      </ToggleGroupItem>
      {FILTERS.map((value) => (
        <ToggleGroupItem
          key={value}
          value={value}
          title={filterHint(value)}
          disabled={counts[value] === 0 && filter !== value}
        >
          {filterLabel(value)}
          {count(counts[value])}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Every MCP server, by space, with what the tools keep outside Opai. */
export function McpPage({
  data,
  filter,
  onFilter,
}: {
  data: McpData;
  filter: Filter | undefined;
  onFilter: (filter: Filter | undefined) => void;
}) {
  const spaces = orderSpaces(data.spaces.map((space) => ({ default: false, ...space })));
  const queryClient = useQueryClient();
  // Claude Code starts every server to answer, so the server keeps it 5 minutes.
  const status = useQuery({
    ...orpc.mcp.status.queryOptions({ input: {} }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const recheck = useMutation({
    mutationFn: () => orpc.mcp.status.call({ refresh: true }),
    onSuccess: (fresh) => queryClient.setQueryData(orpc.mcp.status.queryKey({ input: {} }), fresh),
  });
  const statuses = new Map((status.data?.servers ?? []).map((item) => [serverKey(item), item]));
  const checking = status.isFetching || recheck.isPending;
  const known = !!status.data;
  const counts = Object.fromEntries(
    FILTERS.map((value) => [
      value,
      value === "missing" || known
        ? data.servers.filter((row) => matches(value, row, statuses.get(serverKey(row)))).length
        : undefined,
    ]),
  ) as Record<Filter, number | undefined>;
  // Until the status is known, a status filter keeps every server rather than none.
  const shown = filter
    ? data.servers.filter((row) => matches(filter, row, statuses.get(serverKey(row))) ?? !known)
    : data.servers;
  return (
    <div className="flex flex-col gap-xl">
      <PageHeader>
        <div className="flex flex-wrap items-center justify-between gap-s">
          <PageTitle>{m.mcp_title()}</PageTitle>
          <AddDialog spaces={spaces} />
        </div>
        <PageMeta>
          <span>{m.mcp_count({ count: data.servers.length })}</span>
          <span>{m.mcp_applies_next()}</span>
          <span className="flex items-center gap-xxs">
            {checking
              ? m.mcp_checking()
              : status.data
                ? m.mcp_checked({
                    when: formatRelative(new Date(status.data.checkedAt).toISOString()),
                  })
                : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.mcp_check_again()}
              title={m.mcp_check_again()}
              isPending={checking}
              onClick={() => recheck.mutate()}
            >
              <RefreshIcon aria-hidden />
            </Button>
          </span>
        </PageMeta>
      </PageHeader>

      {errorText(recheck.error ?? status.error) ? (
        <Hint>{m.mcp_status_unknown({ reason: errorText(recheck.error ?? status.error)! })}</Hint>
      ) : null}

      {data.infisical.error ? (
        <Hint>{m.mcp_infisical_off({ reason: data.infisical.error })}</Hint>
      ) : null}

      {data.problems.length > 0 ? (
        <section
          aria-labelledby="mcp-problems"
          className="flex flex-col gap-xs rounded-m bg-warning-transparent px-m py-s"
        >
          <h2
            id="mcp-problems"
            className="flex items-center gap-xs font-ui text-m font-medium text-neutral-10"
          >
            <WarningIcon aria-hidden />
            {m.mcp_problems()}
          </h2>
          <p className="font-ui text-s text-neutral-8">{m.mcp_problems_hint()}</p>
          <ul className="flex flex-col gap-xxs font-ui text-s text-neutral-10">
            {data.problems.map((problem) => (
              <li key={problem} className="break-words">
                {problem}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FilterBar filter={filter} onFilter={onFilter} counts={counts} total={data.servers.length} />

      {filter && shown.length === 0 ? (
        <div className="flex flex-wrap items-center gap-s">
          <Hint>{m.mcp_filter_none()}</Hint>
          <Button variant="outline" onClick={() => onFilter(undefined)}>
            {m.mcp_filter_clear()}
          </Button>
        </div>
      ) : null}

      {spaces.map((space, index) => {
        const rows = shown.filter((row) => row.space === space.name);
        if (rows.length === 0 && (!space.base || filter)) return null;
        return (
          <SpaceGroup
            key={space.name}
            space={space}
            index={index}
            rows={rows}
            filter={filter}
            render={(row) => (
              <li key={serverKey(row)}>
                <ServerItem
                  row={row}
                  spaces={spaces}
                  status={statuses.get(serverKey(row))}
                  checking={checking}
                />
              </li>
            )}
            statuses={statuses}
          />
        );
      })}

      {data.found.length > 0 ? (
        <FoundSection found={data.found} servers={data.servers} spaces={spaces} />
      ) : null}
    </div>
  );
}

// Which sections are open: this viewer's choice, kept in the browser. The
// server renders the defaults; the browser's choice follows at hydration.
const OPEN_KEY = "opai.mcp.open";
const openListeners = new Set<() => void>();

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

let openCache: { text: string | null; value: Record<string, boolean> } | undefined;

function openSnapshot() {
  let text: string | null = null;
  try {
    text = localStorage.getItem(OPEN_KEY);
  } catch {}
  if (openCache?.text !== text) openCache = { text, value: readOpen() };
  return openCache.value;
}

/** A section's place in the stored choices: one set without a filter, one per filter. */
function sectionId(filter: Filter | undefined, id: string) {
  return filter ? `${filter}/${id}` : id;
}

function useOpen(id: string, initial: boolean) {
  const stored = useSyncExternalStore(
    (listener) => {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
    openSnapshot,
    () => undefined,
  );
  const open = stored?.[id] ?? initial;
  const setOpen = (next: boolean) => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: next }));
    } catch {}
    for (const listener of openListeners) listener();
  };
  return [open, setOpen] as const;
}

/** How many servers are connected, to sign in, or failing: what a closed section still shows. */
function StatusSummary({
  rows,
  statuses,
}: {
  rows: ServerRow[];
  statuses: Map<string, ServerStatus>;
}) {
  const count = (status: ServerStatus["status"]) =>
    rows.filter((row) => statuses.get(serverKey(row))?.status === status).length;
  const parts = [
    { status: "connected" as const, dot: "bg-success" },
    { status: "needs-auth" as const, dot: "bg-warning" },
    { status: "failed" as const, dot: "bg-error" },
  ]
    .map((part) => ({ ...part, count: count(part.status) }))
    .filter((part) => part.count > 0);
  if (parts.length === 0) return null;
  return (
    <span className="flex items-center gap-s font-ui text-s font-regular text-neutral-7 tabular-nums">
      {parts.map((part) => (
        <span
          key={part.status}
          className="flex items-center gap-xxs"
          title={statusLabel(part.status)}
        >
          <span aria-hidden className={`size-2 rounded-full ${part.dot}`} />
          {part.count}
          <span className="sr-only">{statusLabel(part.status)}</span>
        </span>
      ))}
    </span>
  );
}

/** A space, open by default: its own servers, then its projects, each closed by default. */
function SpaceGroup({
  space,
  index,
  rows,
  filter,
  render,
  statuses,
}: {
  space: SpaceRef;
  index: number;
  rows: ServerRow[];
  filter: Filter | undefined;
  render: (row: ServerRow) => ReactNode;
  statuses: Map<string, ServerStatus>;
}) {
  const [open, setOpen] = useOpen(sectionId(filter, `space:${space.name}`), true);
  const own = rows.filter((row) => !row.project);
  const projects = [...new Set(rows.flatMap((row) => (row.project ? [row.project] : [])))];
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="pt-m edge-top edge-neutral-4"
      render={<section aria-label={space.name} />}
    >
      <CollapsibleTrigger className="py-s">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-s gap-y-xxs">
          <span className="flex items-center gap-xs font-brand text-l font-medium text-neutral-10">
            <SpaceDot index={index} />
            {space.name}
          </span>
          <span className="font-ui text-m font-regular text-neutral-7">
            {space.base ? m.mcp_every_session() : m.mcp_space_sessions({ space: space.name })}
          </span>
          <span className="ml-auto flex items-center gap-m">
            <StatusSummary rows={rows} statuses={statuses} />
            <span className="font-ui text-s font-regular text-neutral-7 tabular-nums">
              {rows.length}
            </span>
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="flex flex-col gap-m pb-s">
          {own.length > 0 ? (
            <ItemList>{own.map(render)}</ItemList>
          ) : projects.length === 0 ? (
            <Hint>{m.mcp_none()}</Hint>
          ) : null}
          {projects.length > 0 ? (
            <div className="flex flex-col gap-xs">
              <div className="flex flex-col gap-xxs">
                <h3 className="font-ui text-m font-medium text-neutral-8">
                  {m.mcp_projects({ space: space.name })}
                </h3>
                <Hint>{m.mcp_project_hint()}</Hint>
              </div>
              {projects.map((project) => (
                <ProjectGroup
                  key={project}
                  rows={rows.filter((row) => row.project === project)}
                  filter={filter}
                  render={render}
                  statuses={statuses}
                />
              ))}
            </div>
          ) : null}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** A project's servers, in a frame that opens on its header. */
function ProjectGroup({
  rows,
  filter,
  render,
  statuses,
}: {
  rows: ServerRow[];
  filter: Filter | undefined;
  render: (row: ServerRow) => ReactNode;
  statuses: Map<string, ServerStatus>;
}) {
  const first = rows[0]!;
  // Under a filter, what it keeps is shown: projects open too.
  const [open, setOpen] = useOpen(sectionId(filter, `project:${first.project}`), !!filter);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="gap-0 rounded-m edge edge-neutral-4 data-open:gap-0"
      render={<section aria-label={first.projectName} />}
    >
      <CollapsibleTrigger className="px-m py-s">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-xs gap-y-xxs">
          <FolderIcon aria-hidden className="size-4 shrink-0 text-neutral-7" />
          <span className="font-ui text-m font-medium text-neutral-10">{first.projectName}</span>
          <span className="truncate font-mono text-s font-regular text-neutral-7">
            {first.projectPath}/.mcp.json
          </span>
          <span className="ml-auto flex items-center gap-m">
            <StatusSummary rows={rows} statuses={statuses} />
            <span className="font-ui text-s font-regular text-neutral-7 tabular-nums">
              {rows.length}
            </span>
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel variant="plain">
        <div className="px-m pb-xs">
          <ItemList>{rows.map(render)}</ItemList>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** A server's place: its name, in its space or its project. */
function serverKey(item: { space: string; project?: string | undefined; name: string }) {
  return `${item.space}/${item.project ?? ""}/${item.name}`;
}

const STATUS_BADGE = {
  connected: "success",
  "needs-auth": "warning",
  failed: "error",
  pending: "neutral",
  disabled: "neutral",
} as const;

function statusLabel(status: ServerStatus["status"]) {
  return {
    connected: m.mcp_status_connected,
    "needs-auth": m.mcp_status_needs_auth,
    failed: m.mcp_status_failed,
    pending: m.mcp_status_pending,
    disabled: m.mcp_status_disabled,
  }[status]();
}

/**
 * A sign-in of Opai's, from the page: the provider's page opens in a new tab,
 * the app waits for its return on localhost and keeps the tokens in Infisical,
 * for Claude Code, Codex and every machine; the page asks until it is over.
 */
function useConnect(row: ServerRow) {
  const queryClient = useQueryClient();
  const input = { name: row.name };
  const [started, setStarted] = useState(false);
  const connect = useMutation(orpc.mcp.connect.mutationOptions());
  const login = useQuery({
    ...orpc.mcp.connection.queryOptions({ input }),
    enabled: started,
    refetchInterval: (query) => (query.state.data?.state === "waiting" ? 1500 : false),
  });
  // null: the app restarted and forgot the sign-in.
  const state = started ? (login.data === null ? "failed" : login.data?.state) : undefined;
  useEffect(() => {
    if (state === "connected" || state === "failed") {
      void queryClient.invalidateQueries({ queryKey: orpc.mcp.key() });
    }
  }, [state, queryClient]);
  return {
    waiting: connect.isPending || (started && (!state || state === "waiting")),
    authUrl: connect.data?.authUrl,
    error: errorText(connect.error) ?? (state === "failed" ? login.data?.error : undefined),
    start() {
      // Opened now, while the click allows it; the address comes after.
      const tab = window.open("", "_blank");
      connect.mutate(
        { ...input, space: row.space, ...(row.project && { project: row.project }) },
        {
          onSuccess: ({ authUrl }) => {
            if (authUrl && tab) tab.location.href = authUrl;
            else tab?.close();
            // The last sign-in's answer must not end this one.
            void queryClient.resetQueries({ queryKey: orpc.mcp.connection.queryKey({ input }) });
            setStarted(true);
          },
          onError: () => tab?.close(),
        },
      );
    },
  };
}

function ServerItem({
  row,
  spaces,
  status,
  checking,
}: {
  row: ServerRow;
  spaces: SpaceRef[];
  status: ServerStatus | undefined;
  checking: boolean;
}) {
  const refresh = useRefresh();
  const connect = useConnect(row);
  const signOut = useMutation(orpc.mcp.signOut.mutationOptions({ onSuccess: refresh }));
  const toolOnly = isToolOnly(row, status);
  const move = useMutation(orpc.mcp.move.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.mcp.remove.mutationOptions({ onSuccess: refresh }));
  const removeFromProject = useMutation(
    orpc.mcp.removeFromProject.mutationOptions({ onSuccess: refresh }),
  );
  const removeError = errorText(remove.error ?? removeFromProject.error ?? move.error);
  // The secret whose field is open: a missing one to set, or a stored one to replace.
  const [secret, setSecret] = useState<string>();
  const missing = row.secrets.filter((item) => item.state === "missing");
  const signInButton =
    row.canSignIn && (status?.status === "needs-auth" || toolOnly || connect.waiting);
  return (
    <ItemRow className="items-start">
      <ItemMain>
        <ItemTitle>
          {row.name}
          <Badge variant="neutral">{row.transport}</Badge>
          <ClaudeOnly what={row.claudeOnly} />
          {status ? (
            <Badge variant={STATUS_BADGE[status.status]}>{statusLabel(status.status)}</Badge>
          ) : checking ? (
            <Badge variant="neutral">{m.mcp_checking()}</Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription className="line-clamp-1 font-mono">{target(row.server)}</ItemDescription>
        {status?.error ? (
          <ItemDescription className="line-clamp-2 text-error">{status.error}</ItemDescription>
        ) : null}
        {toolOnly ? <ItemDescription>{m.mcp_tool_only()}</ItemDescription> : null}
        {row.signIn ? (
          <ItemDescription>
            {m.mcp_signed_in({
              by: row.signIn.by,
              when: formatRelative(new Date(row.signIn.refreshedAt).toISOString()),
            })}
          </ItemDescription>
        ) : null}
        {connect.waiting && connect.authUrl ? (
          <ItemDescription>
            <a href={connect.authUrl} target="_blank" rel="noreferrer" className="underline">
              {m.mcp_connect_open()}
            </a>
          </ItemDescription>
        ) : null}
        {connect.error ? (
          <ItemDescription className="text-error">{connect.error}</ItemDescription>
        ) : null}
        {removeError ? (
          <ItemDescription className="text-error">{removeError}</ItemDescription>
        ) : null}
        {row.secrets.length > 0 ? (
          <span className="flex flex-wrap gap-xxs pt-xxs">
            {row.secrets.map((item) =>
              item.state === "missing" ? (
                <button
                  key={item.name}
                  type="button"
                  className={badgeVariants({
                    variant: "warning",
                    className:
                      "cursor-pointer underline-offset-2 outline-none hover:underline focus-visible:focus-ring",
                  })}
                  onClick={() => setSecret(item.name)}
                >
                  {m.mcp_secret_missing({ name: item.name })}
                </button>
              ) : (
                <Badge key={item.name} variant="success">
                  {item.state === "infisical"
                    ? m.mcp_secret_stored({ name: item.name })
                    : m.mcp_secret_env({ name: item.name })}
                </Badge>
              ),
            )}
          </span>
        ) : null}
      </ItemMain>
      <ItemEnd>
        {missing.length > 0 && !signInButton ? (
          <Button variant="outline" onClick={() => setSecret(missing[0]!.name)}>
            {m.mcp_secret_set({ name: missing[0]!.name })}
          </Button>
        ) : null}
        {signInButton ? (
          <Button variant="outline" isPending={connect.waiting} onClick={connect.start}>
            {connect.waiting
              ? m.mcp_connect_waiting()
              : toolOnly
                ? m.mcp_connect_everywhere()
                : m.mcp_connect()}
          </Button>
        ) : null}
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.mcp_actions({ name: row.name })}
                isPending={
                  move.isPending ||
                  remove.isPending ||
                  removeFromProject.isPending ||
                  signOut.isPending
                }
              />
            }
          >
            <MoreIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup>
            {row.secrets.length > 0 ? (
              <>
                {row.secrets.map((item) => (
                  <MenuItem key={item.name} onClick={() => setSecret(item.name)}>
                    {item.state === "infisical"
                      ? m.mcp_secret_replace({ name: item.name })
                      : m.mcp_secret_set({ name: item.name })}
                  </MenuItem>
                ))}
                <MenuSeparator />
              </>
            ) : null}
            {row.canSignIn ? (
              <>
                <MenuItem onClick={connect.start}>
                  {row.signIn ? m.mcp_connect_again() : m.mcp_connect()}
                </MenuItem>
                {row.signIn ? (
                  <MenuItem onClick={() => signOut.mutate({ name: row.name })}>
                    {m.mcp_sign_out()}
                  </MenuItem>
                ) : null}
                <MenuSeparator />
              </>
            ) : null}
            {row.project ? (
              <MenuItem
                variant="danger"
                onClick={() => removeFromProject.mutate({ name: row.name, project: row.project! })}
              >
                {m.mcp_remove_from_project()}
              </MenuItem>
            ) : (
              <>
                {spaces
                  .filter((space) => space.name !== row.space)
                  .map((space) => (
                    <MenuItem
                      key={space.name}
                      onClick={() =>
                        move.mutate({ name: row.name, from: row.space, to: space.name })
                      }
                    >
                      {m.mcp_move_to({ space: space.name })}
                    </MenuItem>
                  ))}
                <MenuSeparator />
                <MenuItem
                  variant="danger"
                  onClick={() => remove.mutate({ name: row.name, space: row.space })}
                >
                  {m.mcp_remove()}
                </MenuItem>
              </>
            )}
          </MenuPopup>
        </Menu>
      </ItemEnd>
      {secret ? <SecretDialog name={secret} onClose={() => setSecret(undefined)} /> : null}
    </ItemRow>
  );
}

function SpacePicker({
  spaces,
  value,
  onChange,
  label,
}: {
  spaces: SpaceRef[];
  value: string;
  onChange: (space: string) => void;
  label: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        if (next[0]) onChange(next[0]);
      }}
      className="flex-wrap"
    >
      {spaces.map((space) => (
        <ToggleGroupItem key={space.name} value={space.name}>
          {space.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Paste a command, JSON or URL; see what it becomes; add it to a space. */
function AddDialog({ spaces }: { spaces: SpaceRef[] }) {
  const base = spaces.find((space) => space.base)?.name ?? "global";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [space, setSpace] = useState(base);
  const [name, setName] = useState("");
  const [replace, setReplace] = useState(false);
  const typed = useDeferredValue(text.trim());
  const typedName = useDeferredValue(name.trim());
  const preview = useQuery({
    ...orpc.mcp.parse.queryOptions({ input: { text: typed, name: typedName || undefined } }),
    enabled: open && typed.length > 0,
    retry: false,
  });
  const refresh = useRefresh();
  const add = useMutation(
    orpc.mcp.add.mutationOptions({
      onSuccess: () => {
        refresh();
        setOpen(false);
        setText("");
        setName("");
        setReplace(false);
      },
    }),
  );
  const error = errorText(add.error) ?? (typed ? errorText(preview.error) : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSpace(base);
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <AddIcon data-slot="icon" aria-hidden />
        {m.mcp_add()}
      </DialogTrigger>
      <DialogPopup closeLabel={m.close()} className="w-[min(640px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{m.mcp_add_title()}</DialogTitle>
        <DialogDescription>{m.mcp_add_description()}</DialogDescription>
        <form
          className="flex flex-col gap-m"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            add.mutate({ text: text.trim(), space, name: name.trim() || undefined, replace });
          }}
        >
          <Field>
            <FieldLabel>{m.mcp_add_paste()}</FieldLabel>
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="claude mcp add --transport http sentry https://mcp.sentry.dev/mcp"
              className="min-h-24 font-mono text-s"
              spellCheck={false}
              autoFocus
              required
            />
          </Field>

          {preview.data && typed ? (
            <ul className="flex flex-col gap-xs rounded-m bg-neutral-2 px-m py-s">
              {preview.data.map((item) => (
                <li key={item.name} className="flex min-w-0 flex-col gap-xxs font-ui text-s">
                  <span className="flex flex-wrap items-center gap-xs font-medium text-neutral-10">
                    {item.name}
                    <Badge variant="neutral">{item.transport}</Badge>
                    <ClaudeOnly what={item.claudeOnly} />
                  </span>
                  <span className="truncate font-mono text-neutral-8">{target(item.server)}</span>
                  {item.secrets.length > 0 ? (
                    <span className="text-neutral-8">
                      {m.mcp_preview_secrets({ names: item.secrets.join(", ") })}
                    </span>
                  ) : null}
                  {item.notes.length > 0 ? (
                    <span className="text-neutral-7">
                      {m.mcp_preview_left({ notes: item.notes.join("; ") })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col gap-xs">
            <span className="font-ui text-m font-medium text-neutral-10">{m.mcp_add_space()}</span>
            <SpacePicker
              spaces={spaces}
              value={space}
              onChange={setSpace}
              label={m.mcp_add_space()}
            />
            <Hint>{m.mcp_add_space_hint()}</Hint>
          </div>
          <Field>
            <FieldLabel>{m.mcp_add_name()}</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <label className="flex items-center gap-xs font-ui text-m text-neutral-10">
            <Switch checked={replace} onCheckedChange={setReplace} />
            {m.mcp_add_replace()}
          </label>
          {error ? <p className="font-ui text-s text-error">{error}</p> : null}
          <DialogFooter>
            <Button
              type="submit"
              variant="primary"
              disabled={!preview.data || !!preview.error || !text.trim()}
              isPending={add.isPending}
            >
              {m.mcp_add_submit()}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** A field to store a secret in Infisical, a new one or in place of the stored one. */
function SecretDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const [value, setValue] = useState("");
  const refresh = useRefresh();
  const save = useMutation(
    orpc.mcp.setSecret.mutationOptions({
      onSuccess: () => {
        refresh();
        onClose();
      },
    }),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup closeLabel={m.close()} className="w-[min(480px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{m.mcp_secret_title({ name })}</DialogTitle>
        <DialogDescription>{m.mcp_secret_description()}</DialogDescription>
        <form
          className="flex flex-col gap-m"
          onSubmit={(event) => {
            event.preventDefault();
            if (value) save.mutate({ name, value });
          }}
        >
          <Field>
            <FieldLabel>{m.mcp_secret_value()}</FieldLabel>
            <Input
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              required
            />
          </Field>
          {save.error ? <p className="font-ui text-s text-error">{errorText(save.error)}</p> : null}
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={!value} isPending={save.isPending}>
              {m.mcp_secret_submit()}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

type Found = McpData["found"][number];

/** A server of the tools' configs, by name: every file that has it. */
function foundByName(found: Found[]) {
  const groups = new Map<string, { first: Found; where: string[] }>();
  for (const item of found) {
    const group = groups.get(item.name);
    if (group) group.where.push(item.where);
    else groups.set(item.name, { first: item, where: [item.where] });
  }
  return [...groups.values()];
}

/**
 * Servers that plain claude and codex keep in their own configs: to import
 * into a space, or to take out, so that Opai stays their one source.
 */
function FoundSection({
  found,
  servers,
  spaces,
}: {
  found: Found[];
  servers: ServerRow[];
  spaces: SpaceRef[];
}) {
  const [space, setSpace] = useState(spaces.find((item) => item.base)?.name ?? "global");
  const refresh = useRefresh();
  const importOne = useMutation(orpc.mcp.import.mutationOptions({ onSuccess: refresh }));
  const forget = useMutation(orpc.mcp.forget.mutationOptions({ onSuccess: refresh }));
  const groups = foundByName(found);
  // Where Opai has a server of that name: the copies in the tools' configs are left over.
  const inOpai = (name: string) => {
    const row = servers.find((item) => item.name === name);
    return row && (row.projectName ?? row.space);
  };
  const fresh = groups.filter((group) => !inOpai(group.first.name));
  const copies = groups.filter((group) => inOpai(group.first.name));
  const error = errorText(importOne.error ?? forget.error);
  const forgetting = (name: string) => forget.isPending && !!forget.variables?.names.includes(name);
  const places = (group: { where: string[] }) => (
    <ItemDescription className="line-clamp-2">{group.where.join(" · ")}</ItemDescription>
  );
  return (
    <PageSection aria-labelledby="mcp-found">
      <PageSectionTitle id="mcp-found" count={groups.length}>
        {m.mcp_found_title()}
      </PageSectionTitle>
      {error ? <p className="font-ui text-s text-error">{error}</p> : null}

      {fresh.length > 0 ? (
        <>
          <Hint>{m.mcp_found_hint()}</Hint>
          <div className="flex flex-wrap items-center gap-xs">
            <span className="font-ui text-s text-neutral-8">{m.mcp_found_into()}</span>
            <SpacePicker
              spaces={spaces}
              value={space}
              onChange={setSpace}
              label={m.mcp_found_into()}
            />
          </div>
          <ItemList>
            {fresh.map((group) => (
              <li key={group.first.name}>
                <ItemRow className="items-start">
                  <ItemMain>
                    <ItemTitle>{group.first.name}</ItemTitle>
                    <ItemDescription className="line-clamp-1 font-mono">
                      {target(group.first.server)}
                    </ItemDescription>
                    {places(group)}
                  </ItemMain>
                  <ItemEnd>
                    <Button
                      variant="outline"
                      isPending={
                        importOne.isPending && importOne.variables?.names[0] === group.first.name
                      }
                      onClick={() => importOne.mutate({ names: [group.first.name], space })}
                    >
                      {m.mcp_import()}
                    </Button>
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={m.mcp_actions({ name: group.first.name })}
                            isPending={forgetting(group.first.name)}
                          />
                        }
                      >
                        <MoreIcon aria-hidden />
                      </MenuTrigger>
                      <MenuPopup>
                        <MenuItem
                          variant="danger"
                          onClick={() => forget.mutate({ names: [group.first.name] })}
                        >
                          {m.mcp_found_remove()}
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </ItemEnd>
                </ItemRow>
              </li>
            ))}
          </ItemList>
        </>
      ) : null}

      {copies.length > 0 ? (
        <div className="flex flex-col gap-xs">
          <div className="flex flex-wrap items-center justify-between gap-s">
            <h3 className="font-ui text-m font-medium text-neutral-8">{m.mcp_copies_title()}</h3>
            <Button
              variant="outline"
              isPending={forget.isPending && (forget.variables?.names.length ?? 0) > 1}
              onClick={() => forget.mutate({ names: copies.map((group) => group.first.name) })}
            >
              {m.mcp_copies_remove_all()}
            </Button>
          </div>
          <Hint>{m.mcp_copies_hint()}</Hint>
          <ItemList>
            {copies.map((group) => (
              <li key={group.first.name}>
                <ItemRow className="items-start">
                  <ItemMain>
                    <ItemTitle>
                      {group.first.name}
                      <Badge variant="neutral">
                        {m.mcp_copy_of({ where: inOpai(group.first.name)! })}
                      </Badge>
                    </ItemTitle>
                    {places(group)}
                  </ItemMain>
                  <ItemEnd>
                    <Button
                      variant="ghost"
                      isPending={forgetting(group.first.name)}
                      onClick={() => forget.mutate({ names: [group.first.name] })}
                    >
                      {m.mcp_found_remove()}
                    </Button>
                  </ItemEnd>
                </ItemRow>
              </li>
            ))}
          </ItemList>
        </div>
      ) : null}
    </PageSection>
  );
}

export function McpPageSkeleton() {
  return (
    <div className="flex flex-col gap-xl" aria-busy="true">
      <div className="flex flex-col gap-xs">
        <Skeleton className="h-(--line-l) w-40" />
        <Skeleton className="h-(--line-s) w-64" />
      </div>
      <div className="flex flex-col gap-s">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
