import {
  Bold,
  CalendarDays,
  CheckSquare,
  Columns2,
  Dock,
  FilePlus2,
  Italic,
  Link,
  ListChecks,
  Maximize2,
  Move,
  Network,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTop,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type IconComponent = LucideIcon;

export const lucideIconRegistry = {
  "command.search": Search,
  "document.new": FilePlus2,
  "document.refresh": RefreshCw,
  "layout.split": Columns2,
  "layout.float": Maximize2,
  "layout.move": Move,
  "layout.toolbar": PanelTop,
  "sidebar.collapse": PanelLeftClose,
  "sidebar.expand": PanelLeftOpen,
  "layout.square": Square,
  "appearance.theme": Paintbrush,
  "settings.open": Settings,
  "object.graph3d": Network,
  "object.tasks": ListChecks,
  "object.todo": CheckSquare,
  "object.calendar": CalendarDays,
  "item.add": Plus,
  "item.delete": Trash2,
  "text.bold": Bold,
  "text.italic": Italic,
  "text.link": Link,
  "window.dock": Dock,
  "window.close": X,
  fallback: Square
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof lucideIconRegistry;
export type IconRegistry = Record<IconName, IconComponent>;
export type IconThemeDefinition = {
  id: string;
  name: string;
  registry: Partial<IconRegistry>;
};

export const builtInIconThemes = {
  lucide: {
    id: "lucide",
    name: "Lucide",
    registry: lucideIconRegistry
  }
} satisfies Record<string, IconThemeDefinition>;

export type IconThemeId = keyof typeof builtInIconThemes;
