import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDownToLine,
  BookOpen,
  Link2,
  MoreHorizontal,
  Network,
  PencilLine,
  Star,
  Trash2,
} from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import { Button } from './ui/button';

type DocumentActions = {
  open: (id: string) => void;
  edit: (id: string) => void;
  favorite: (id: string) => void;
  graph: (id: string) => void;
  copyLink: (id: string) => void;
  export: (doc: WikiDocument) => void;
  delete: (doc: WikiDocument) => void;
};
const Actions = createContext<DocumentActions | null>(null);

export function DocumentActionsProvider({
  value,
  children,
}: {
  value: DocumentActions;
  children: ReactNode;
}) {
  return <Actions.Provider value={value}>{children}</Actions.Provider>;
}

function MenuItems({ doc, kind }: { doc: WikiDocument; kind: 'context' | 'dropdown' }) {
  const actions = useContext(Actions)!;
  const Menu = kind === 'context' ? ContextMenu : DropdownMenu;
  const items = [
    { label: 'Open note', icon: BookOpen, run: () => actions.open(doc.id) },
    { label: 'Edit note', icon: PencilLine, run: () => actions.edit(doc.id) },
    {
      label: doc.favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: Star,
      run: () => actions.favorite(doc.id),
    },
    { label: 'Explore connections', icon: Network, run: () => actions.graph(doc.id) },
    { label: 'Copy note link', icon: Link2, run: () => actions.copyLink(doc.id) },
    { label: 'Export Markdown', icon: ArrowDownToLine, run: () => actions.export(doc) },
  ];
  return (
    <>
      <Menu.Label className="document-menu-label">{doc.title}</Menu.Label>
      <Menu.Separator className="document-menu-separator" />
      {items.map((item) => (
        <Menu.Item key={item.label} className="document-menu-item" onSelect={item.run}>
          <item.icon size={15} />
          <span>{item.label}</span>
        </Menu.Item>
      ))}
      <Menu.Separator className="document-menu-separator" />
      <Menu.Item
        className="document-menu-item menu-destructive"
        onSelect={() => actions.delete(doc)}
      >
        <Trash2 size={15} />
        <span>Move to Trash</span>
      </Menu.Item>
    </>
  );
}

export function DocumentContextMenu({
  doc,
  children,
  disabled = false,
}: {
  doc: WikiDocument;
  children: ReactElement;
  disabled?: boolean;
}) {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger
        asChild
        disabled={disabled}
        onContextMenuCapture={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const selection = window.getSelection();
          const selectedHere =
            selection?.toString() &&
            event.currentTarget.contains(selection.anchorNode) &&
            event.currentTarget.contains(selection.focusNode);
          // Preserve text-selection, editor, and external-link browser menus.
          if (
            selectedHere ||
            target?.closest(
              'input, textarea, [contenteditable="true"], a[target="_blank"], .citation',
            )
          )
            event.stopPropagation();
        }}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="document-menu"
          collisionPadding={10}
          aria-label={`Actions for ${doc.title}`}
          // Portals still bubble React events through the graph's SVG ancestors.
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MenuItems doc={doc} kind="context" />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function DocumentMenuButton({
  doc,
  disabled = false,
}: {
  doc: WikiDocument;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button
          className="document-more"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Actions for ${doc.title}`}
          title="Note actions"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="document-menu"
          align="end"
          sideOffset={6}
          collisionPadding={10}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MenuItems doc={doc} kind="dropdown" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
