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
import { Field, FieldDescription, FieldLabel } from "@opai/ui/components/ui/field";
import { Input } from "@opai/ui/components/ui/input";
import { PageSection, PageSectionTitle } from "@opai/ui/components/ui/page-header";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { AddIcon, XIcon } from "@opai/ui/icon";
import { cn } from "@opai/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useState, type ReactNode } from "react";

import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { useSpaceData } from "./space-data";
import { Hint, SpaceHeader } from "./space-ui";

// Creating a space, and its settings: description, folders, default space,
// archive. Each folder says what claiming it changes before it is saved,
// since the longest path wins and that is hard to see in space.yaml.

const looksLikeFolder = (value: string) => /^(\/|~(\/|$))/.test(value.trim());

/** What claiming `folder` changes for `space`, in one or two lines. */
function FolderPreview({ space, folder }: { space: string; folder: string }) {
  const query = useQuery(
    orpc.spaces.previewFolder.queryOptions({
      input: { name: space, folder },
      enabled: looksLikeFolder(folder),
      retry: false,
      staleTime: 5_000,
    }),
  );
  if (!looksLikeFolder(folder)) return null;
  if (query.error) return <Line tone="error">{query.error.message}</Line>;
  const preview = query.data;
  if (!preview) return null;
  return (
    <>
      {preview.taken ? (
        <Line tone="error">{m.space_folder_taken({ space: preview.taken })}</Line>
      ) : preview.now && preview.now.space !== space ? (
        <Line>{m.space_folder_moves({ space: preview.now.space })}</Line>
      ) : null}
      {preview.inside.map((inside) => (
        <Line key={inside.path}>
          {m.space_folder_inside({ path: inside.path, space: inside.space })}
        </Line>
      ))}
      {!preview.exists ? <Line>{m.space_folder_missing()}</Line> : null}
    </>
  );
}

function Line({ tone, children }: { tone?: "error"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "font-ui text-s text-pretty",
        tone === "error" ? "text-error" : "text-neutral-7",
      )}
    >
      {children}
    </span>
  );
}

/** The folders a space claims: each with what it changes, and a field to add one. */
function FolderEditor({
  space,
  folders,
  onChange,
}: {
  /** The space they are for; a new one's name, which may still be empty. */
  space: string;
  folders: string[];
  onChange: (folders: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const typed = useDeferredValue(input.trim());
  const add = () => {
    const folder = input.trim().replace(/\/+$/, "");
    if (!looksLikeFolder(folder)) return;
    if (!folders.includes(folder)) onChange([...folders, folder]);
    setInput("");
  };
  return (
    <div className="flex flex-col gap-s">
      {folders.length > 0 ? (
        <ul className="flex flex-col gap-xs">
          {folders.map((folder) => (
            <li key={folder} className="flex items-start gap-xs">
              <div className="flex min-w-0 flex-1 flex-col gap-xxs">
                <span className="font-ui text-m break-all text-neutral-10">{folder}</span>
                <FolderPreview space={space} folder={folder} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={m.space_folder_remove({ folder })}
                onClick={() => onChange(folders.filter((item) => item !== folder))}
              >
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-xxs">
        <div className="flex gap-xs">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            placeholder="~/Developer/client"
            aria-label={m.space_folder_add()}
          />
          <Button variant="outline" onClick={add} disabled={!looksLikeFolder(input)}>
            <AddIcon data-slot="icon" aria-hidden />
            {m.space_folder_add()}
          </Button>
        </div>
        {typed && !folders.includes(typed) ? <FolderPreview space={space} folder={typed} /> : null}
      </div>
    </div>
  );
}

/** Refreshes everything a space change touches: spaces, rules, skills, sessions. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}

/** The "New space" button and its dialog. */
export function NewSpaceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const navigate = useNavigate();
  const refresh = useRefresh();
  const create = useMutation(
    orpc.spaces.create.mutationOptions({
      onSuccess: (space) => {
        void refresh();
        setOpen(false);
        setName("");
        setDescription("");
        setFolders([]);
        void navigate({ to: "/spaces/$name", params: { name: space.name } });
      },
    }),
  );
  const slug = name.trim();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <AddIcon data-slot="icon" aria-hidden />
        {m.space_new()}
      </DialogTrigger>
      <DialogPopup closeLabel={m.close()} className="w-[min(560px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{m.space_new_title()}</DialogTitle>
        <DialogDescription>{m.space_new_description()}</DialogDescription>
        <form
          className="flex flex-col gap-m"
          onSubmit={(event) => {
            event.preventDefault();
            if (!slug) return;
            create.mutate({ name: slug, description, paths: folders });
          }}
        >
          <Field>
            <FieldLabel>{m.space_name()}</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="client-x"
              autoFocus
              required
            />
            <FieldDescription>{m.space_name_hint()}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{m.space_description()}</FieldLabel>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={m.space_description_placeholder()}
            />
          </Field>
          <div className="flex flex-col gap-xs">
            <span className="font-ui text-m font-medium text-neutral-10">{m.space_folders()}</span>
            <Hint>{m.space_folders_hint()}</Hint>
            <FolderEditor space={slug} folders={folders} onChange={setFolders} />
          </div>
          {create.error ? (
            <p className="font-ui text-s text-error">{create.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="submit" variant="primary" disabled={!slug} isPending={create.isPending}>
              {m.space_create()}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** A space's settings: description and folders, the default space, archiving. */
export function SpaceSettings({ name }: { name: string }) {
  const { space, spaces, ownSkills } = useSpaceData(name);
  const saved = { description: space.description, paths: space.paths };
  const [draft, setDraft] = useState<typeof saved | null>(null);
  const value = draft ?? saved;
  const dirty =
    draft !== null &&
    (draft.description !== saved.description || draft.paths.join("\n") !== saved.paths.join("\n"));
  const refresh = useRefresh();
  const navigate = useNavigate();
  const update = useMutation(
    orpc.spaces.update.mutationOptions({
      onSuccess: () => {
        setDraft(null);
        void refresh();
      },
    }),
  );
  const archive = useMutation(
    orpc.spaces.archive.mutationOptions({
      onSuccess: () => {
        void navigate({ to: "/spaces" });
        void refresh();
      },
    }),
  );
  const current = spaces.find((item) => item.default)?.name;

  return (
    <div className="flex flex-col gap-xl">
      <SpaceHeader space={space} skills={ownSkills.length} />

      <form
        className="flex max-w-2xl flex-col gap-l"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          update.mutate({
            name,
            description: value.description,
            ...(space.base ? {} : { paths: value.paths }),
          });
        }}
      >
        <Field>
          <FieldLabel>{m.space_description()}</FieldLabel>
          <Textarea
            value={value.description}
            onChange={(event) => setDraft({ ...value, description: event.target.value })}
            placeholder={m.space_description_placeholder()}
            rows={2}
          />
          <FieldDescription>{m.space_description_hint()}</FieldDescription>
        </Field>

        <div className="flex flex-col gap-xs">
          <span className="font-ui text-m font-medium text-neutral-10">{m.space_folders()}</span>
          {space.base ? (
            <Hint>{m.space_folders_base()}</Hint>
          ) : (
            <>
              <Hint>
                {space.default
                  ? `${m.space_folders_hint()} ${m.space_folders_default()}`
                  : m.space_folders_hint()}
              </Hint>
              <FolderEditor
                space={name}
                folders={value.paths}
                onChange={(paths) => setDraft({ ...value, paths })}
              />
            </>
          )}
        </div>

        {update.error ? <p className="font-ui text-s text-error">{update.error.message}</p> : null}
        <div className="flex gap-xs">
          <Button type="submit" variant="primary" disabled={!dirty} isPending={update.isPending}>
            {m.space_save()}
          </Button>
          {dirty ? (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {m.space_discard()}
            </Button>
          ) : null}
        </div>
      </form>

      {space.base ? null : (
        <PageSection aria-labelledby="space-default" className="max-w-2xl">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="space-default">{m.space_default_title()}</PageSectionTitle>
            <Hint>
              {space.default
                ? m.space_default_is()
                : m.space_default_other({ space: current ?? "—" })}
            </Hint>
          </div>
          {space.default ? null : (
            <div>
              <Button
                variant="secondary"
                isPending={update.isPending}
                onClick={() => update.mutate({ name, makeDefault: true })}
              >
                {m.space_make_default()}
              </Button>
            </div>
          )}
        </PageSection>
      )}

      {space.base || space.default ? null : (
        <PageSection aria-labelledby="space-archive" className="max-w-2xl">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="space-archive">{m.space_archive()}</PageSectionTitle>
            <Hint>{m.space_archive_hint({ name })}</Hint>
          </div>
          {archive.error ? (
            <p className="font-ui text-s text-error">{archive.error.message}</p>
          ) : null}
          <Dialog>
            <DialogTrigger
              render={<Button variant="outline" className="w-fit" isPending={archive.isPending} />}
            >
              {m.space_archive()}
            </DialogTrigger>
            <DialogPopup
              closeLabel={m.close()}
              className="w-[min(480px,calc(100vw-var(--space-xl)))]"
            >
              <DialogTitle>{m.space_archive_title({ name })}</DialogTitle>
              <DialogDescription>{m.space_archive_hint({ name })}</DialogDescription>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>{m.space_cancel()}</DialogClose>
                <DialogClose
                  render={<Button variant="danger" />}
                  onClick={() => archive.mutate({ name })}
                >
                  {m.space_archive()}
                </DialogClose>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </PageSection>
      )}
    </div>
  );
}
