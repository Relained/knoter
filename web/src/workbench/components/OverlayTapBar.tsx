import { Icon } from "../../shared/icons/Icon";
import type { DockPosition, HtmlTab } from "../types";

interface OverlayTabsProps {
  tabDock: DockPosition;
  tabs: HtmlTab[];
  activeTabId: string | null;
  isSharedDock: boolean;
  onOpenTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}

export function OverlayTabs({
  tabDock,
  tabs,
  activeTabId,
  isSharedDock,
  onOpenTab,
  onCloseTab,
}: OverlayTabsProps) {
  // 띄워진 탭이 없을 때 바 자체를 숨기고 싶다면 이 주석을 해제하세요.
  // if (tabs.length === 0) return null;

  return (
    <div
      className={`overlay-tabs-bar overlay-tabs-${tabDock} ${
        isSharedDock ? "is-shared-dock" : ""
      }`}
      aria-label="Open tabs"
    >
      <div className="overlay-tabs-container">
        {tabs.map((tab) => (
          <div
            className={`overlay-tab ${tab.id === activeTabId ? "is-active" : ""}`}
            key={tab.id}
          >
            <button
              className="overlay-tab-select"
              type="button"
              onClick={() => onOpenTab(tab.id)}
            >
              <span className="overlay-tab-title">{tab.title}</span>
            </button>
            <button
              className="overlay-tab-close"
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <Icon name="window.close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
