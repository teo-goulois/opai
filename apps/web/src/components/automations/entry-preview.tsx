import { Markdown } from "@opai/ui/components/ui/markdown";

// An entry of the registry, read: its `- **Label:** value` lines as a list of
// labels and values, the rest of its text as Markdown under it. The draft is
// read here too, so the preview follows what is being typed.

type Part = { label: string; lines: string[] };

const FIELD = /^[-*] \*\*([^*]+?):\*\*\s*(.*)$/;

export function entryParts(source: string) {
  const fields: Part[] = [];
  const rest: string[] = [];
  let current: Part | undefined;
  let fence = false;
  for (const line of source.replace(/^\s*#{1,6}\s+.+\r?\n/, "").split("\n")) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const field = fence ? null : FIELD.exec(line);
    if (field) {
      current = { label: field[1]!.trim(), lines: [field[2]!] };
      fields.push(current);
    } else if (current && (line.trim() === "" || /^\s{2,}/.test(line))) {
      // A value goes on in its indented lines, a fenced prompt included.
      current.lines.push(line.replace(/^ {2}/, ""));
    } else {
      current = undefined;
      rest.push(line);
    }
  }
  return {
    fields: fields.map((part) => ({ label: part.label, value: part.lines.join("\n").trim() })),
    rest: rest.join("\n").trim(),
  };
}

export function EntryPreview({ source }: { source: string }) {
  const { fields, rest } = entryParts(source);
  return (
    <div className="flex flex-col gap-l">
      {fields.length > 0 ? (
        <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-l gap-y-m sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          {fields.map((field, index) => (
            <div key={index} className="contents">
              <dt className="font-ui text-s text-neutral-7 sm:pt-[calc((var(--line-m)-var(--line-s))/2)]">
                {field.label}
              </dt>
              <dd className="min-w-0 max-sm:-mt-s">
                <Markdown className="wrap-anywhere [&_pre]:whitespace-pre-wrap">
                  {field.value}
                </Markdown>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {rest ? <Markdown>{rest}</Markdown> : null}
    </div>
  );
}
