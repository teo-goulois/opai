import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@opai/ui/components/ui/command";
import {
  AnalyticsIcon,
  FolderIcon,
  HandbookIcon,
  LanguageIcon,
  MachineIcon,
  OpsIcon,
  PaletteIcon,
  RefreshIcon,
  RulesIcon,
  SessionsIcon,
  SkillIcon,
  SunIcon,
  TerminalIcon,
} from "@opai/ui/icon";
import { formatForDisplay, useAppHotkeys, useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSyncNow } from "@/components/machines/sync-now";
import { orderSpaces, SpaceDot } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { toggleLocale, useThemeToggle } from "./app-preferences";

type PaletteAction = {
  value: string;
  label: string;
  /** Where the item lives, shown at the end of its row. */
  hint?: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
};

type PaletteGroup = { value: string; label: string; items: PaletteAction[] };

function isPaletteAction(item: unknown): item is PaletteAction {
  return typeof item === "object" && item !== null && "run" in item && "value" in item;
}

const CommandPaletteContext = createContext<{ openCommandPalette: () => void } | null>(null);

export function useCommandPalette() {
  const value = useContext(CommandPaletteContext);
  if (!value) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return value;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openCommandPalette = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openCommandPalette }), [openCommandPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const toggleTheme = useThemeToggle();
  const hotkeys = useAppHotkeys();
  const [query, setQuery] = useState("");
  const spaces = useQuery(orpc.spaces.list.queryOptions());
  const skills = useQuery(orpc.skills.list.queryOptions());
  const rules = useQuery(orpc.rules.list.queryOptions());
  const { mutate: syncNow } = useSyncNow();
  // Ignore extra Enter presses while the dialog animates closed.
  const committedRef = useRef(false);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      committedRef.current = !next;
      if (next) setQuery("");
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useHotkey(hotkeys["palette.open"], () => handleOpenChange(!open));
  useHotkey(hotkeys["theme.toggle"], toggleTheme);

  const groups = useMemo<PaletteGroup[]>(() => {
    const display = (hotkey: (typeof hotkeys)[keyof typeof hotkeys]) =>
      hotkey.hotkey ? formatForDisplay(hotkey.hotkey) : undefined;

    const spaceList = orderSpaces(spaces.data ?? []);
    const result: PaletteGroup[] = [
      {
        value: "spaces",
        label: m.nav_spaces(),
        items: spaceList.map((space, index) => ({
          value: `space ${space.name} espace ${space.description}`,
          label: space.name,
          icon: (
            <span className="flex size-l items-center justify-center">
              <SpaceDot index={index} />
            </span>
          ),
          run: () => void navigate({ to: "/spaces/$name", params: { name: space.name } }),
        })),
      },
      {
        value: "skills",
        label: m.nav_skills(),
        items: (skills.data?.skills ?? []).map((skill) => ({
          value: `skill ${skill.name} ${skill.space} ${skill.description}`,
          label: skill.name,
          hint: skill.space,
          icon: <SkillIcon aria-hidden />,
          run: () =>
            void navigate({
              to: "/spaces/$name/skills/$skill",
              params: { name: skill.space, skill: skill.name },
            }),
        })),
      },
      {
        value: "rules",
        label: m.space_rules(),
        items: (rules.data ?? []).map((rule) => ({
          value: `rule règle ${rule.title} ${rule.space ?? ""} ${rule.path}`,
          label: rule.title,
          hint: rule.space ?? m.nav_config(),
          icon: <RulesIcon aria-hidden />,
          run: () =>
            void (rule.space
              ? navigate({
                  to: "/spaces/$name/rules/$id",
                  params: { name: rule.space, id: rule.id },
                })
              : navigate({ to: "/config/rules/$id", params: { id: rule.id } })),
        })),
      },
      {
        value: "pages",
        label: m.palette_pages(),
        items: [
          {
            value: `${m.nav_skills()} skills import importer update`,
            label: m.nav_skills(),
            icon: <SkillIcon aria-hidden />,
            run: () => void navigate({ to: "/skills" }),
          },
          {
            value: `${m.nav_mcp()} mcp servers serveurs tools outils secrets infisical`,
            label: m.nav_mcp(),
            icon: <TerminalIcon aria-hidden />,
            run: () => void navigate({ to: "/mcp" }),
          },
          {
            value: `${m.nav_sessions()} sessions debug context contexte tools skills usage`,
            label: m.nav_sessions(),
            icon: <SessionsIcon aria-hidden />,
            run: () => void navigate({ to: "/sessions" }),
          },
          {
            value: `${m.nav_automations()} automations automatisations ops launchd codex cron`,
            label: m.nav_automations(),
            icon: <OpsIcon aria-hidden />,
            run: () => void navigate({ to: "/automations" }),
          },
          {
            value: `${m.nav_config()} config settings réglages codex claude skills hooks`,
            label: m.nav_config(),
            icon: <FolderIcon aria-hidden />,
            run: () => void navigate({ to: "/config" }),
          },
          {
            value: `${m.nav_machines()} machines instances sync partage sharing runner`,
            label: m.nav_machines(),
            icon: <MachineIcon aria-hidden />,
            run: () => void navigate({ to: "/machines" }),
          },
          {
            value: `${m.nav_handbook()} handbook code docs`,
            label: m.nav_handbook(),
            icon: <HandbookIcon aria-hidden />,
            run: () => void navigate({ to: "/handbook" }),
          },
          {
            value: `${m.nav_analytics()} analytics umami visiteurs visitors trafic traffic`,
            label: m.nav_analytics(),
            icon: <AnalyticsIcon aria-hidden />,
            run: () => void navigate({ to: "/analytics" }),
          },
          ...(import.meta.env.DEV
            ? [
                {
                  value: `${m.nav_design_system()} design system components`,
                  label: m.nav_design_system(),
                  icon: <PaletteIcon aria-hidden />,
                  run: () => void navigate({ to: "/design-system" }),
                },
              ]
            : []),
        ],
      },
      {
        value: "actions",
        label: m.palette_actions(),
        items: [
          {
            value: `${m.sync_now()} sync synchroniser mcp skills machines push pull`,
            label: m.sync_now(),
            hint: m.nav_machines(),
            icon: <RefreshIcon aria-hidden />,
            // The Machines page shows its progress and what it did.
            run: () => {
              syncNow({});
              void navigate({ to: "/machines" });
            },
          },
          {
            value: `${m.theme_toggle()} theme dark light`,
            label: m.theme_toggle(),
            icon: <SunIcon aria-hidden />,
            shortcut: display(hotkeys["theme.toggle"]),
            run: toggleTheme,
          },
          {
            value: `${m.language_toggle()} language langue`,
            label: m.language_toggle(),
            icon: <LanguageIcon aria-hidden />,
            run: toggleLocale,
          },
        ],
      },
    ];

    return result.filter((group) => group.items.length > 0);
  }, [hotkeys, navigate, toggleTheme, spaces.data, skills.data, rules.data, syncNow]);

  function runAction(action: PaletteAction) {
    if (committedRef.current) return;
    handleOpenChange(false);
    action.run();
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandDialogPopup aria-label={m.palette_title()}>
        <Command
          items={groups}
          itemToStringValue={(item) => (isPaletteAction(item) ? item.value : "")}
          onValueChange={setQuery}
          value={query}
        >
          <CommandInput placeholder={m.palette_placeholder()} />
          <CommandPanel>
            <CommandEmpty>{m.palette_empty()}</CommandEmpty>
            <CommandList>
              {(group: PaletteGroup, index: number) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(action: PaletteAction) => (
                      <CommandItem
                        key={action.value}
                        value={action.value}
                        onClick={() => runAction(action)}
                      >
                        <span className="flex shrink-0 items-center justify-center text-neutral-7">
                          {action.icon}
                        </span>
                        <span className="flex-1 truncate">{action.label}</span>
                        {action.hint ? (
                          <span className="shrink-0 font-ui text-s text-neutral-7">
                            {action.hint}
                          </span>
                        ) : null}
                        {action.shortcut ? (
                          <CommandShortcut>{action.shortcut}</CommandShortcut>
                        ) : null}
                      </CommandItem>
                    )}
                  </CommandCollection>
                  {index < groups.length - 1 ? <CommandSeparator /> : null}
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
