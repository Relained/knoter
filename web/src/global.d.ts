import type { ThemeHarness } from "./theming/runtime";
import type { IconThemeRuntime } from "./icons/runtime";
import type { GlobalConfigFileBridge, GlobalConfigRuntime } from "./settings/runtime";
import type { KnotenApiClient } from "./api/graphApi";

declare module "*.css";

declare global {
  interface Window {
    knoterIcons?: IconThemeRuntime;
    knoterTheme?: ThemeHarness;
    knoterConfig?: GlobalConfigRuntime;
    knoterConfigFile?: GlobalConfigFileBridge;
    knoterApi?: KnotenApiClient;
  }
}

export {};
