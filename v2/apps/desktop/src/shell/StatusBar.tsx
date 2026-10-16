import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bot,
  ChevronRight,
  Folder,
  GitPullRequestArrow,
  Loader2,
  Maximize,
  Menu,
  MessageSquare,
  Minimize,
  PanelLeft,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { PanelTab } from '../components/ContextPanel';

export type AgentStatus = 'ready' | 'paused' | 'attention' | 'offline' | 'preview';
const agentLabels: Record<AgentStatus, string> = {
  ready: 'Agent ready',
  paused: 'Queue paused',
  attention: 'Agent needs setup',
  offline: 'Service offline',
  preview: 'Simulated agent',
};

function Item({
  label,
  title,
  pressed,
  onClick,
  children,
  className = '',
}: {
  label: string;
  title?: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`status-item ${pressed ? 'pressed' : ''} ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The bottom status bar: navigation on the left; workspace state, windows, and panel
 * toggles on the right, as in Zed's dock buttons.
 */
export function StatusBar({
  navCompact,
  onToggleNav,
  onMobileNav,
  history,
  crumbs,
  saveState,
  processing,
  sourcesCount,
  agent,
  review,
  panel,
  zen,
  titles,
  onSources,
  onAgent,
  onActivity,
  onToggleChat,
  onToggleChanges,
  onZen,
}: {
  navCompact: boolean;
  onToggleNav: () => void;
  onMobileNav: () => void;
  history: { canBack: boolean; canForward: boolean; back: () => void; forward: () => void };
  crumbs: { label: string; onClick?: () => void }[];
  saveState: { label: string; offline: boolean };
  processing: number;
  sourcesCount: number;
  agent: AgentStatus;
  review: number;
  panel: PanelTab | null;
  zen: boolean;
  titles: {
    nav: string;
    back: string;
    forward: string;
    sources: string;
    agent: string;
    activity: string;
    chat: string;
    changes: string;
    zen: string;
  };
  onSources: () => void;
  onAgent: () => void;
  onActivity: () => void;
  onToggleChat: () => void;
  onToggleChanges: () => void;
  onZen: () => void;
}) {
  return (
    <footer className="statusbar" aria-label="Status bar">
      <div className="statusbar-group">
        <Item
          className="desktop-only"
          label={navCompact ? 'Expand navigation' : 'Use compact navigation'}
          title={titles.nav}
          pressed={!navCompact}
          onClick={onToggleNav}
        >
          <PanelLeft size={14} />
        </Item>
        <Item className="mobile-only" label="Open navigation" onClick={onMobileNav}>
          <Menu size={14} />
        </Item>
        <span className="statusbar-divider" />
        <button
          className="status-item"
          aria-label="Go back"
          title={titles.back}
          disabled={!history.canBack}
          onClick={history.back}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          className="status-item"
          aria-label="Go forward"
          title={titles.forward}
          disabled={!history.canForward}
          onClick={history.forward}
        >
          <ArrowRight size={14} />
        </button>
        <nav className="statusbar-crumbs" aria-label="Breadcrumbs">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 && <ChevronRight size={11} />}
              {crumb.onClick ? (
                <button onClick={crumb.onClick}>{crumb.label}</button>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="statusbar-group">
        <span className={`status-text ${saveState.offline ? 'status-offline' : ''}`}>
          <span className="status-dot" />
          {saveState.label}
        </span>
        {processing > 0 && (
          <button className="status-item status-wide" onClick={onSources} title="Open Sources">
            <Loader2 size={12} className="spin" />
            Processing {processing}
          </button>
        )}
        <span className="statusbar-divider" />
        <Item label="Sources" title={titles.sources} onClick={onSources} className="status-wide">
          <Folder size={14} />
          <span className="status-label">Sources</span>
          {sourcesCount > 0 && <small>{sourcesCount}</small>}
        </Item>
        <Item
          label={agentLabels[agent]}
          title={titles.agent}
          onClick={onAgent}
          className="status-wide"
        >
          <Bot size={14} />
          <span className="status-label">Agent</span>
          <i className={`agent-dot agent-${agent}`} />
        </Item>
        <Item label="Activity" title={titles.activity} onClick={onActivity}>
          <Bell size={14} />
        </Item>
        <span className="statusbar-divider" />
        <Item label="Chat" title={titles.chat} pressed={panel === 'chat'} onClick={onToggleChat}>
          <MessageSquare size={14} />
        </Item>
        <Item
          label={review ? `Changes, ${review} waiting for review` : 'Changes'}
          title={titles.changes}
          pressed={panel === 'changes'}
          onClick={onToggleChanges}
        >
          <GitPullRequestArrow size={14} />
          {review > 0 && <small className="status-badge-count">{review}</small>}
        </Item>
        <Item
          label={zen ? 'Exit Zen mode' : 'Enter Zen mode'}
          title={titles.zen}
          pressed={zen}
          onClick={onZen}
        >
          {zen ? <Minimize size={14} /> : <Maximize size={14} />}
          {zen && <span>Exit Zen</span>}
        </Item>
      </div>
    </footer>
  );
}
