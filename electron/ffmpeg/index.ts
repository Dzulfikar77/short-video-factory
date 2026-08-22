import fs from 'node:fs'
import os from 'os'
import { spawn } from 'child_process'
import { ExecuteFFmpegResult, RenderVideoParams } from './types'
import { getTempTtsVoiceFilePath } from '../tts'
import path from 'node:path'
import { generateUniqueFileName } from '../lib/tools'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isWindows = process.platform === 'win32'

const ffmpegPath: string = VITE_DEV_SERVER_URL
  ? require('ffmpeg-static')
  : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

// async function test() {
//   try {
//     const result = await executeFFmpeg(['-version'])
//     console.log(result.stdout)
//   } catch (error) {
//     console.log(error)
//   }
// }
// test()

export async function renderVideo(
  params: RenderVideoParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  try {
    // Destructure parameters
    const { videoFiles, timeRanges, outputSize, outputDuration, onProgress, abortSignal } = params

    // Audio default configuration
    const audioFiles = params.audioFiles ?? {}
    audioFiles.voice = params.audioFiles?.voice ?? getTempTtsVoiceFilePath()

    // Subtitle default configuration
    const subtitleFile =
      params.subtitleFile ??
      path
        .join(
          path.dirname(getTempTtsVoiceFilePath()),
          path.basename(getTempTtsVoiceFilePath(), '.mp3') + '.srt',
        )
        .replace(/\\/g, '/')

    // Output path default configuration
    if (!fs.existsSync(path.dirname(params.outputPath))) {
      throw new Error(`Output path does not exist`)
    }
    const outputPath = generateUniqueFileName(params.outputPath)

    // Build args command
    const args = []

    // Add all video inputs
    videoFiles.forEach((file) => {
      args.push('-i', `${file}`)
    })

    // Add audio inputs
    // Voice track
    args.push('-i', `${audioFiles.voice}`)

    // Background music (BGM)
    audioFiles?.bgm && args.push('-i', `${audioFiles.bgm}`)

    // Build complex filter
    const filters = []
    const videoStreams: string[] = []

    // Process each video clip
    videoFiles.forEach((_, index) => {
      const [start, end] = timeRanges[index]
      const streamLabel = `v${index}`
      videoStreams.push(streamLabel)

      // Use trim, setpts, scale, pad operations to process video
      filters.push(
        `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=decrease,pad=${outputSize.width}:${outputSize.height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[${streamLabel}]`,
      )
    })

    // Concatenate videos
    filters.push(`[${videoStreams.join('][')}]concat=n=${videoFiles.length}:v=1:a=0[vconcat]`)

    // Reset time base, frame rate, color space
    filters.push(`[vconcat]fps=30,format=yuv420p,setpts=PTS-STARTPTS[vout]`)

    // Add subtitles after video concatenation
    filters.push(`[vout]subtitles=${subtitleFile.replace(/\:/g, '\\\\:')}[with_subs]`)

    // Audio processing: use loudness normalization (loudnorm) to ensure volume balance
    const voiceStreamIdx = videoFiles.length
    const bgmStreamIdx = audioFiles?.bgm ? videoFiles.length + 1 : null

    if (outputDuration) {
      // Trim audio to target duration first, avoiding truncation caused by loudnorm
      const voiceLoudnorm = `loudnorm=I=-16:TP=-1.5:LRA=11`
      filters.push(`[${voiceStreamIdx}:a]${voiceLoudnorm}[voice_norm_raw]`)
      filters.push(
        `[voice_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[voice_normalized]`,
      )

      if (bgmStreamIdx !== null) {
        const bgmLoudnorm = `loudnorm=I=-25:TP=-1.5:LRA=11`
        // Normalize BGM first, then trim to target duration
        filters.push(`[${bgmStreamIdx}:a]${bgmLoudnorm}[bgm_norm_raw]`)
        filters.push(`[bgm_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[bgm_trimmed]`)
        // Use duration=first for mixing (voice as reference), and add dropout_transition=0
        filters.push(
          `[voice_normalized][bgm_trimmed]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
        )
      } else {
        filters.push(`[voice_normalized]acopy[final_audio]`)
      }
    } else {
      const voiceLoudnorm = `loudnorm=I=-16:TP=-1.5:LRA=11`
      filters.push(`[${voiceStreamIdx}:a]${voiceLoudnorm}[voice_normalized]`)

      if (bgmStreamIdx !== null) {
        const bgmLoudnorm = `loudnorm=I=-25:TP=-1.5:LRA=11`
        filters.push(`[${bgmStreamIdx}:a]${bgmLoudnorm}[bgm_normalized]`)
        filters.push(
          `[voice_normalized][bgm_normalized]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
        )
      } else {
        filters.push(`[voice_normalized]acopy[final_audio]`)
      }
    }

    // Set filter_complex
    args.push('-filter_complex', `${filters.join(';')}`)

    // Map output streams
    args.push('-map', '[with_subs]', '-map', '[final_audio]')

    // Encoding parameters
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-fps_mode',
      'cfr',
      '-s',
      `${outputSize.width}x${outputSize.height}`,
      '-progress',
      'pipe:1',
      ...(outputDuration ? ['-t', outputDuration] : []),
      '-stats',
      outputPath,
    )

    // Print command
    // console.log('Input params:', params)
    // console.log('Execute command:', args.join(' '))

    // Execute command
    const result = await executeFFmpeg(args, { onProgress, abortSignal })

    // Remove temporary files
    if (fs.existsSync(audioFiles.voice)) {
      fs.unlinkSync(audioFiles.voice)
    }
    if (fs.existsSync(subtitleFile)) {
      fs.unlinkSync(subtitleFile)
    }

    // Return result
    return result
  } catch (error) {
    throw error
  }
}

export async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  isWindows && validateExecutables()

  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    }

    const child = spawn(ffmpegPath, args, defaultOptions)

    let stdout = ''
    let stderr = ''
    let progress = 0

    child.stdout.on('data', (data) => {
      stdout += data.toString()
      // Process progress info
      progress = parseProgress(data.toString()) ?? 0
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      // Output progress info in real-time
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`))
    })

    // Provide cancellation functionality
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    }
  })
}

function validateExecutables() {
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`)
  }

  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK)
    } catch (error) {
      // Windows may not have X_OK permission flag
      if (os.platform() !== 'win32') {
      throw new Error('FFmpeg executables do not have execute permissions')
    }
  }
}

function parseProgress(stderrLine: string) {
  // Parse time info: frame=  123 fps= 45 q=25.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.5x
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseFloat(timeMatch[3])
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}
