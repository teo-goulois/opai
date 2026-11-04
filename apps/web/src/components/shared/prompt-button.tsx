import { Button } from "@opai/ui/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { CheckIcon, CommandIcon } from "@opai/ui/icon";
import { useId, useState } from "react";

import { m } from "@/paraglide/messages.js";

/**
 * Builds a prompt about this document for the user's agent: they describe the
 * change, copy the prompt, and paste it in their agent's chat.
 */
export function PromptButton({ buildPrompt }: { buildPrompt: (request: string) => string }) {
  const [request, setRequest] = useState("");
  const [copied, setCopied] = useState(false);
  const requestId = useId();
  const prompt = buildPrompt(request.trim() || m.prompt_request_placeholder());

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        <CommandIcon data-slot="icon" aria-hidden />
        {m.prompt_button()}
      </DialogTrigger>
      <DialogPopup closeLabel={m.close()} className="w-[min(640px,calc(100vw-var(--space-xl)))]">
        <DialogTitle>{m.prompt_title()}</DialogTitle>
        <DialogDescription>{m.prompt_description()}</DialogDescription>
        <label htmlFor={requestId} className="font-ui text-m font-medium">
          {m.prompt_request_label()}
        </label>
        <Textarea
          id={requestId}
          rows={3}
          value={request}
          onChange={(event) => setRequest(event.target.value)}
        />
        <div className="flex flex-col gap-xs">
          <span className="font-ui text-s font-medium text-neutral-7">{m.prompt_preview()}</span>
          <pre className="max-h-64 overflow-y-auto rounded-s bg-neutral-2 p-s font-data text-s whitespace-pre-wrap text-neutral-8 edge-outer">
            {prompt}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? <CheckIcon data-slot="icon" aria-hidden /> : null}
            {copied ? m.prompt_copied() : m.prompt_copy()}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Joins prompt paragraphs, skipping empty ones. */
export function promptText(...paragraphs: (string | false | undefined)[]) {
  return paragraphs.filter(Boolean).join("\n\n");
}
