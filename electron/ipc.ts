import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import {
  ListFilesFromFolderParams,
  OpenExternalParams,
  SelectFolderParams,
  StatEventParams,
} from './types'
import { edgeTtsGetVoiceList, edgeTtsSynthesizeToBase64, edgeTtsSynthesizeToFile } from './tts'
import { renderVideo } from './ffmpeg'
import { sendStatEvent } from './lib/stat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let windowMaximizedByApp = false

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] to avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

function canUsePath(folderPath?: string | null) {
  if (!folderPath) {
    return false
  }

  try {
    fs.accessSync(folderPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function tryGetElectronPath(name: Parameters<typeof app.getPath>[0]) {
  try {
    return app.getPath(name)
  } catch (error: any) {
    console.warn(`[select-folder] getPath(${name}) failed:`, error?.message ?? String(error))
    return null
  }
}

function resolveDefaultFolderPath(customPath?: string | null) {
  if (canUsePath(customPath)) {
    return customPath!
  }

  const fallbackPathKeys: Parameters<typeof app.getPath>[0][] = [
    'downloads',
    'desktop',
    'documents',
    'home',
  ]

  for (const key of fallbackPathKeys) {
    const folderPath = tryGetElectronPath(key)
    if (canUsePath(folderPath)) {
      return folderPath
    }
  }

  if (canUsePath(process.cwd())) {
    return process.cwd()
  }

  return null
}

export default function initIPC() {
  // SQLite query
  ipcMain.handle('sqlite-query', (_event, params) => sqQuery(params))
  // SQLite insert
  ipcMain.handle('sqlite-insert', (_event, params) => sqInsert(params))
  // SQLite update
  ipcMain.handle('sqlite-update', (_event, params) => sqUpdate(params))
  // SQLite delete
  ipcMain.handle('sqlite-delete', (_event, params) => sqDelete(params))
  // SQLite bulk insert or update
  ipcMain.handle('sqlite-bulk-insert-or-update', (_event, params) => sqBulkInsertOrUpdate(params))

  // Check if window is maximized
  ipcMain.handle('is-win-maxed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return Boolean(win?.isMaximized() || windowMaximizedByApp)
  })
  // Minimize window
  ipcMain.on('win-min', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  // Maximize window
  ipcMain.on('win-max', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized() || windowMaximizedByApp) {
      win?.restore()
      windowMaximizedByApp = false
    } else {
      win?.maximize()
      windowMaximizedByApp = true
    }
  })
  // Toggle window maximize/restore
  ipcMain.on('toggle-window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    if (win.isMaximized() || windowMaximizedByApp) {
      win.restore()
      windowMaximizedByApp = false
    } else {
      win.maximize()
      windowMaximizedByApp = true
    }
  })
  // Prepare window state for drag: restore if maximized, then return restored bounds
  ipcMain.handle('prepare-window-drag', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const wasMaximized = win.isMaximized() || windowMaximizedByApp
    if (wasMaximized) {
      win.restore()
      windowMaximizedByApp = false
    }

    return {
      bounds: win.getBounds(),
      wasMaximized,
    }
  })
  // Get window bounds
  ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.getBounds()
  })
  // Set window position
  ipcMain.on('set-window-position', (event, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setPosition(Math.round(x), Math.round(y))
  })
  // Close window
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // Set zoom factor
  ipcMain.on('set-zoom-factor', (event, factor: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.webContents.setZoomFactor(factor)
  })

  // Open external link
  ipcMain.handle('open-external', (_event, params: OpenExternalParams) => {
    shell.openExternal(params.url)
  })

  // Select folder
  ipcMain.handle('select-folder', async (event, params?: SelectFolderParams) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error('Unable to get window')
    }

    const defaultPath = resolveDefaultFolderPath(params?.defaultPath)

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: params?.title || 'Select Folder',
    }

    if (defaultPath) {
      dialogOptions.defaultPath = defaultPath
    } else {
      console.warn('[select-folder] all fallback defaultPath attempts unavailable')
    }

    const result = await dialog.showOpenDialog(win, dialogOptions)
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0] // Return absolute path
    }
    return null
  })

  // Get list of files from folder
  ipcMain.handle('list-files-from-folder', async (_event, params: ListFilesFromFolderParams) => {
    const files = await fs.promises.readdir(params.folderPath, { withFileTypes: true })
    return files
      .filter((file) => file.isFile())
      .map((file) => ({
        name: file.name,
        path: path.join(params.folderPath, file.name).replace(/\\/g, '/'),
      }))
  })

  // Get EdgeTTS voice list
  ipcMain.handle('edge-tts-get-voice-list', () => edgeTtsGetVoiceList())

  // Track statistics event
  ipcMain.handle('stat-track', (_event, params: StatEventParams) => sendStatEvent(params))

  // Speech synthesis and get Base64
  ipcMain.handle('edge-tts-synthesize-to-base64', (_event, params) =>
    edgeTtsSynthesizeToBase64(params),
  )

  // Save speech synthesis to file
  ipcMain.handle('edge-tts-synthesize-to-file', (_event, params) => edgeTtsSynthesizeToFile(params))

  // Render video
  ipcMain.handle('render-video', (_event, params) => {
    // Progress callback
    const onProgress = (progress: number) => {
      _event.sender.send('render-video-progress', progress)
    }

    // Create AbortController
    const controller = new AbortController()
    // Listen for cancel event
    ipcMain.once('cancel-render-video', () => {
      controller.abort()
    })

    return renderVideo({ ...params, onProgress, abortSignal: controller.signal })
  })
}
