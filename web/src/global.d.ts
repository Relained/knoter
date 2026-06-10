import type { ThemeHarness } from "./shared/theming/runtime";
import type { IconThemeRuntime } from "./shared/icons/runtime";
import type {
  GlobalConfigFileBridge,
  GlobalConfigRuntime,
} from "./core/settings/runtime";
import type { KnotenApiClient } from "./core/api/graphApi";

declare module "*.css";

declare global {
  interface Window {
    knoterIcons?: IconThemeRuntime;
    knoterTheme?: ThemeHarness;
    knoterConfig?: GlobalConfigRuntime;
    knoterConfigFile?: GlobalConfigFileBridge;
    knoterApi?: KnotenApiClient;
    knoterShell?: {
      platform: string;
      onFullScreenChange: (
        listener: (isFullScreen: boolean) => void,
      ) => () => void;
    };
  }
}

export {};
