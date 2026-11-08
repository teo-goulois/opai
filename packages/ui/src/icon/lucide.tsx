// The free icon set: Lucide (https://lucide.dev), sized like the text around
// it. index.ts picks this one unless the Nucleo set is built (see README.md).
// Every set exports the same names; add a name here and in nucleo.json.
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  ChartLine,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Command,
  Ellipsis,
  Expand,
  FileText,
  Folder,
  GitMerge,
  Info,
  Languages,
  Laptop,
  Layers,
  Loader,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Pen,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Sparkle,
  SquareTerminal,
  Sun,
  Terminal,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  User,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

import type { IconProps } from "./props";

function icon(Lucide: LucideIcon) {
  return function Icon(props: IconProps) {
    return <Lucide size="1em" {...props} />;
  };
}

export const AddIcon = icon(Plus);
export const AnalyticsIcon = icon(ChartLine);
export const CheckIcon = icon(Check);
export const ChevronLeftIcon = icon(ChevronLeft);
export const ChevronRightIcon = icon(ChevronRight);
export const ChevronsUpDownIcon = icon(ChevronsUpDown);
export const CommandIcon = icon(Command);
export const DeleteIcon = icon(Trash2);
export const EditIcon = icon(Pen);
export const ExternalLinkIcon = icon(ArrowUpRight);
export const FileIcon = icon(FileText);
export const FitViewIcon = icon(Expand);
export const FolderIcon = icon(Folder);
export const HandbookIcon = icon(BookOpen);
export const InfoIcon = icon(Info);
export const LanguageIcon = icon(Languages);
export const LoaderIcon = icon(Loader);
export const MachineIcon = icon(Laptop);
export const MoonIcon = icon(Moon);
export const MoreIcon = icon(Ellipsis);
export const MoveIcon = icon(ArrowRight);
export const OpsIcon = icon(ClipboardList);
export const OwnedIcon = icon(User);
export const PaletteIcon = icon(Palette);
export const PullRequestIcon = icon(GitMerge);
export const RefreshIcon = icon(RefreshCw);
export const ResetViewIcon = icon(RotateCcw);
export const RulesIcon = icon(ScrollText);
export const SearchIcon = icon(Search);
export const SessionsIcon = icon(Terminal);
export const SidebarIcon = icon(PanelLeft);
export const SkillIcon = icon(Sparkle);
export const SpacesIcon = icon(Layers);
export const SunIcon = icon(Sun);
export const SystemThemeIcon = icon(Monitor);
export const TerminalIcon = icon(SquareTerminal);
export const TrendDownIcon = icon(TrendingDown);
export const TrendUpIcon = icon(TrendingUp);
export const VendoredIcon = icon(Box);
export const WarningIcon = icon(TriangleAlert);
export const XIcon = icon(X);
export const ZoomInIcon = icon(ZoomIn);
export const ZoomOutIcon = icon(ZoomOut);
