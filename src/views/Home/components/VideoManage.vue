<template>
  <div class="w-full h-full">
    <v-form class="w-full h-full" :disabled="disabled">
      <v-sheet class="h-full p-2 flex flex-col" border rounded>
        <div class="flex gap-2 mb-2">
          <v-text-field
            v-model="appStore.videoAssetsFolder"
            :label="t('features.assets.config.folderLabel')"
            density="compact"
            hide-details
            readonly
          >
          </v-text-field>
          <v-btn
            class="mt-[2px]"
            prepend-icon="mdi-folder-open"
            :disabled="disabled"
            @click="handleSelectFolder"
          >
            {{ t('common.buttons.selectFolder') }}
          </v-btn>
        </div>

        <div class="flex-1 h-0 w-full border">
          <div
            v-if="videoAssets.length"
            class="w-full max-h-full overflow-y-auto grid grid-cols-3 gap-2 p-2"
          >
            <div
              class="w-full h-full max-h-[200px]"
              v-for="(item, index) in videoAssets"
              :key="index"
            >
              <VideoAutoPreview :asset="item" />
            </div>
          </div>
          <v-empty-state
            v-else
            :headline="t('emptyStates.noContent')"
            :text="t('emptyStates.hintSelectFolder')"
          ></v-empty-state>
        </div>

        <div class="my-2">
          <v-btn
            block
            prepend-icon="mdi-refresh"
            :disabled="disabled || !appStore.videoAssetsFolder"
            :loading="refreshAssetsLoading"
            @click="refreshAssets"
          >
            {{ t('common.buttons.refreshAssets') }}
          </v-btn>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { h, onMounted, ref, toRaw } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { ListFilesFromFolderRecord } from '~/electron/types'
import { RenderVideoParams } from '~/electron/ffmpeg/types'
import VideoAutoPreview from '@/components/VideoAutoPreview.vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import random from 'random'
import { formatErrorForCopy } from '@/lib/error-copy'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

defineProps<{
  disabled?: boolean
}>()

// Select folder
const handleSelectFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectAssetsFolder'),
    defaultPath: appStore.videoAssetsFolder,
  })
  console.log('User selected storyboard assets folder, absolute path:', folderPath)
  if (folderPath) {
    appStore.videoAssetsFolder = folderPath
    refreshAssets()
  }
}

// Refresh asset library
const videoAssets = ref<ListFilesFromFolderRecord[]>([])
const videoDurationCache = ref(new Map<string, number>())
const refreshAssetsLoading = ref(false)
const refreshAssets = async () => {
  if (!appStore.videoAssetsFolder) {
    return
  }
  refreshAssetsLoading.value = true
  try {
    const assets = await window.electron.listFilesFromFolder({
      folderPath: appStore.videoAssetsFolder,
    })
    console.log(`Asset library refreshed:`, assets)
    videoAssets.value = assets.filter((asset) => asset.name.toLowerCase().endsWith('.mp4'))
    videoDurationCache.value.clear()
    if (!videoAssets.value.length) {
      if (assets.length) {
        toast.warning(t('features.assets.errors.noMp4InFolder'))
      } else {
        toast.warning(t('emptyStates.assetsFolderEmpty'))
      }
    } else {
      toast.success(t('features.assets.success.loadSucceeded'))
    }
  } catch (error: any) {
    console.dir(error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // Create custom error toast instance using vnode method for better type hints
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.assets.errors.loadFailed'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(t('features.assets.errors.loadFailed'), String(errorMessage)),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
  } finally {
    refreshAssetsLoading.value = false
  }
}
onMounted(() => {
  refreshAssets()
})

const readVideoDuration = (assetPath: string) => {
  const cached = videoDurationCache.value.get(assetPath)
  if (typeof cached === 'number' && Number.isFinite(cached) && cached > 0) {
    return Promise.resolve(cached)
  }

  return new Promise<number>((resolve, reject) => {
    const video = document.createElement('video')
    const normalizedPath = assetPath.replace(/\\/g, '/')
    const src = normalizedPath.startsWith('/')
      ? `file://${normalizedPath}`
      : `file:///${normalizedPath}`
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Video metadata read timeout'))
    }, 8000)

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const onLoaded = () => {
      const duration = video.duration
      cleanup()
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error('Invalid video duration'))
        return
      }
      videoDurationCache.value.set(assetPath, duration)
      resolve(duration)
    }

    const onError = () => {
      cleanup()
      reject(new Error('Failed to read video metadata'))
    }

    video.preload = 'metadata'
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
    video.src = encodeURI(src)
  })
}

// Get random storyboard asset segments
const getVideoSegments = async (options: { duration: number }) => {
  if (options.duration <= 0) {
    throw new Error(t('features.assets.errors.audioDurationInvalid'))
  }

  if (!videoAssets.value.length) {
    throw new Error(t('features.assets.errors.noVideoAssets'))
  }

  // Collect random asset segments
  const segments: Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'> = {
    videoFiles: [],
    timeRanges: [],
  }
  const minSegmentDuration = 2
  const maxSegmentDuration = 15

  let currentTotalDuration = 0
  let tempVideoAssets = structuredClone(toRaw(videoAssets.value))
  const trunc3 = (n: number) => ((n * 1e3) << 0) / 1e3
  let attempts = 0
  const maxAttempts = Math.max(videoAssets.value.length * 6, 60)

  while (currentTotalDuration < options.duration) {
    if (attempts > maxAttempts) {
      throw new Error(t('features.assets.errors.durationInsufficient'))
    }

    // If no remaining assets in library and duration insufficient, restart round
    if (tempVideoAssets.length === 0) {
      tempVideoAssets = structuredClone(toRaw(videoAssets.value))
      continue
    }

    // Get a random asset and related information
    const randomAsset = random.choice(tempVideoAssets)!
    const randomAssetIndex = tempVideoAssets.findIndex((asset) => asset.path === randomAsset.path)
    if (randomAssetIndex < 0) {
      attempts += 1
      continue
    }

    // Remove selected asset
    tempVideoAssets.splice(randomAssetIndex, 1)

    attempts += 1

    let randomAssetDuration = 0
    try {
      randomAssetDuration = await readVideoDuration(randomAsset.path)
    } catch (error) {
      console.warn('Failed to read asset duration, skipping this asset:', randomAsset.path, error)
      continue
    }

    if (!Number.isFinite(randomAssetDuration) || randomAssetDuration <= 0) {
      continue
    }

    // If asset duration is less than minimum segment duration, add directly
    if (randomAssetDuration < minSegmentDuration) {
      segments.videoFiles.push(randomAsset.path)
      segments.timeRanges.push([String(0), String(trunc3(randomAssetDuration))])
      currentTotalDuration = trunc3(currentTotalDuration + randomAssetDuration)
      continue
    }

    // If asset duration is greater than minimum segment duration, randomize a segment
    let randomSegmentDuration = random.float(
      minSegmentDuration,
      Math.min(maxSegmentDuration, randomAssetDuration),
    )

    // Handle case where last segment duration exceeds planned duration
    if (currentTotalDuration + randomSegmentDuration > options.duration) {
      randomSegmentDuration = options.duration - currentTotalDuration
    }

    // Handle case where last segment duration is less than minimum segment duration
    if (options.duration - currentTotalDuration - randomSegmentDuration < minSegmentDuration) {
      if (options.duration - currentTotalDuration < randomAssetDuration) {
        randomSegmentDuration = options.duration - currentTotalDuration
      }
    }

    const randomSegmentStart = random.float(0, randomAssetDuration - randomSegmentDuration)

    segments.videoFiles.push(randomAsset.path)
    segments.timeRanges.push([
      String(trunc3(randomSegmentStart)),
      String(trunc3(randomSegmentStart + randomSegmentDuration)),
    ])
    currentTotalDuration = trunc3(currentTotalDuration + randomSegmentDuration)

    console.table([
      {
        'Asset Name': randomAsset.name,
        'Asset Duration': randomAssetDuration,
        'Segment Start': trunc3(randomSegmentStart),
        'Segment Duration': trunc3(randomSegmentDuration),
      },
    ])
  }

  console.log('Total duration of random asset segments:', currentTotalDuration)
  console.log('Random asset segments summary:', segments)

  return segments
}

defineExpose({ getVideoSegments })
</script>

<style lang="scss" scoped>
//
</style>
