export interface AudioVolumeConfig {
  voiceVolume?: string // Voice volume, e.g. "1.5" (multiplier) or "-3dB" (decibels)
  bgmVolume?: string // BGM volume, e.g. "0.5" (multiplier) or "-6dB" (decibels)
  targetLoudness?: string // Target loudness (LUFS), e.g. "-16" (YouTube recommended) or "-14" (Spotify recommended)
}

export interface RenderVideoParams {
  videoFiles: string[]
  timeRanges: [string, string][]
  audioFiles?: { voice?: string; bgm?: string }
  subtitleFile?: string
  outputSize: { width: number; height: number }
  outputPath: string
  outputDuration?: string
  audioVolume?: AudioVolumeConfig
}

export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}
