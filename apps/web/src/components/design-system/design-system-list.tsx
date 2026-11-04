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
import { Field, FieldDescription, FieldError, FieldLabel } from "@opai/ui/components/ui/field";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@opai/ui/components/ui/table";
import { Spinner } from "@opai/ui/components/ui/spinner";
import { Switch } from "@opai/ui/components/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@opai/ui/components/ui/tabs";
import { Textarea } from "@opai/ui/components/ui/textarea";
import { Toc } from "@opai/ui/components/ui/toc";
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

// Every component of the app with its variants and states, as a long page.
export function DesignSystemList() {
  const [view, setView] = useState<DocumentView>("preview");
  const [doc, setDoc] = useState(sampleMarkdown);

  return (
    <div className="flex flex-col gap-xxl">
      <Section title="Colors">
        <Row label="neutral">
          {neutrals.map((step) => (
            <Swatch key={step} name={`neutral-${step}`} />
          ))}
        </Row>
        <Row label="palette, status">
          {palette.map((name) => (
            <Swatch key={name} name={name} />
          ))}
        </Row>
      </Section>

      <Section title="Typography">
        {textSteps.map((step) => (
          <Row key={step} label={`text-${step}`}>
            <span style={{ fontSize: `var(--size-${step})`, lineHeight: `var(--line-${step})` }}>
              Sidebar Geist, {step}
            </span>
          </Row>
        ))}
        <Row label="font-data">
          <span className="font-data text-s">Sidebar Geist Mono · spaces/perso/ops.md</span>
        </Row>
      </Section>

      <Section title="Button">
        {buttonVariants.map((variant) => (
          <Row key={variant} label={variant}>
            <Button variant={variant}>Button</Button>
            <Button variant={variant}>
              <Icons.CheckIcon data-slot="icon" aria-hidden />
              With icon
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} isPending>
              Pending
            </Button>
            <Button variant={variant} size="icon" aria-label="Search">
              <Icons.SearchIcon aria-hidden />
            </Button>
          </Row>
        ))}
      </Section>

      <Section title="Badge">
        <Row label="variants">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
        </Row>
      </Section>

      <Section title="Input">
        <Row label="states">
          <Input placeholder="Default" className="max-w-56" />
          <Input placeholder="Disabled" disabled className="max-w-56" />
          <Input placeholder="Invalid" aria-invalid className="max-w-56" />
          <Input defaultValue="Read only" readOnly className="max-w-56" />
        </Row>
      </Section>

      <Section title="Field, switch">
        <Row label="field">
          <Field className="max-w-72">
            <FieldLabel>Description</FieldLabel>
            <Input placeholder="What the space is for" />
            <FieldDescription>One line, shown on the space page.</FieldDescription>
          </Field>
          <Field className="max-w-72" invalid>
            <FieldLabel>Name</FieldLabel>
            <Input defaultValue="Not A Slug" aria-invalid />
            <FieldError match>Lowercase letters, digits, and hyphens.</FieldError>
          </Field>
        </Row>
        <Row label="switch">
          <Switch aria-label="Off" />
          <Switch aria-label="On" defaultChecked />
          <Switch aria-label="Disabled" disabled />
          <Switch aria-label="Disabled on" disabled defaultChecked />
        </Row>
      </Section>

      <Section title="Textarea">
        <Row label="states">
          <Textarea placeholder="Default" className="max-w-sm" rows={2} />
          <Textarea defaultValue="Read only" readOnly className="max-w-sm" rows={2} />
          <Textarea placeholder="Disabled" disabled className="max-w-sm" rows={2} />
        </Row>
      </Section>

      <Section title="Tabs, collapsible, dialog">
        <Row label="tabs">
          <Tabs defaultValue="preview" className="w-full max-w-md">
            <TabsList>
              <TabsTab value="preview">Preview</TabsTab>
              <TabsTab value="markdown">Markdown</TabsTab>
              <TabsTab value="disabled" disabled>
                Disabled
              </TabsTab>
            </TabsList>
            <TabsPanel value="preview" className="text-s text-neutral-8">
              Preview panel
            </TabsPanel>
            <TabsPanel value="markdown" className="text-s text-neutral-8">
              Markdown panel
            </TabsPanel>
          </Tabs>
        </Row>
        <Row label="collapsible">
          <div className="flex w-full max-w-md flex-col gap-s">
            <Collapsible defaultOpen>
              <CollapsibleTrigger>Default panel</CollapsibleTrigger>
              <CollapsiblePanel>Content on the neutral-2 surface.</CollapsiblePanel>
            </Collapsible>
            <Collapsible>
              <CollapsibleTrigger>Plain panel</CollapsibleTrigger>
              <CollapsiblePanel variant="plain">Content without a surface.</CollapsiblePanel>
            </Collapsible>
          </div>
        </Row>
        <Row label="dialog">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogPopup closeLabel={m.close()}>
              <DialogTitle>Dialog title</DialogTitle>
              <DialogDescription>A short description.</DialogDescription>
              <DialogFooter>
                <Button variant="primary">Action</Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
          <PromptButton buildPrompt={(request) => `Sample prompt.\n\n${request}`} />
        </Row>
      </Section>

      <Section title="Document editor">
        <DocumentEditor
          markdown={doc}
          hash="sample"
          view={view}
          onViewChange={setView}
          onSave={async (markdown) => setDoc(markdown)}
        />
      </Section>

      <Section title="Toggle group, kbd, tooltip, spinner">
        <Row label="toggle group">
          <ToggleGroup defaultValue={["all"]}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="owned">Mine</ToggleGroupItem>
            <ToggleGroupItem value="vendored" disabled>
              Disabled
            </ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row label="kbd">
          <Kbd>⌘K</Kbd>
          <Kbd>D</Kbd>
          <Kbd>/</Kbd>
        </Row>
        <Row label="tooltip">
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>Hover me</TooltipTrigger>
            <TooltipPopup>Tooltip</TooltipPopup>
          </Tooltip>
        </Row>
        <Row label="spinner">
          <Spinner />
        </Row>
      </Section>

      <Section title="Separator, scroll area">
        <Row label="horizontal">
          <Separator />
        </Row>
        <Row label="vertical">
          <div className="flex h-l items-center gap-s">
            <span>One</span>
            <Separator orientation="vertical" />
            <span>Two</span>
          </div>
        </Row>
        <Row label="scroll area">
          <ScrollArea className="h-32 w-full max-w-sm rounded-s edge-outer">
            <div className="flex flex-col gap-xs p-m text-s text-neutral-8">
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index}>Line {index + 1}</span>
              ))}
            </div>
          </ScrollArea>
        </Row>
      </Section>

      <Section title="Table">
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
      </Section>

      <Section title="Card, empty, skeleton">
        <div className="grid gap-m md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>With a description.</CardDescription>
            </CardHeader>
            <CardContent className="text-s">Content</CardContent>
          </Card>
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Empty</EmptyTitle>
              <EmptyDescription>Nothing to show yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
          <div className="flex flex-col gap-xs">
            <Skeleton className="h-(--line-l) w-1/2" />
            <Skeleton className="h-(--line-s) w-full" />
            <Skeleton className="h-(--line-s) w-3/4" />
          </div>
        </div>
      </Section>

      <Section title="Page layout">
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
        <PageSection>
          <PageSectionTitle count={3}>Section title</PageSectionTitle>
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
      </Section>

      <Section title="Markdown">
        <Markdown>{sampleMarkdown}</Markdown>
      </Section>

      <Section title="Diff">
        <DiffView diff={sampleDiff} defaultOpen={(path) => path.startsWith("content/")} />
      </Section>

      <Section title="Sidebar">
        <div className="h-96 w-64 overflow-hidden rounded-m edge-outer">
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
      </Section>

      <Section title="Icons">
        <div className="grid grid-cols-3 gap-s sm:grid-cols-6">
          {Object.entries(Icons)
            // Sorted: module key order can differ between server and client.
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, Icon]) => (
              <div
                key={name}
                className="flex flex-col items-center gap-xs rounded-s p-s text-xs edge-outer"
              >
                <Icon aria-hidden className="text-l" />
                <span className="truncate text-neutral-7">{name.replace(/Icon$/, "")}</span>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex w-20 flex-col gap-xxs">
      <div className="h-10 rounded-s edge-outer" style={{ backgroundColor: `var(--${name})` }} />
      <span className="font-data text-xxs text-neutral-7">{name}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-m">
      <h2 className="font-brand text-m font-heavy">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs sm:flex-row sm:items-start">
      <span className="w-32 shrink-0 pt-xs font-data text-xs text-neutral-7">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-xs">{children}</div>
    </div>
  );
}
