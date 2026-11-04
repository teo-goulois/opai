import { Toc, type TocItem } from "@opai/ui/components/ui/toc";
import type { ReactNode } from "react";

import { m } from "@/paraglide/messages.js";

/** A long Markdown document with its "On this page" links beside it. */
export function DocumentLayout({ toc, children }: { toc: TocItem[]; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-xl lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="min-w-0 lg:order-1">{children}</div>
      <Toc
        label={m.on_this_page()}
        items={toc}
        className="lg:order-2 lg:sticky lg:top-xl lg:self-start max-lg:hidden"
      />
    </div>
  );
}
