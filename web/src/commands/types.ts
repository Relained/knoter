import type { IconName } from "../icons/registry";

export type Command = {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  keywords?: string[];
  run: () => void;
};
