import { BookOpen, Brain, FlaskConical, Leaf, Network, FileText, File } from 'lucide-react';
import type { Source, WikiDocument } from '@knoter/contracts';

export const documentIcons = {
  book: BookOpen,
  brain: Brain,
  flask: FlaskConical,
  leaf: Leaf,
  network: Network,
};
export function DocIcon({ doc, size = 16 }: { doc: Pick<WikiDocument, 'icon'>; size?: number }) {
  const Icon = documentIcons[doc.icon];
  return <Icon size={size} />;
}
export function SourceIcon({ type }: { type: Source['type'] }) {
  return (
    <span className={`file-icon file-${type}`}>
      {type === 'pdf' ? <File size={19} /> : <FileText size={19} />}
      <span>{type.toUpperCase()}</span>
    </span>
  );
}
export function relativeTime(value: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}
export function fileSize(bytes: number) {
  return bytes > 1000000
    ? `${(bytes / 1000000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
export function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
