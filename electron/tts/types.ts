import { SynthesisOptions } from '../lib/edge-tts'

export interface EdgeTtsSynthesizeCommonParams {
  text: string
  voice: string
  options: SynthesisOptions
}

export interface EdgeTtsSynthesizeToFileParams extends EdgeTtsSynthesizeCommonParams {
  withCaption?: boolean
  outputPath?: string
}

export interface EdgeTtsSynthesizeToFileResult {
  /**
   * Synthesized audio duration in seconds
   */
  duration: number | undefined
}
