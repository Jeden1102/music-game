<script setup lang="ts">
import jsQR from 'jsqr'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  detected: [value: string]
}>()

const { t } = useI18n()

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const errorKey = ref('')
const isStarting = ref(false)

const errorMessage = computed(() => errorKey.value ? t(errorKey.value) : '')

let stream: MediaStream | null = null
let frameId: number | null = null

function stopCamera() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId)
    frameId = null
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
}

function scanFrame() {
  if (!open.value) {
    return
  }

  const video = videoRef.value
  const canvas = canvasRef.value

  if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
    const width = video.videoWidth
    const height = video.videoHeight

    if (width > 0 && height > 0) {
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (context) {
        context.drawImage(video, 0, 0, width, height)
        const imageData = context.getImageData(0, 0, width, height)
        const code = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' })

        if (code?.data) {
          emit('detected', code.data)
          open.value = false
          return
        }
      }
    }
  }

  frameId = requestAnimationFrame(scanFrame)
}

async function startCamera() {
  stopCamera()
  errorKey.value = ''
  isStarting.value = true
  await nextTick()

  const video = videoRef.value

  if (!video) {
    isStarting.value = false
    return
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    isStarting.value = false
    errorKey.value = 'scanner.unsupported'
    return
  }

  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    })

    if (!open.value) {
      mediaStream.getTracks().forEach(track => track.stop())
      return
    }

    stream = mediaStream
    video.srcObject = mediaStream
    await video.play()
    isStarting.value = false
    scanFrame()
  } catch {
    isStarting.value = false
    stopCamera()
    errorKey.value = 'scanner.cameraError'
  }
}

function closeModal() {
  open.value = false
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await startCamera()
    return
  }

  isStarting.value = false
  stopCamera()
}, { flush: 'post' })

onBeforeUnmount(stopCamera)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('scanner.title')"
    :description="t('scanner.description')"
    :ui="{ body: 'p-4 sm:p-6' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UAlert
          v-if="errorKey"
          color="error"
          variant="subtle"
          :title="errorMessage"
        />

        <div
          v-if="errorKey"
          class="flex justify-center"
        >
          <UButton
            :label="t('scanner.retry')"
            icon="i-lucide-refresh-cw"
            @click="startCamera"
          />
        </div>

        <div
          v-else
          class="relative aspect-square overflow-hidden rounded-lg bg-black"
        >
          <video
            ref="videoRef"
            class="size-full object-cover"
            autoplay
            muted
            playsinline
          />
          <canvas
            ref="canvasRef"
            class="hidden"
          />

          <div class="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />

          <div
            v-if="isStarting"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-8 animate-spin"
            />
            <p class="text-sm">
              {{ t('scanner.starting') }}
            </p>
          </div>
        </div>

        <p class="text-center text-xs text-muted">
          {{ t('scanner.hint') }}
        </p>
      </div>
    </template>

    <template #footer>
      <UButton
        :label="t('scanner.cancel')"
        color="neutral"
        variant="ghost"
        @click="closeModal"
      />
    </template>
  </UModal>
</template>
