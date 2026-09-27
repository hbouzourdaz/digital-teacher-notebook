import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENTS, createApi, type RawInvoker } from '../shared/ipc'

/**
 * الجسر الوحيد بين الـ renderer والعملية الرئيسية.
 * لا يُكشف أي شيء من fs أو better-sqlite3 أو child_process هنا.
 */

/** إزالة البادئة التقنية التي تضيفها Electron حتى تصل رسالة عربية نظيفة */
function cleanMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const marker = raw.lastIndexOf('Error: ')
  const message = marker >= 0 ? raw.slice(marker + 7) : raw
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').trim() || 'تعذر تنفيذ العملية.'
}

const invoke: RawInvoker = async (channel, payload) => {
  try {
    return await ipcRenderer.invoke(channel, payload)
  } catch (error) {
    throw new Error(cleanMessage(error))
  }
}

const api = createApi(invoke)

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('notebookEvents', {
  onReload: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IPC_EVENTS.reload, listener)
    return () => ipcRenderer.removeListener(IPC_EVENTS.reload, listener)
  }
})
