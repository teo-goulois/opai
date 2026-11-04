import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.error_title()}</EmptyTitle>
        <EmptyDescription>
          {error instanceof Error ? error.message : String(error)}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => void router.invalidate()}>
          {m.retry()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
