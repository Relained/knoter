import type { KnoterClient, WorkspaceSnapshot } from '@knoter/contracts';
import type { Command, NativeBridge, WorkerInfo } from '@knoter/contracts/native';
declare global {
  interface Window {
    knoterNative?: NativeBridge;
  }
}
const empty: WorkspaceSnapshot = {
  documents: [],
  trashedDocuments: [],
  sources: [],
  tasks: [],
  events: [],
  revisions: [],
  activities: [],
  messages: [],
  settings: { theme: 'light', workerPaused: false },
};
const offlineWorker: WorkerInfo = {
  connected: false,
  pid: 0,
  cursor: 0,
  lastTick: null,
  nextTick: 0,
  cli: {
    path: '',
    version: '',
    status: 'unknown',
    message: 'Enable the background service to connect Codex.',
  },
  model: 'gpt-5.6-luna',
  skillHash: '',
  callsToday: 0,
  dailyLimit: 20,
  resetsAt: '',
  timezone: '',
  jobs: [],
  watches: [],
  proposals: [],
};
export function createConnectedClient(bridge: NativeBridge): KnoterClient {
  let last = empty;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  const notify = () => listeners.forEach((l) => l());
  const invoke = async (command: Command, payload: unknown = {}) => {
    const value = await bridge.request(command, payload);
    notify();
    return value;
  };
  const mutation = async (command: Command, payload: unknown = {}) => {
    await invoke(command, payload);
  };
  const unavailable = async () => {
    throw new Error('This feature is outside the connected wiki-worker demo.');
  };
  return {
    mode: 'connected',
    async getSnapshot() {
      try {
        const value = (await bridge.request('snapshot', {})) as WorkspaceSnapshot;
        if (
          !Array.isArray(value.documents) ||
          !Array.isArray(value.sources) ||
          !value.worker?.connected
        )
          throw new Error('Invalid service snapshot.');
        last = value;
        return value;
      } catch (error) {
        return {
          ...last,
          worker: { ...(last.worker ?? offlineWorker), connected: false, error: String(error) },
        };
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!timer) timer = setInterval(notify, 2000);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    async desktop(action) {
      const result = await bridge.desktop(action);
      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        ['enable', 'disable', 'restart', 'status', 'approvalSettings'].includes(action)
      )
        last = {
          ...last,
          worker: { ...(last.worker ?? offlineWorker), registered: String(result.status) },
        };
      notify();
      return result;
    },
    saveDocument: (input) => mutation('saveDocument', input),
    createDocument: async () => (await invoke('createDocument')) as string,
    deleteDocument: (id) => mutation('deleteDocument', { id }),
    restoreDocument: (id) => mutation('restoreDocument', { id }),
    toggleFavorite: (id) => mutation('toggleFavorite', { id }),
    restoreRevision: (id) => mutation('restoreRevision', { id }),
    importSources: async () => {
      await bridge.desktop('importMarkdown');
      notify();
    },
    retrySource: (id) => mutation('retrySource', { id }),
    runWorker: () => mutation('runNow'),
    cancelJob: (id) => mutation('cancelJob', { id }),
    resolveProposal: (id, accept) => mutation('resolveProposal', { id, accept }),
    readReferenceVersion: async (id) =>
      (await bridge.request('referenceVersion', { id })) as Awaited<
        ReturnType<NonNullable<KnoterClient['readReferenceVersion']>>
      >,
    readSourceVersion: async (id) =>
      (await bridge.request('sourceVersion', { id })) as Awaited<
        ReturnType<NonNullable<KnoterClient['readSourceVersion']>>
      >,
    updateSettings: (input) => mutation('updateSettings', input),
    createTask: unavailable,
    updateTask: unavailable,
    saveEvent: unavailable,
    deleteEvent: unavailable,
    sendMessage: unavailable,
    clearMessages: unavailable,
  };
}
