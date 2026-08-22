import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * Generate a unique filename for handling file already exists situations
 */
export function generateUniqueFileName(filePath: string): string {
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const baseName = path.basename(filePath, ext)
  let counter = 1
  let newPath = filePath

  while (fs.existsSync(newPath)) {
    newPath = path.join(dir, `${baseName}(${counter})${ext}`)
    counter++
  }
  return newPath
}

/**
 * Get the app's temporary file storage path
 */
export function getAppTempPath() {
  return path.join(app.getPath('temp'), app.name).replace(/\\/g, '/')
}
