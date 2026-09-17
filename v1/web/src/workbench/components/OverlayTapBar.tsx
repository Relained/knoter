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
  if (tabs.length === 0) return null;

  return (
    <div
      className={`overlay-tabs-bar overlay-tabs-${tabDock} ${
        isSharedDock ? "is-shared-dock" : ""
      }`}
    >
      <div className="overlay-tabs-container" role="tablist" aria-label="Open tabs">
        {tabs.map((tab) => (
          <div
            className={`overlay-tab ${tab.id === activeTabId ? "is-active" : ""}`}
            key={tab.id}
          >
            <button
              className="overlay-tab-select"
              type="button"
              role="tab"
              aria-selected={tab.id === activeTabId}
              title={tab.title}
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
