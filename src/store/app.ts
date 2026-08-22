import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { EdgeTTSVoice } from '~/electron/lib/edge-tts'

export enum RenderStatus {
  None,
  GenerateText,
  SynthesizedSpeech,
  SegmentVideo,
  Rendering,
  Completed,
  Failed,
}

export const useAppStore = defineStore(
  'app',
  () => {
    // Internationalization locale settings
    const locale = ref('')
    const updateLocale = (newLocale: string) => {
      locale.value = newLocale
    }

    // Large language model script generation
    const prompt = ref('')
    const llmConfig = ref({
      modelName: '',
      apiUrl: '',
      apiKey: '',
    })
    const updateLLMConfig = (newConfig: typeof llmConfig.value) => {
      llmConfig.value = newConfig
    }

    // Video asset management
    const videoAssetsFolder = ref('')
    const videoExportFolder = ref('')

    // Speech synthesis
    const originalVoicesList = ref<EdgeTTSVoice[]>([])
    const languageList = computed(() => {
      return originalVoicesList.value
        .map((voice) => voice.FriendlyName.split(' - ').pop()?.split(' (').shift())
        .filter((language) => !!language)
        .filter((language, index, arr) => arr.indexOf(language) === index)
    })
    const genderList = ref([
      { label: 'Male', value: 'Male' },
      { label: 'Female', value: 'Female' },
      // { label: 'Neutral', value: 'Neutral' },
    ])
    const speedList = ref([
      { label: 'Slow', value: -30 },
      { label: 'Medium', value: 0 },
      { label: 'Fast', value: 30 },
    ])
    const language = ref<string>()
    const gender = ref<string>()
    const voice = ref<EdgeTTSVoice | null>(null)
    const speed = ref(0)
    const tryListeningText = ref('Hello, welcome to Short Video Factory!')

    // Rendering configuration
    const renderConfig = ref({
      bgmPath: '',
      outputSize: { width: 1080, height: 1920 },
      outputPath: '',
      outputFileName: '',
      outputFileExt: '.mp4',
    })
    const autoBatch = ref(false)
    const renderStatus = ref(RenderStatus.None)
    const updateRenderConfig = (newConfig: typeof renderConfig.value) => {
      renderConfig.value = newConfig
    }
    const updateRenderStatus = (newStatus: RenderStatus) => {
      renderStatus.value = newStatus
    }

    // Zoom factor configuration
    const zoomOptions = [0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
    const zoomFactor = ref(1.0)
    const updateZoomFactor = (factor: number) => {
      zoomFactor.value = factor
    }

    return {
      locale,
      updateLocale,

      prompt,
      llmConfig,
      updateLLMConfig,

      videoAssetsFolder,
      videoExportFolder,

      originalVoicesList,
      languageList,
      genderList,
      speedList,
      language,
      gender,
      voice,
      speed,
      tryListeningText,

      renderConfig,
      autoBatch,
      renderStatus,
      updateRenderConfig,
      updateRenderStatus,

      zoomOptions,
      zoomFactor,
      updateZoomFactor,
    }
  },
  {
    persist: {
      omit: ['genderList', 'speedList', 'autoBatch', 'renderStatus'],
    },
  },
)
