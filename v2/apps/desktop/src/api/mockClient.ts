import type {
  KnoterClient,
  WorkspaceSnapshot,
  Activity,
  SourceImport,
  WikiDocument,
} from '@knoter/contracts';
import { createSeed } from './seed';

const storageKey = 'knoter.frontend-demo.v1';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMockClient(): KnoterClient {
  let data = structuredClone(createSeed());
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (
      saved &&
      ['documents', 'sources', 'tasks', 'events', 'revisions', 'activities', 'messages'].every(
        (key) => Array.isArray(saved[key]),
      ) &&
      saved.settings
    )
      data = {
        ...saved,
        trashedDocuments: Array.isArray(saved.trashedDocuments) ? saved.trashedDocuments : [],
      };
  } catch {
    /* A fresh demo is available if storage was cleared or corrupted. */
  }
  data.messages = data.messages.map((m) =>
    m.status === 'streaming' ? { ...m, status: 'stopped' } : m,
  );
  const listeners = new Set<() => void>();
  const pending = new Set<string>();
  let sending = false;
  const notify = () => listeners.forEach((listener) => listener());
  const commit = (next = data) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      data = next;
    } catch {
      throw new Error(
        'Browser storage is full or unavailable. Free some space and try again; export important notes before closing.',
      );
    } finally {
      notify();
    }
  };
  const activity = (item: Omit<Activity, 'id' | 'createdAt'>) => {
    data.activities.unshift({ ...item, id: uid(), createdAt: now() });
    data.activities = data.activities.slice(0, 30);
  };
  const document = (id: string) => {
    const found = data.documents.find((d) => d.id === id);
    if (!found) throw new Error('This document is no longer available.');
    return found;
  };
  const recordRevision = (doc: WikiDocument, summary: string) => {
    data.revisions.unshift({
      id: uid(),
      documentId: doc.id,
      revision: doc.revision,
      title: doc.title,
      body: doc.body,
      createdAt: now(),
      author: 'You',
      summary,
    });
  };

  async function processSource(id: string) {
    if (pending.has(id)) return;
    pending.add(id);
    try {
      await delay(900);
      while (data.settings.workerPaused) await delay(600);
      let source = data.sources.find((s) => s.id === id);
      if (!source) return;
      source.status = 'extracting';
      commit();
      await delay(1600);
      while (data.settings.workerPaused) await delay(600);
      // Trash operations publish a new snapshot while this workflow is waiting.
      source = data.sources.find((s) => s.id === id);
      if (!source) return;
      const docId = `import-${id}`;
      const inTrash = data.trashedDocuments.some((d) => d.id === docId);
      if (!data.documents.some((d) => d.id === docId) && !inTrash) {
        const body =
          source.type === 'pdf'
            ? `## Ready for a closer look\n\n**${source.title}** has been added to your demo workspace.\n\n> This is a simulated processing result. PDF extraction and AI generation will be connected through the service adapter.\n\n## Your notes\n\nOpen the editor to add your own observations.\n\n[View source](#source-${id})`
            : `${source.excerpt}\n\n---\n\n[Imported source](#source-${id})`;
        const doc: WikiDocument = {
          id: docId,
          title: source.title,
          description: 'A new note from your source library.',
          body,
          category: 'Your imports',
          icon: 'book',
          sourceIds: [id],
          relatedIds: [],
          favorite: false,
          revision: 1,
          protected: false,
          updatedAt: now(),
        };
        data.documents.unshift(doc);
        data.revisions.unshift({
          id: uid(),
          documentId: docId,
          revision: 1,
          title: doc.title,
          body,
          createdAt: now(),
          author: 'knoter',
          summary: 'Created by the demo source workflow',
        });
      }
      source.status = 'ready';
      source.documentIds = [docId];
      activity({
        kind: 'source',
        title: `Added ${source.title}`,
        detail: inTrash
          ? 'Demo processing complete · existing note remains in Trash'
          : 'Demo processing complete · 1 wiki note connected',
        documentId: docId,
      });
      commit();
    } catch {
      const source = data.sources.find((s) => s.id === id);
      if (source) source.status = 'failed';
      notify();
    } finally {
      pending.delete(id);
    }
  }

  const client: KnoterClient = {
    mode: 'demo',
    async getSnapshot() {
      const snapshot = structuredClone(data);
      const active = new Set(snapshot.documents.map((doc) => doc.id));
      // Keep relationship IDs in storage for restoration, but expose only active
      // navigation targets. Other notes' Markdown is never rewritten by deletion.
      snapshot.documents.forEach((doc) => {
        doc.relatedIds = doc.relatedIds.filter((id) => active.has(id));
      });
      snapshot.sources.forEach((source) => {
        source.documentIds = source.documentIds.filter((id) => active.has(id));
      });
      snapshot.messages.forEach((message) => {
        message.documentIds = message.documentIds.filter((id) => active.has(id));
      });
      [...snapshot.tasks, ...snapshot.activities].forEach((item) => {
        if (item.documentId && !active.has(item.documentId)) delete item.documentId;
      });
      snapshot.revisions = snapshot.revisions.filter((revision) => active.has(revision.documentId));
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async saveDocument(input) {
      const doc = document(input.id);
      if (doc.revision !== input.baseRevision)
        throw new Error('This note has a newer revision. Reopen it before saving your changes.');
      if (!input.title.trim()) throw new Error('Give your note a title before saving.');
      doc.title = input.title.trim();
      doc.body = input.body;
      doc.revision += 1;
      doc.protected = true;
      doc.updatedAt = now();
      recordRevision(doc, 'Edited and saved by you');
      activity({
        kind: 'document',
        title: `Edited ${doc.title}`,
        detail: `Revision ${doc.revision} · your changes are protected`,
        documentId: doc.id,
      });
      commit();
    },
    async createDocument() {
      const id = uid();
      const doc: WikiDocument = {
        id,
        title: 'Untitled note',
        description: 'A little space for your next idea.',
        body: '## A new idea\n\nStart writing here…',
        category: 'Your notes',
        icon: 'book',
        sourceIds: [],
        relatedIds: [],
        favorite: false,
        protected: true,
        revision: 1,
        updatedAt: now(),
      };
      data.documents.unshift(doc);
      recordRevision(doc, 'Created a new note');
      commit();
      return id;
    },
    async toggleFavorite(id) {
      const doc = document(id);
      doc.favorite = !doc.favorite;
      commit();
    },
    async deleteDocument(id) {
      const doc = document(id);
      const next = structuredClone(data);
      next.documents = next.documents.filter((item) => item.id !== id);
      next.trashedDocuments.unshift({ ...doc, deletedAt: now() });
      next.activities.unshift({
        id: uid(),
        createdAt: now(),
        kind: 'document',
        title: `Moved ${doc.title} to Trash`,
        detail: 'The note can be restored from Trash.',
      });
      next.activities = next.activities.slice(0, 30);
      // Persist first so a failed write cannot remove a note from the live session.
      commit(next);
    },
    async restoreDocument(id) {
      const trashed = data.trashedDocuments.find((doc) => doc.id === id);
      if (!trashed) throw new Error('This note is no longer in Trash.');
      if (data.documents.some((doc) => doc.id === id))
        throw new Error('This note is already restored.');
      const { deletedAt: _, ...doc } = trashed;
      const next = structuredClone(data);
      next.trashedDocuments = next.trashedDocuments.filter((item) => item.id !== id);
      next.documents.unshift(doc);
      next.activities.unshift({
        id: uid(),
        createdAt: now(),
        kind: 'document',
        documentId: id,
        title: `Restored ${doc.title}`,
        detail: 'Restored from Trash with its revision history.',
      });
      next.activities = next.activities.slice(0, 30);
      commit(next);
    },
    async restoreRevision(id) {
      const revision = data.revisions.find((r) => r.id === id);
      if (!revision) throw new Error('Revision not found.');
      const doc = document(revision.documentId);
      doc.title = revision.title;
      doc.body = revision.body;
      doc.revision += 1;
      doc.updatedAt = now();
      doc.protected = true;
      recordRevision(doc, `Restored revision ${revision.revision}`);
      commit();
    },
    async importSources(inputs: SourceImport[]) {
      if (!inputs.length) return;
      const ids: string[] = [];
      for (const input of inputs) {
        const extension = input.filename.split('.').pop()?.toLowerCase();
        if (extension !== 'pdf' && extension !== 'md' && extension !== 'txt')
          throw new Error('Choose Markdown, PDF, or text files.');
        if (data.sources.some((s) => s.filename === input.filename && s.size === input.size))
          continue;
        const id = uid();
        ids.push(id);
        data.sources.unshift({
          id,
          title: input.filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          filename: input.filename,
          type: extension,
          size: input.size,
          status: 'queued',
          addedAt: now(),
          documentIds: [],
          excerpt:
            input.text?.slice(0, 100000) ||
            'Demo PDF source. Original PDF bytes are not stored or parsed in this frontend preview.',
        });
      }
      commit();
      ids.forEach((id) => void processSource(id));
    },
    async retrySource(id) {
      const source = data.sources.find((s) => s.id === id);
      if (source) {
        source.status = 'queued';
        commit();
        void processSource(id);
      }
    },
    async createTask(input) {
      if (!input.title.trim()) throw new Error('Enter a task title.');
      data.tasks.unshift({ ...input, title: input.title.trim(), id: uid(), done: false });
      commit();
    },
    async updateTask(id, patch) {
      const task = data.tasks.find((t) => t.id === id);
      if (task) {
        Object.assign(task, patch);
        if (patch.done)
          activity({
            kind: 'task',
            title: `Completed ${task.title}`,
            detail: 'A little progress, saved.',
          });
        commit();
      }
    },
    async saveEvent(input) {
      if (!input.title.trim() || !input.date) throw new Error('An event needs a title and date.');
      const event = data.events.find((e) => e.id === input.id);
      if (event) Object.assign(event, input, { title: input.title.trim() });
      else data.events.push({ ...input, id: uid(), title: input.title.trim() });
      commit();
    },
    async deleteEvent(id) {
      data.events = data.events.filter((e) => e.id !== id);
      commit();
    },
    async sendMessage({ question, documentId, signal }) {
      if (sending) throw new Error('Let the current answer finish first.');
      const tokens = question
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 3);
      const ranked = data.documents
        .map((d) => ({
          d,
          score: tokens.filter((t) => `${d.title} ${d.body}`.toLowerCase().includes(t)).length,
        }))
        .sort((a, b) => b.score - a.score);
      const primary = documentId
        ? document(documentId)
        : ranked[0]?.score
          ? ranked[0].d
          : undefined;
      const related = primary
        ? data.documents.filter((d) => primary.relatedIds.includes(d.id)).slice(0, 1)
        : [];
      const text = primary
        ? `Here’s a starting point from **${primary.title}**.\n\n${primary.description}\n\n${primary.body
            .split('\n\n')
            .filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('>'))
            .slice(0, 2)
            .join('\n\n')
            .replace(
              /\s*\[\d+\]\([^)]*\)/g,
              '',
            )}\n\n${related.length ? `You can also explore **${related[0].title}** to follow the connection.` : 'Open the linked note to explore its sources and add your own thinking.'}\n\n*This demo assembles saved notes to preview the chat experience. No language model is connected.*`
        : 'I couldn’t find a matching note in this demo workspace. Try asking about retrieval, embeddings, attention, or your knowledge garden.\n\n*This is a simulated response. No language model is connected.*';
      const answer = {
        id: uid(),
        role: 'assistant' as const,
        content: '',
        documentIds: primary ? [primary.id, ...related.map((d) => d.id)] : [],
        status: 'streaming' as const,
        createdAt: now(),
      };
      sending = true;
      data.messages.push(
        {
          id: uid(),
          role: 'user',
          content: question,
          documentIds: [],
          status: 'complete',
          createdAt: now(),
        },
        answer,
      );
      try {
        commit();
        for (let i = 0; i < text.length; i += 28) {
          if (signal.aborted) break;
          const message = data.messages.find((m) => m.id === answer.id);
          if (!message) break;
          message.content += text.slice(i, i + 28);
          notify();
          await delay(24);
        }
      } finally {
        const message = data.messages.find((m) => m.id === answer.id);
        if (message) message.status = signal.aborted ? 'stopped' : 'complete';
        sending = false;
        commit();
      }
    },
    async clearMessages() {
      if (sending) throw new Error('Stop the current answer before starting a new chat.');
      data.messages = [];
      commit();
    },
    async updateSettings(patch) {
      data.settings = { ...data.settings, ...patch };
      commit();
    },
  };
  data.sources
    .filter((s) => s.status === 'queued' || s.status === 'extracting')
    .forEach((s) => void processSource(s.id));
  return client;
}
