export type View = 'wiki' | 'sources' | 'tasks' | 'calendar';
export type SourceStatus = 'queued' | 'extracting' | 'ready' | 'failed';
export interface WikiDocument {
  id: string;
  title: string;
  description: string;
  body: string;
  category: string;
  icon: 'book' | 'network' | 'brain' | 'flask' | 'leaf';
  sourceIds: string[];
  relatedIds: string[];
  favorite: boolean;
  revision: number;
  updatedAt: string;
  protected: boolean;
}
export interface Source {
  id: string;
  title: string;
  filename: string;
  type: 'pdf' | 'md' | 'txt';
  size: number;
  pages?: number;
  status: SourceStatus;
  addedAt: string;
  excerpt: string;
  documentIds: string[];
}
export interface Task {
  id: string;
  title: string;
  done: boolean;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  documentId?: string;
}
export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  color: 'green' | 'purple' | 'amber';
  description: string;
}
export interface Revision {
  id: string;
  documentId: string;
  revision: number;
  title: string;
  body: string;
  createdAt: string;
  author: 'You' | 'knoter';
  summary: string;
}
export interface Activity {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  kind: 'source' | 'document' | 'task' | 'event';
  documentId?: string;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  documentIds: string[];
  status: 'complete' | 'streaming' | 'stopped';
  createdAt: string;
}
export interface WorkspaceSnapshot {
  documents: WikiDocument[];
  sources: Source[];
  tasks: Task[];
  events: CalendarEvent[];
  revisions: Revision[];
  activities: Activity[];
  messages: ChatMessage[];
  settings: { theme: 'light' | 'dark'; workerPaused: boolean };
}
export interface SourceImport {
  filename: string;
  size: number;
  text?: string;
}
export interface KnoterClient {
  readonly mode: 'demo' | 'connected';
  getSnapshot(): Promise<WorkspaceSnapshot>;
  subscribe(listener: () => void): () => void;
  saveDocument(input: {
    id: string;
    title: string;
    body: string;
    baseRevision: number;
  }): Promise<void>;
  createDocument(): Promise<string>;
  toggleFavorite(id: string): Promise<void>;
  restoreRevision(id: string): Promise<void>;
  importSources(input: SourceImport[]): Promise<void>;
  retrySource(id: string): Promise<void>;
  createTask(input: Omit<Task, 'id' | 'done'>): Promise<void>;
  updateTask(
    id: string,
    patch: Partial<Pick<Task, 'done' | 'dueDate' | 'priority'>>,
  ): Promise<void>;
  saveEvent(input: Omit<CalendarEvent, 'id'> & { id?: string }): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  sendMessage(input: { question: string; documentId?: string; signal: AbortSignal }): Promise<void>;
  clearMessages(): Promise<void>;
  updateSettings(patch: Partial<WorkspaceSnapshot['settings']>): Promise<void>;
}
