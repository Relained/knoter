import type { CSSProperties } from "react";
import type { ToastMessage } from "../types";

export function NotificationMenu({
  messages,
  style,
  onDismiss,
  onClearAll,
}: {
  messages: ToastMessage[];
  style?: CSSProperties;
  onDismiss: (messageId: number) => void;
  onClearAll: () => void;
}) {
  return (
    <div
      className="overlay-tool-menu notification-menu"
      role="menu"
      aria-label="Message history"
      style={style}
    >
      <header>
        <span>Messages</span>
        {messages.length > 0 && (
          <button type="button" onClick={onClearAll}>
            Clear all
          </button>
        )}
      </header>
      {messages.length === 0 ? (
        <p className="notification-empty">No messages.</p>
      ) : (
        <ol>
          {messages.map((message) => (
            <li key={message.id}>
              <span>{message.text}</span>
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
              <button
                type="button"
                onClick={() => onDismiss(message.id)}
                aria-label="Dismiss message"
              >
                x
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
