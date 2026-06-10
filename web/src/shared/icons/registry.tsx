import {
  Bell,
  CalendarDays,
  CheckSquare,
  Database,
  Dock,
  FilePlus2,
  FileStack,
  Pin,
  PinOff,
  Sparkles,
  Search,
  Settings,
  Square,
  TriangleAlert,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type IconComponent = LucideIcon;

export const lucideIconRegistry = {
  "command.search": Search,
  "artifact.list": FileStack,
  "agent.refresh": Sparkles,
  "document.new": FilePlus2,
  "settings.open": Settings,
  "object.todo": CheckSquare,
  "object.calendar": CalendarDays,
  "notification.bell": Bell,
  "widget.pin": Pin,
  "widget.unpin": PinOff,
  "window.dock": Dock,
  "window.close": X,
  "status.vault": Database,
  "status.warning": TriangleAlert,
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
