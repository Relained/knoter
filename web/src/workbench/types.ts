import type { IconName } from "../shared/icons/registry";

export type DockPosition = "top" | "bottom";
export type ViewKind = "artifact" | "source" | "daily-note" | "note-editor";
export type ToolKey =
  | "artifacts"
  | "source"
  | "search"
  | "daily"
  | "calendar"
  | "todo"
  | "notifications"
  | "settings";
export type SourcePrivacy = "public" | "private";
export type SourceTimeScope = "permanent" | "temporary";
export type SourceWikiPolicy = "never" | "ask" | "allowed";

export type HtmlTab = {
  id: string;
  title: string;
  kind: ViewKind;
  label: string;
  html: string;
};

export type WorkbenchWidget = {
  id: string;
  view: HtmlTab;
  ratio: number;
};

export type SourceDraft = {
  title: string;
  mediaType: string;
  fileNames: string[];
  privacy: SourcePrivacy;
  timeScope: SourceTimeScope;
  wikiPolicy: SourceWikiPolicy;
};

export type SourceRecord = SourceDraft & {
  id: string;
  status: string;
  createdAt: string;
};

export type ToastMessage = {
  id: number;
  text: string;
  createdAt: string;
};

export type CommandOptionType = "string" | "number" | "boolean" | "enum";
export type CommandOptionValue = string | number | boolean;
export type CommandValues = Record<string, CommandOptionValue | undefined>;

export type CommandOption = {
  key: string;
  label: string;
  type: CommandOptionType;
  required?: boolean;
  enumValues?: string[];
  defaultValue?: CommandOptionValue;
  placeholder?: string;
};

export type WorkbenchCommand = {
  id: string;
  title: string;
  detail: string;
  icon: IconName;
  options?: CommandOption[];
  run: (values: CommandValues) => void | Promise<void>;
};

export type PendingCommand = {
  command: WorkbenchCommand;
  values: CommandValues;
};

export type ToolItem = {
  key: ToolKey;
  label: string;
  icon: IconName;
};
