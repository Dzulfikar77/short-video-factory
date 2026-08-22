#!/usr/bin/env node
/**
 * 1. Set the FFMPEG_BINARIES_URL environment variable
 * 2. Rebuild for x64 / arm64 architectures separately
 * 3. Merge both into a universal binary using lipo
 */
const { execSync } = require('child_process')
const path = require('path')

// 1. Environment variable
const FFMPEG_BINARIES_URL = process.env['npm_config_ffmpeg_binaries_url']

// 2. Utility: run a command with colored output
function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit', shell: true, ...opts })
  } catch (e) {
    console.error(`❌ Command failed: ${cmd}`)
    process.exit(1)
  }
}

// 3. Get to work
const archs = ['x64', 'arm64']
const ffmpegStaticDir = path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static')

// Remove the existing binary
run('rm -f ffmpeg', { cwd: ffmpegStaticDir })

// Fetch binaries for both architectures
archs.forEach((arch) => {
  run(
    `pnpm cross-env FFMPEG_BINARIES_URL=${FFMPEG_BINARIES_URL} npm_config_arch=${arch} npm run install`,
    {
      cwd: ffmpegStaticDir,
    },
  )
  run(`mv ${ffmpegStaticDir}/ffmpeg ${ffmpegStaticDir}/ffmpeg-${arch}`)
})

// Merge
run('lipo -create ffmpeg-arm64 ffmpeg-x64 -output ffmpeg', { cwd: ffmpegStaticDir })

// Make executable
run('chmod 0755 ffmpeg', { cwd: ffmpegStaticDir })

console.log('\n✅ Universal ffmpeg generated:', path.join(ffmpegStaticDir, 'ffmpeg'))
