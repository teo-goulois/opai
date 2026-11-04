import { Badge } from "@opai/ui/components/ui/badge";
import { Button } from "@opai/ui/components/ui/button";
import { Markdown } from "@opai/ui/components/ui/markdown";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { InfoIcon, WarningIcon } from "@opai/ui/icon";
import { ORPCError } from "@orpc/client";
import { useAppHotkeys, useHotkey } from "@tanstack/react-hotkeys";
import { useBlocker } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

export type DocumentView = "preview" | "markdown";

/**
 * A Markdown file shown two ways: rendered (default) or as source. The source
 * can be edited and saved when `onSave` is given; saving sends the hash of the
 * version it started from, so a file changed elsewhere is not overwritten.
 */
export function DocumentEditor({
  markdown,
  hash,
  view,
  onViewChange,
  onSave,
  onReload,
  lockedReason,
  actions,
  renderPreview = (source) => <Markdown>{source}</Markdown>,
}: {
  markdown: string;
  hash: string;
  view: DocumentView;
  onViewChange: (view: DocumentView) => void;
  /** Absent: read-only. */
  onSave?: (markdown: string, baseHash: string) => Promise<unknown>;
  /** Reads the file again after a conflict; the draft is kept. */
  onReload?: () => Promise<unknown>;
  /** Shown above a read-only source. */
  lockedReason?: string;
  actions?: ReactNode;
  renderPreview?: (markdown: string) => ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const hotkeys = useAppHotkeys();

  // A draft only counts until the saved file catches up with it.
  const dirty = draft !== null && draft !== markdown;
  const source = dirty ? draft : markdown;

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm(m.editor_leave()),
    enableBeforeUnload: () => dirty,
  });

  async function save() {
    if (!onSave || !dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft, hash);
      setDraft(null);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2000);
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : String(cause),
        conflict: cause instanceof ORPCError && cause.code === "CONFLICT",
      });
    } finally {
      setSaving(false);
    }
  }

  useHotkey(hotkeys["document.save"], () => void save());

  return (
    <Tabs value={view} onValueChange={(next) => onViewChange(next as DocumentView)}>
      <div className="flex flex-wrap items-center gap-x-m gap-y-xs edge-bottom edge-neutral-4">
        <TabsList aria-label={m.view()} className="w-auto flex-1 edge-transparent">
          <TabsTab value="preview">{m.view_preview()}</TabsTab>
          <TabsTab value="markdown">{m.view_markdown()}</TabsTab>
        </TabsList>
        <div className="flex flex-wrap items-center gap-xs pb-xs">
          {dirty ? (
            <>
              <Badge variant="warning">{m.editor_unsaved()}</Badge>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {m.editor_cancel()}
              </Button>
              <Button variant="primary" isPending={saving} onClick={() => void save()}>
                {m.editor_save()}
              </Button>
            </>
          ) : justSaved ? (
            <Badge variant="success">{m.editor_saved()}</Badge>
          ) : null}
          {actions}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-s flex items-start gap-xs rounded-s bg-error-transparent p-s font-ui text-s text-neutral-10"
        >
          <WarningIcon aria-hidden className="mt-xxs shrink-0" />
          <span className="flex-1">
            <span className="font-medium">{m.editor_error()}.</span> {error.message}{" "}
            {error.conflict ? m.editor_conflict_hint() : null}
          </span>
          {error.conflict && onReload ? (
            <Button variant="outline" onClick={() => void onReload().then(() => setError(null))}>
              {m.editor_reload()}
            </Button>
          ) : null}
        </div>
      ) : null}

      <TabsPanel value="preview">{renderPreview(source)}</TabsPanel>
      <TabsPanel value="markdown" className="flex flex-col gap-s">
        {!onSave && lockedReason ? (
          <p className="flex items-start gap-xs font-ui text-s text-neutral-7">
            <InfoIcon aria-hidden className="mt-xxs shrink-0" />
            {lockedReason}
          </p>
        ) : null}
        <Textarea
          aria-label={m.view_markdown()}
          value={source}
          readOnly={!onSave}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-[60vh] font-data text-s field-sizing-content"
        />
      </TabsPanel>
    </Tabs>
  );
}
