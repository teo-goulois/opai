import { Button } from "@opai/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@opai/ui/components/ui/empty";
import { Link } from "@tanstack/react-router";

import { m } from "@/paraglide/messages.js";

export function NotFound() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.not_found_title()}</EmptyTitle>
        <EmptyDescription>{m.not_found_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" render={<Link to="/" />}>
          {m.not_found_back()}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
