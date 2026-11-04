import { Badge } from "@opai/ui/components/ui/badge";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@opai/ui/components/ui/card";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@opai/ui/components/ui/collapsible";
import { DescriptionItem, DescriptionList } from "@opai/ui/components/ui/description-list";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@opai/ui/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@opai/ui/components/ui/empty";
import { Input } from "@opai/ui/components/ui/input";
import { Kbd } from "@opai/ui/components/ui/kbd";
import { DiffView } from "@opai/ui/components/ui/diff";
import { Markdown } from "@opai/ui/components/ui/markdown";
import {
  PageHeader,
  PageMeta,
  PageSection,
  PageSectionTitle,
  PageTitle,
} from "@opai/ui/components/ui/page-header";
import { ScrollArea } from "@opai/ui/components/ui/scroll-area";
import { Separator } from "@opai/ui/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarLink,
  SidebarLinkMeta,
  SidebarMenu,
  SidebarMenuItem,
} from "@opai/ui/components/ui/sidebar";
import { Skeleton } from "@opai/ui/components/ui/skeleton";
import { Spinner } from "@opai/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@opai/ui/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { Toc } from "@opai/ui/components/ui/toc";
import { Toggle } from "@opai/ui/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@opai/ui/components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@opai/ui/components/ui/tooltip";
import * as Icons from "@opai/ui/icon";
import { useState, type ReactNode } from "react";

import { DocumentEditor, type DocumentView } from "@/components/shared/document-editor";
import { PromptButton } from "@/components/shared/prompt-button";
import { m } from "@/paraglide/messages.js";

import {
  badgeVariants,
  buttonVariants,
  neutrals,
  palette,
  sampleDiff,
  sampleMarkdown,
  textSteps,
} from "./samples";

// Every group of the canvas. A comparison changes one prop and keeps the
// rest (text, icon, style) the same. Everything uses sample data and local
// state: nothing here reads or writes the instance.

/** A canvas group: plain title 8px above a dashed frame of equal-width slots. */
function Group({
  id,
  title,
  columns = 4,
  children,
}: {
  id: string;
  title: string;
  /** Slots per row. */
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  const grid = {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  }[columns];
  return (
    <section
      id={`canvas-${id}`}
      aria-label={title}
      className="pointer-events-auto flex w-[1120px] flex-col gap-xs"
    >
      <h2 className="font-ui text-s text-neutral-7">{title}</h2>
      <div
        className={`grid ${grid} items-start gap-x-xl gap-y-xl rounded-l border border-dashed border-neutral-7/25 p-xl`}
      >
        {children}
      </div>
    </section>
  );
}

/** One example in a group, with what it shows. */
function Slot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-xs">
      <span className="font-data text-xs text-neutral-7">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-xs">{children}</div>
    </div>
  );
}

const inputStates = [
  { label: "empty", props: { placeholder: "Search skills" } },
  { label: "filled", props: { defaultValue: "daily-journal" } },
  { label: "disabled", props: { defaultValue: "daily-journal", disabled: true } },
  { label: "invalid", props: { defaultValue: "daily-journal", "aria-invalid": true } },
  { label: "read only", props: { defaultValue: "daily-journal", readOnly: true } },
] as const;

export function DesignSystemCanvasGroups() {
  const [view, setView] = useState<DocumentView>("preview");
  const [doc, setDoc] = useState(sampleMarkdown);

  return (
    // Four groups per row: a wide, short world fits a screen better than a tall one.
    <div className="flex w-[4864px] flex-wrap items-start gap-[calc(var(--space-xxl)*2)] p-xxl">
      <Group id="colors" title="Colors" columns={6}>
        {[...neutrals.map((step) => `neutral-${step}`), ...palette].map((name) => (
          <Slot key={name} label={name}>
            <div
              className="h-xxl w-full rounded-s edge-outer"
              style={{ backgroundColor: `var(--${name})` }}
            />
          </Slot>
        ))}
      </Group>

      <Group id="typography" title="Typography: text steps" columns={1}>
        {textSteps.map((step) => (
          <Slot key={step} label={`text-${step}`}>
            <span style={{ fontSize: `var(--size-${step})`, lineHeight: `var(--line-${step})` }}>
              Continue
            </span>
          </Slot>
        ))}
        <Slot label="font-data, text-s">
          <span className="font-data text-s">spaces/perso/ops.md</span>
        </Slot>
      </Group>

      <Group id="button-style" title="Button: variant" columns={5}>
        {buttonVariants.map((variant) => (
          <Slot key={variant} label={variant}>
            <Button variant={variant}>Continue</Button>
          </Slot>
        ))}
      </Group>

      <Group id="button-size" title="Button: size (primary)" columns={5}>
        <Slot label="default">
          <Button>Continue</Button>
        </Slot>
        <Slot label="default, with icon">
          <Button>
            <Icons.CheckIcon data-slot="icon" aria-hidden />
            Continue
          </Button>
        </Slot>
        <Slot label="icon">
          <Button size="icon" aria-label="Continue">
            <Icons.CheckIcon aria-hidden />
          </Button>
        </Slot>
      </Group>

      <Group id="button-state" title="Button: state (primary)" columns={5}>
        <Slot label="rest">
          <Button>Continue</Button>
        </Slot>
        <Slot label="disabled">
          <Button disabled>Continue</Button>
        </Slot>
        <Slot label="pending">
          <Button isPending>Continue</Button>
        </Slot>
      </Group>

      <Group id="badge" title="Badge: variant" columns={5}>
        {badgeVariants.map((variant) => (
          <Slot key={variant} label={variant}>
            <Badge variant={variant}>Explicit only</Badge>
          </Slot>
        ))}
      </Group>

      <Group id="input" title="Input: state" columns={5}>
        {inputStates.map((state) => (
          <Slot key={state.label} label={state.label}>
            <Input aria-label={state.label} {...state.props} />
          </Slot>
        ))}
      </Group>

      <Group id="textarea" title="Textarea: state" columns={5}>
        {inputStates.map((state) => (
          <Slot key={state.label} label={state.label}>
            <Textarea aria-label={state.label} rows={2} {...state.props} />
          </Slot>
        ))}
      </Group>

      <Group id="toggle" title="Toggle and toggle group: state" columns={4}>
        <Slot label="toggle, rest">
          <Toggle>Mine</Toggle>
        </Slot>
        <Slot label="toggle, pressed">
          <Toggle defaultPressed>Mine</Toggle>
        </Slot>
        <Slot label="toggle, disabled">
          <Toggle disabled>Mine</Toggle>
        </Slot>
        <Slot label="toggle group, one item disabled">
          <ToggleGroup defaultValue={["all"]}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
            <ToggleGroupItem value="vendor" disabled>
              Vendor
            </ToggleGroupItem>
          </ToggleGroup>
        </Slot>
      </Group>

      <Group id="tabs" title="Tabs and collapsible" columns={3}>
        <Slot label="tabs, one disabled">
          <Tabs defaultValue="preview" className="w-full">
            <TabsList>
              <TabsTab value="preview">Preview</TabsTab>
              <TabsTab value="markdown">Markdown</TabsTab>
              <TabsTab value="history" disabled>
                History
              </TabsTab>
            </TabsList>
            <TabsPanel value="preview" className="text-s text-neutral-8">
              Preview panel
            </TabsPanel>
            <TabsPanel value="markdown" className="text-s text-neutral-8">
              Markdown panel
            </TabsPanel>
          </Tabs>
        </Slot>
        <Slot label="collapsible, default panel">
          <Collapsible defaultOpen className="w-full">
            <CollapsibleTrigger>Imported</CollapsibleTrigger>
            <CollapsiblePanel>Picked one by one from an author's repository.</CollapsiblePanel>
          </Collapsible>
        </Slot>
        <Slot label="collapsible, plain panel">
          <Collapsible defaultOpen className="w-full">
            <CollapsibleTrigger>Imported</CollapsibleTrigger>
            <CollapsiblePanel variant="plain">
              Picked one by one from an author's repository.
            </CollapsiblePanel>
          </Collapsible>
        </Slot>
      </Group>

      <Group id="overlays" title="Dialog, tooltip, prompt (portals)" columns={3}>
        <Slot label="dialog">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogPopup closeLabel={m.close()}>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>A short description.</DialogDescription>
              <DialogFooter>
                <Button>Continue</Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </Slot>
        <Slot label="tooltip">
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
            <TooltipPopup>Tooltip</TooltipPopup>
          </Tooltip>
        </Slot>
        <Slot label="prompt button">
          <PromptButton buildPrompt={(request) => `Sample prompt.\n\n${request}`} />
        </Slot>
      </Group>

      <Group id="small" title="Kbd, separator, spinner, skeleton" columns={4}>
        <Slot label="kbd">
          <Kbd>⌘K</Kbd>
          <Kbd>D</Kbd>
          <Kbd>/</Kbd>
        </Slot>
        <Slot label="separator, horizontal">
          <Separator />
        </Slot>
        <Slot label="separator, vertical">
          <div className="flex h-l items-center gap-s">
            <span>One</span>
            <Separator orientation="vertical" />
            <span>Two</span>
          </div>
        </Slot>
        <Slot label="spinner">
          <Spinner />
        </Slot>
        <Slot label="skeleton">
          <div className="flex w-full flex-col gap-xs">
            <Skeleton className="h-(--line-l) w-1/2" />
            <Skeleton className="h-(--line-s) w-full" />
          </div>
        </Slot>
      </Group>

      <Group id="surfaces" title="Card: size, empty, scroll area" columns={4}>
        <Slot label="card, default">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>With a description.</CardDescription>
            </CardHeader>
            <CardContent className="text-s">Content</CardContent>
          </Card>
        </Slot>
        <Slot label="card, sm">
          <Card size="sm" className="w-full">
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>With a description.</CardDescription>
            </CardHeader>
            <CardContent className="text-s">Content</CardContent>
          </Card>
        </Slot>
        <Slot label="empty">
          <Empty className="py-l">
            <EmptyHeader>
              <EmptyTitle>No skills match</EmptyTitle>
              <EmptyDescription>Try another search.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Slot>
        <Slot label="scroll area (scrolls inside)">
          <ScrollArea className="h-32 w-full rounded-s edge-outer">
            <div className="flex flex-col gap-xs p-m text-s text-neutral-8">
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index}>Line {index + 1}</span>
              ))}
            </div>
          </ScrollArea>
        </Slot>
      </Group>

      <Group id="table" title="Table" columns={1}>
        <Slot label="default">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead numeric>Visitors</TableHead>
                <TableHead numeric>Bounce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>example.com</TableCell>
                <TableCell numeric>1,204</TableCell>
                <TableCell numeric>42%</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>docs.example.com</TableCell>
                <TableCell numeric>318</TableCell>
                <TableCell numeric>65%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Slot>
      </Group>

      <Group id="page" title="Page layout" columns={2}>
        <Slot label="breadcrumb, page header">
          <div className="flex flex-col gap-m">
            <Breadcrumb aria-label={m.breadcrumb()}>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Skills</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>daily-journal</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <PageHeader>
              <PageTitle>Page title</PageTitle>
              <PageMeta>
                <span className="font-data">spaces/perso/ops.md</span>
                <span>Last checked 2026-10-24</span>
              </PageMeta>
            </PageHeader>
          </div>
        </Slot>
        <Slot label="section, description list, on this page">
          <div className="flex w-full gap-xl">
            <PageSection className="flex-1">
              <PageSectionTitle count={3}>Source</PageSectionTitle>
              <DescriptionList>
                <DescriptionItem label="Owner">mattpocock</DescriptionItem>
                <DescriptionItem label="Folder">
                  <code className="font-data">vendor/skills/grilling</code>
                </DescriptionItem>
              </DescriptionList>
            </PageSection>
            <Toc
              label={m.on_this_page()}
              items={[
                { id: "section", title: "Section", depth: 2 },
                { id: "sub-section", title: "Sub-section", depth: 3 },
              ]}
            />
          </div>
        </Slot>
      </Group>

      <Group id="diff" title="Diff: open and closed files" columns={1}>
        <Slot label="diff">
          <DiffView
            className="w-[640px]"
            diff={sampleDiff}
            defaultOpen={(path) => path.startsWith("content/")}
          />
        </Slot>
      </Group>

      <Group id="markdown" title="Markdown and document editor" columns={2}>
        <Slot label="markdown">
          <Markdown className="w-full">{sampleMarkdown}</Markdown>
        </Slot>
        <Slot label="document editor (local only)">
          <div className="w-full">
            <DocumentEditor
              markdown={doc}
              hash="sample"
              view={view}
              onViewChange={setView}
              onSave={async (markdown) => setDoc(markdown)}
            />
          </div>
        </Slot>
      </Group>

      <Group id="sidebar" title="Sidebar" columns={2}>
        <Slot label="links: selected, rest, disabled">
          <div className="h-80 w-64 overflow-hidden rounded-m edge-outer">
            <Sidebar>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarLink href="#" aria-current="page">
                        <Icons.SkillIcon aria-hidden />
                        <span>Skills</span>
                        <SidebarLinkMeta>52</SidebarLinkMeta>
                      </SidebarLink>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarLink href="#">
                        <Icons.RulesIcon aria-hidden />
                        <span>Rules</span>
                      </SidebarLink>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
                <SidebarGroup>
                  <SidebarGroupLabel>Group</SidebarGroupLabel>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarLink href="#" aria-disabled="true">
                        <Icons.OpsIcon aria-hidden />
                        <span>Disabled</span>
                      </SidebarLink>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
          </div>
        </Slot>
      </Group>

      <Group id="icons" title="Icons" columns={6}>
        {Object.entries(Icons)
          // Sorted: module key order can differ between server and client.
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, Icon]) => (
            <Slot key={name} label={name.replace(/Icon$/, "")}>
              <Icon aria-hidden className="text-l" />
            </Slot>
          ))}
      </Group>
    </div>
  );
}
