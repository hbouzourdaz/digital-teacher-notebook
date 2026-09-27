import type { NotebookApi } from '@shared/ipc'

declare global {
  interface Window {
    api: NotebookApi
    notebookEvents: {
      onReload(callback: () => void): () => void
    }
  }
}

export {}
