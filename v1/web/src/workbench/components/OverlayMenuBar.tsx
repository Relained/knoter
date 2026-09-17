import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "../../shared/icons/Icon";
import {
  menuToolItems,
  quickAccessToolItems,
  systemToolItems,
} from "../fixtures";
import type { RunningOperation, ToastMessage, ToolKey } from "../types";
import { NotificationMenu } from "./NotificationMenu";
import { ToolMenu } from "./ToolMenu";

const quickAccessCommands: Partial<Record<ToolKey, string>> = {
  daily: "open.daily-note",
  calendar: "open.calendar",
  todo: "open.todo",
};

export function OverlayBar({
  openTool,
  settingsOpen,
  unreadCount,
  runningOps,
  toastHistory,
  onOpenTool,
  onToggleNotifications,
  onDismissMessage,
  onClearMessages,
  onRunCommand,
}: {
  openTool: ToolKey | null;
  settingsOpen: boolean;
  unreadCount: number;
  runningOps: RunningOperation[];
  toastHistory: ToastMessage[];
  onOpenTool: (
    tool: ToolKey | null | ((current: ToolKey | null) => ToolKey | null),
  ) => void;
  onToggleNotifications: () => void;
  onDismissMessage: (messageId: number) => void;
  onClearMessages: () => void;
  onRunCommand: (commandId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef(new Map<ToolKey, HTMLDivElement | null>());
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  // The bar clips its contents (overflow: hidden for icon scrolling), so
  // popups are fixed-positioned next to the open slot instead of absolute
  // within it. The bar is bottom-fixed, so the anchor survives resizes.
  useLayoutEffect(() => {
    if (openTool === null) {
      setMenuStyle(null);
      return;
    }
    const slot = slotRefs.current.get(openTool);
    if (!slot) {
      setMenuStyle(null);
      return;
    }
    const rect = slot.getBoundingClientRect();
    setMenuStyle({
      left: rect.right + 10,
      bottom: window.innerHeight - rect.bottom,
    });
  }, [openTool]);

  // Menus open on click and close on outside click / Escape / window blur
  // (blur covers clicks landing inside sandboxed iframes).
  useEffect(() => {
    if (openTool === null) return;
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) {
        return;
      }
      onOpenTool(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenTool(null);
    }
    function onWindowBlur() {
      onOpenTool(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [openTool, onOpenTool]);

  return (
    <div className="overlay-bar" ref={rootRef}>
      <div className="overlay-actions-row">
        <div className="overlay-icons" aria-label="Tool menus">
          {menuToolItems.map((tool) => (
            <div
              className="overlay-tool-slot"
              key={tool.key}
              ref={(element) => {
                slotRefs.current.set(tool.key, element);
              }}
              onMouseEnter={() =>
                onOpenTool((current) => (current === null ? null : tool.key))
              }
            >
              <button
                className={`overlay-icon-button ${openTool === tool.key ? "is-active" : ""}`}
                type="button"
                aria-label={tool.label}
                title={tool.label}
                onClick={() =>
                  onOpenTool((current) =>
                    current === tool.key ? null : tool.key,
                  )
                }
              >
                <Icon name={tool.icon} size={18} />
              </button>
              {openTool === tool.key && menuStyle && (
                <ToolMenu
                  tool={tool.key}
                  style={menuStyle}
                  onRunCommand={onRunCommand}
                />
              )}
            </div>
          ))}
          <span className="overlay-separator" aria-hidden="true">
            |
          </span>
          {quickAccessToolItems.map((tool) => (
            <button
              className="overlay-icon-button"
              type="button"
              aria-label={tool.label}
              title={tool.label}
              onClick={() => {
                const commandId = quickAccessCommands[tool.key];
                if (commandId) onRunCommand(commandId);
              }}
              key={tool.key}
            >
              <Icon name={tool.icon} size={18} />
            </button>
          ))}
          <span className="overlay-separator" aria-hidden="true">
            |
          </span>
          {systemToolItems.map((tool) =>
            tool.key === "notifications" ? (
              <div
                className="overlay-tool-slot"
                key={tool.key}
                ref={(element) => {
                  slotRefs.current.set(tool.key, element);
                }}
              >
                <button
                  className={`overlay-icon-button ${openTool === "notifications" ? "is-active" : ""}`}
                  type="button"
                  aria-label={tool.label}
                  title={tool.label}
                  aria-expanded={openTool === "notifications"}
                  onClick={onToggleNotifications}
                >
                  <Icon name={tool.icon} size={18} />
                  {runningOps.length > 0 && (
                    <span
                      className="notification-spinner"
                      role="status"
                      aria-label={`${runningOps.length} operation(s) running`}
                    />
                  )}
                  {unreadCount > 0 && (
                    <span className="notification-badge" aria-hidden="true">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {openTool === "notifications" && menuStyle && (
                  <NotificationMenu
                    messages={toastHistory}
                    runningOps={runningOps}
                    style={menuStyle}
                    onDismiss={onDismissMessage}
                    onClearAll={onClearMessages}
                  />
                )}
              </div>
            ) : (
              <button
                className={`overlay-icon-button ${settingsOpen ? "is-active" : ""}`}
                type="button"
                aria-label={tool.label}
                title={tool.label}
                onClick={() => onRunCommand("settings.open")}
                key={tool.key}
              >
                <Icon name={tool.icon} size={18} />
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
