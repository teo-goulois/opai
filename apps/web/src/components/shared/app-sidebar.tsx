import { Kbd } from "@opai/ui/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarLink,
  SidebarLinkMeta,
  SidebarMenu,
  SidebarMenuItem,
} from "@opai/ui/components/ui/sidebar";
import {
  AnalyticsIcon,
  FolderIcon,
  HandbookIcon,
  LanguageIcon,
  MoonIcon,
  PaletteIcon,
  RulesIcon,
  SearchIcon,
  SessionsIcon,
  SkillIcon,
  SpacesIcon,
  SunIcon,
} from "@opai/ui/icon";
import { formatForDisplay, useAppHotkeys } from "@tanstack/react-hotkeys";
import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";
import { orpc } from "@/utils/orpc";

import { toggleLocale, useThemeToggle } from "./app-preferences";
import { useCommandPalette } from "./command-palette";

type NavItem = {
  to: LinkProps["to"];
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** A count shown at the end of the row, when known. */
  meta?: ReactNode;
};

type NavGroup = { id: string; label?: string; items: NavItem[] };

/** Every destination of the app. A new section is one more item or group here. */
function useNavGroups(): NavGroup[] {
  const spaces = useQuery(orpc.spaces.list.queryOptions());
  const rules = useQuery(orpc.rules.list.queryOptions());

  return [
    {
      id: "main",
      items: [
        { to: "/spaces", label: m.nav_spaces(), icon: SpacesIcon, meta: spaces.data?.length },
        { to: "/rules", label: m.nav_rules(), icon: RulesIcon, meta: rules.data?.length },
        { to: "/skills", label: m.nav_skills(), icon: SkillIcon },
        { to: "/config", label: m.nav_config(), icon: FolderIcon },
        { to: "/sessions", label: m.nav_sessions(), icon: SessionsIcon },
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
        <Link
          to="/"
          onClick={onNavigate}
          className="rounded-xs font-data text-m font-medium text-neutral-10"
        >
          {m.app_name()}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={m.nav_main()} className="flex flex-col gap-l">
          {groups.map((group) => (
            <SidebarGroup key={group.id}>
              {group.label ? <SidebarGroupLabel>{group.label}</SidebarGroupLabel> : null}
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarLink render={<Link to={item.to} onClick={onNavigate} />}>
                      <item.icon aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.meta !== undefined ? (
                        <SidebarLinkMeta>{item.meta}</SidebarLinkMeta>
                      ) : null}
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
