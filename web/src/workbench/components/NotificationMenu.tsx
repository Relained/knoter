import type { CSSProperties } from "react";
import type { RunningOperation, ToastMessage } from "../types";

export function NotificationMenu({
  messages,
  runningOps,
  style,
  onDismiss,
  onClearAll,
}: {
  messages: ToastMessage[];
  runningOps: RunningOperation[];
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
      {runningOps.length > 0 && (
        <ul className="notification-running" aria-label="Operations in progress">
          {runningOps.map((operation) => (
            <li key={operation.id}>
              <span className="notification-running-spinner" aria-hidden="true" />
              <span className="notification-running-label">
                {operation.label}
              </span>
              <time dateTime={operation.startedAt}>
                {new Date(operation.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
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
