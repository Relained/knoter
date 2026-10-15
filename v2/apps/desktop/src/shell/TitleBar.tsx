import { Copy, Minus, Network, Search, Square, X } from 'lucide-react';
import type { WindowCommand, WindowState } from '@knoter/contracts/native';
import { formatBinding } from './shortcuts';

/**
 * The app-drawn title bar. Its empty areas drag the window; macOS keeps its traffic
 * lights at the left, and other platforms get knoter's own window controls.
 */
export function TitleBar({
  windowState,
  onWindow,
  title,
  workspace,
  onHome,
  onSearch,
  searchBinding,
}: {
  /** Null in the browser preview, where there is no window to control. */
  windowState: WindowState | null;
  onWindow: (command: WindowCommand) => void;
  title: string;
  workspace: string;
  onHome: () => void;
  onSearch: () => void;
  searchBinding: string;
}) {
  const mac = windowState?.platform === 'darwin';
  const controls = !!windowState && !mac;
  return (
    <header
      className={`titlebar ${mac && !windowState?.fullscreen ? 'titlebar-inset' : ''}`}
      onDoubleClick={(e) => {
        // Windows and macOS handle double-clicks on drag regions themselves.
        if (windowState?.platform === 'linux' && e.target === e.currentTarget)
          onWindow({ action: 'toggleMaximize' });
      }}
    >
      <div className="titlebar-left">
        <button className="titlebar-brand" onClick={onHome} title="Home: search and graph">
          <Network size={15} strokeWidth={2} />
          <span>
            knoter<span className="brand-period">.</span>
          </span>
        </button>
        <span className="titlebar-workspace">{workspace}</span>
        {title && (
          <>
            <span className="titlebar-sep">/</span>
            <span className="titlebar-doc" title={title}>
              {title}
            </span>
          </>
        )}
      </div>
      <button className="titlebar-search" onClick={onSearch} aria-label="Search notes and commands">
        <Search size={13} />
        <span>Search notes and commands</span>
        {searchBinding && <kbd>{formatBinding(searchBinding)}</kbd>}
      </button>
      <div className="titlebar-right">
        {controls && (
          <div className="window-controls">
            <button aria-label="Minimize window" onClick={() => onWindow({ action: 'minimize' })}>
              <Minus size={14} />
            </button>
            <button
              aria-label={windowState!.maximized ? 'Restore window' : 'Maximize window'}
              onClick={() => onWindow({ action: 'toggleMaximize' })}
            >
              {windowState!.maximized ? <Copy size={12} /> : <Square size={11} />}
            </button>
            <button
              className="window-close"
              aria-label="Close window"
              onClick={() => onWindow({ action: 'close' })}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
