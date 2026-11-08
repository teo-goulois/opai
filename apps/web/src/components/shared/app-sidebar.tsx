import { Kbd } from "@opai/ui/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLink,
  SidebarMenu,
  SidebarMenuItem,
} from "@opai/ui/components/ui/sidebar";
import {
  AnalyticsIcon,
  FolderIcon,
  HandbookIcon,
  LanguageIcon,
  MachineIcon,
  OpsIcon,
  MoonIcon,
  PaletteIcon,
  SearchIcon,
  SessionsIcon,
  SkillIcon,
  SunIcon,
  TerminalIcon,
} from "@opai/ui/icon";
import { formatForDisplay, useAppHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentType, SVGProps } from "react";

import { orderSpaces, SpaceDot } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

import { toggleLocale, useThemeToggle } from "./app-preferences";
import { useCommandPalette } from "./command-palette";
import { Logo } from "./logo";

type NavItem = {
  to: LinkProps["to"];
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

/** The destinations past the spaces. A new section is one more item or group here. */
function useNavGroups(): NavGroup[] {
  return [
    {
      id: "across",
      label: m.nav_group_across(),
      items: [
        { to: "/skills", label: m.nav_skills(), icon: SkillIcon },
        { to: "/mcp", label: m.nav_mcp(), icon: TerminalIcon },
        { to: "/sessions", label: m.nav_sessions(), icon: SessionsIcon },
        { to: "/automations", label: m.nav_automations(), icon: OpsIcon },
      ],
    },
    {
      id: "instance",
      label: m.nav_group_instance(),
      items: [
        { to: "/config", label: m.nav_config(), icon: FolderIcon },
        { to: "/machines", label: m.nav_machines(), icon: MachineIcon },
        { to: "/handbook", label: m.nav_handbook(), icon: HandbookIcon },
        { to: "/analytics", label: m.nav_analytics(), icon: AnalyticsIcon },
      ],
    },
    ...(import.meta.env.DEV
      ? [
          {
            id: "dev",
            label: m.nav_group_dev(),
            items: [{ to: "/design-system", label: m.nav_design_system(), icon: PaletteIcon }],
          } satisfies NavGroup,
        ]
      : []),
  ];
}

/** Every space, the base one first: the root of the navigation. */
function SpaceLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const spaces = useQuery(orpc.spaces.list.queryOptions());
  return (
    <SidebarGroup>
      <SidebarGroupLabel
        render={<Link to="/spaces" activeOptions={{ exact: true }} onClick={onNavigate} />}
      >
        {m.nav_spaces()}
      </SidebarGroupLabel>
      <SidebarMenu>
        {orderSpaces(spaces.data ?? []).map((space, index) => (
          <SidebarMenuItem key={space.name}>
            <SidebarLink
              render={
                <Link to="/spaces/$name" params={{ name: space.name }} onClick={onNavigate} />
              }
            >
              <span className="flex size-l items-center justify-center" aria-hidden>
                <SpaceDot index={index} />
              </span>
              <span className="truncate">{space.name}</span>
            </SidebarLink>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNavGroups();
  const { openCommandPalette } = useCommandPalette();
  const toggleTheme = useThemeToggle();
  const hotkeys = useAppHotkeys();
  const paletteHotkey = hotkeys["palette.open"].hotkey;
  const themeHotkey = hotkeys["theme.toggle"].hotkey;

  return (
    <Sidebar>
      <SidebarHeader className="px-s py-xs">
        <Link to="/" onClick={onNavigate} className="flex w-fit rounded-xs text-neutral-10">
          <Logo className="h-5 w-auto" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={m.nav_main()} className="flex flex-col gap-l">
          <SpaceLinks onNavigate={onNavigate} />
          {groups.map((group) => (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarLink render={<Link to={item.to} onClick={onNavigate} />}>
                      <item.icon aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </SidebarLink>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarLink render={<button type="button" onClick={openCommandPalette} />}>
          <SearchIcon aria-hidden />
          <span>{m.search()}</span>
          {paletteHotkey ? <Kbd className="ms-auto">{formatForDisplay(paletteHotkey)}</Kbd> : null}
        </SidebarLink>
        <SidebarLink render={<button type="button" onClick={toggleLocale} />}>
          <LanguageIcon aria-hidden />
          <span>{m.language_current({ locale: getLocale().toUpperCase() })}</span>
        </SidebarLink>
        <SidebarLink render={<button type="button" onClick={toggleTheme} />}>
          <SunIcon aria-hidden className="dark:hidden" />
          <MoonIcon aria-hidden className="hidden dark:block" />
          <span>{m.theme_toggle()}</span>
          {themeHotkey ? <Kbd className="ms-auto">{formatForDisplay(themeHotkey)}</Kbd> : null}
        </SidebarLink>
      </SidebarFooter>
    </Sidebar>
  );
}
