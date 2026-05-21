import { SettingsView } from "../components/SettingsView";
import type { WorkspaceObjectRendererProps } from "./types";

export function SettingsObjectRenderer({ settings, onChangeSettings }: WorkspaceObjectRendererProps) {
  return <SettingsView settings={settings} onChangeSettings={onChangeSettings} />;
}
