import type { AppRouterClient } from "@opai/context";
import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
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
import { AddIcon, MoreIcon, WarningIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { Hint, orderSpaces, SpaceDot } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

type McpData = Awaited<ReturnType<AppRouterClient["mcp"]["list"]>>;
type ServerRow = McpData["servers"][number];
type Server = ServerRow["server"];
type SpaceRef = { name: string; base: boolean; default: boolean };

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

/** Every MCP server, by space, with what the tools keep outside Opai. */
export function McpPage({ data }: { data: McpData }) {
  const spaces = orderSpaces(data.spaces.map((space) => ({ default: false, ...space })));
  const notDeclared = data.found.filter((found) => !found.declared);
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
        </PageMeta>
      </PageHeader>

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

      {spaces.map((space, index) => {
        const rows = data.servers.filter((row) => row.space === space.name);
        if (rows.length === 0 && !space.base) return null;
        return (
          <PageSection key={space.name} aria-labelledby={`mcp-${space.name}`}>
            <PageSectionTitle id={`mcp-${space.name}`} count={rows.length || undefined}>
              <span className="flex items-center gap-xs">
                <SpaceDot index={index} />
                {space.name}
                <span className="font-regular text-neutral-7">
                  {space.base ? m.mcp_every_session() : m.mcp_space_sessions({ space: space.name })}
                </span>
              </span>
            </PageSectionTitle>
            {rows.length > 0 ? (
              <ItemList>
                {rows.map((row) => (
                  <li key={row.name}>
                    <ServerItem row={row} spaces={spaces} />
                  </li>
                ))}
              </ItemList>
            ) : (
              <Hint>{m.mcp_none()}</Hint>
            )}
          </PageSection>
        );
      })}

      {notDeclared.length > 0 ? <FoundSection found={notDeclared} spaces={spaces} /> : null}
    </div>
  );
}

function ServerItem({ row, spaces }: { row: ServerRow; spaces: SpaceRef[] }) {
  const refresh = useRefresh();
  const move = useMutation(orpc.mcp.move.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.mcp.remove.mutationOptions({ onSuccess: refresh }));
  return (
    <ItemRow className="items-start">
      <ItemMain>
        <ItemTitle>
          {row.name}
          <Badge variant="neutral">{row.transport}</Badge>
          <ClaudeOnly what={row.claudeOnly} />
        </ItemTitle>
        <ItemDescription className="line-clamp-1 font-mono">{target(row.server)}</ItemDescription>
        {row.secrets.length > 0 ? (
          <span className="flex flex-wrap gap-xxs pt-xxs">
            {row.secrets.map((secret) =>
              secret.state === "missing" ? (
                <SecretDialog key={secret.name} name={secret.name} />
              ) : (
                <Badge key={secret.name} variant="success">
                  {secret.state === "infisical"
                    ? m.mcp_secret_stored({ name: secret.name })
                    : m.mcp_secret_env({ name: secret.name })}
                </Badge>
              ),
            )}
          </span>
        ) : null}
      </ItemMain>
      <ItemEnd>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.mcp_actions({ name: row.name })}
                isPending={move.isPending || remove.isPending}
              />
            }
          >
            <MoreIcon aria-hidden />
          </MenuTrigger>
          <MenuPopup>
            {spaces
              .filter((space) => space.name !== row.space)
              .map((space) => (
                <MenuItem
                  key={space.name}
                  onClick={() => move.mutate({ name: row.name, from: row.space, to: space.name })}
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
          </MenuPopup>
        </Menu>
      </ItemEnd>
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

/** A missing secret: a badge that opens a field to store it in Infisical. */
function SecretDialog({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const refresh = useRefresh();
  const save = useMutation(
    orpc.mcp.setSecret.mutationOptions({
      onSuccess: () => {
        refresh();
        setOpen(false);
        setValue("");
      },
    }),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Badge variant="warning" render={<button type="button" />} />}>
        {m.mcp_secret_missing({ name })}
      </DialogTrigger>
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

/** Servers plain claude and codex have, that Opai sessions don't. */
function FoundSection({ found, spaces }: { found: McpData["found"]; spaces: SpaceRef[] }) {
  const [space, setSpace] = useState(spaces.find((item) => item.base)?.name ?? "global");
  const refresh = useRefresh();
  const importOne = useMutation(orpc.mcp.import.mutationOptions({ onSuccess: refresh }));
  // The same server is often in several files: the first one is what import takes.
  const unique = found.filter(
    (item, index) => found.findIndex((other) => other.name === item.name) === index,
  );
  return (
    <PageSection aria-labelledby="mcp-found">
      <PageSectionTitle id="mcp-found" count={unique.length}>
        {m.mcp_found_title()}
      </PageSectionTitle>
      <Hint>{m.mcp_found_hint()}</Hint>
      <div className="flex flex-wrap items-center gap-xs">
        <span className="font-ui text-s text-neutral-8">{m.mcp_found_into()}</span>
        <SpacePicker spaces={spaces} value={space} onChange={setSpace} label={m.mcp_found_into()} />
      </div>
      {errorText(importOne.error) ? (
        <p className="font-ui text-s text-error">{errorText(importOne.error)}</p>
      ) : null}
      <ItemList>
        {unique.map((item) => (
          <li key={`${item.name}-${item.where}`}>
            <ItemRow className="items-start">
              <ItemMain>
                <ItemTitle>{item.name}</ItemTitle>
                <ItemDescription className="line-clamp-1 font-mono">
                  {target(item.server)}
                </ItemDescription>
                <ItemDescription className="line-clamp-1">{item.where}</ItemDescription>
              </ItemMain>
              <ItemEnd>
                <Button
                  variant="outline"
                  isPending={importOne.isPending && importOne.variables?.names[0] === item.name}
                  onClick={() => importOne.mutate({ names: [item.name], space })}
                >
                  {m.mcp_import()}
                </Button>
              </ItemEnd>
            </ItemRow>
          </li>
        ))}
      </ItemList>
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
