<script setup lang="ts">
import { CLIP_SECONDS } from '~/utils/game'

const { t } = useI18n()

const {
  song,
  isLoading,
  isPreparing,
  isPlaying,
  revealed,
  secondsLeft,
  countdown,
  playerMount,
  progress,
  drawSong,
  replayClip
} = useSongGame()

const clipStatus = computed(() => {
  if (!song.value) {
    return ''
  }

  if (isPlaying.value) {
    return t('play.secondsLeft', { seconds: secondsLeft.value })
  }

  if (secondsLeft.value === 0) {
    return t('play.clipFinished')
  }

  return t('play.playClip')
})

const replayLabel = computed(() => {
  return secondsLeft.value === CLIP_SECONDS && !isPlaying.value
    ? t('play.playClip')
    : t('play.replayClip')
})

useSeoMeta({
  title: () => t('play.title'),
  description: () => t('play.subtitle')
})
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <div class="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeading
        :badge="t('play.badge')"
        :title="t('play.title')"
        :description="t('play.subtitle')"
      />

      <UCard :ui="{ body: 'p-0 sm:p-0', footer: 'px-4 py-3 sm:px-6' }">
        <div class="relative aspect-video w-full overflow-hidden bg-black">
          <div
            ref="playerMount"
            class="size-full"
          />

          <div
            v-if="!song"
            class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <UIcon
              name="i-lucide-music-4"
              class="size-12 text-white/40"
            />
            <p class="text-sm text-white/60">
              {{ t('play.playerPlaceholder') }}
            </p>
          </div>

          <div
            v-if="song && !revealed"
            class="absolute inset-0 z-10 flex items-center justify-center bg-black px-6 text-center"
          >
            <CountdownOverlay
              v-if="countdown !== null"
              :value="countdown ?? 0"
            />

            <div
              v-else-if="isPreparing"
              class="flex flex-col items-center gap-3 text-white"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-10 animate-spin"
              />
              <p class="text-sm">
                {{ t('play.preparing') }}
              </p>
            </div>

            <div
              v-else-if="!isPlaying"
              class="flex flex-col items-center gap-3 text-white"
            >
              <UIcon
                name="i-lucide-ear"
                class="size-10 text-white/70"
              />
              <p class="text-sm text-white/70">
                {{ t('play.autoplayHint') }}
              </p>
              <UButton
                :label="t('play.playClip')"
                icon="i-lucide-play"
                @click="replayClip"
              />
            </div>

            <div
              v-else
              class="flex flex-col items-center gap-3 text-white"
            >
              <UIcon
                name="i-lucide-audio-lines"
                class="size-10 animate-pulse text-primary"
              />
              <p class="text-sm text-white/80">
                {{ t('play.listen') }}
              </p>
            </div>
          </div>

          <div
            v-if="song && (isPlaying || revealed)"
            class="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white backdrop-blur"
          >
            <span
              class="size-2 rounded-full"
              :class="isPlaying ? 'animate-pulse bg-primary' : 'bg-white/40'"
            />
            {{ clipStatus }}
          </div>
        </div>

        <UProgress
          :model-value="progress"
          color="primary"
          size="xs"
        />

        <template #footer>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ t('play.clipHint', { seconds: CLIP_SECONDS }) }}
            </p>

            <UButton
              :label="replayLabel"
              :icon="secondsLeft === CLIP_SECONDS && !isPlaying ? 'i-lucide-play' : 'i-lucide-rotate-ccw'"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!song || isLoading || countdown !== null"
              @click="replayClip"
            />
          </div>
        </template>
      </UCard>

      <UButton
        :label="t('play.draw')"
        icon="i-lucide-shuffle"
        size="xl"
        block
        :loading="isLoading"
        @click="drawSong"
      />

      <AnswerCard
        :song="song"
        :revealed="revealed"
      />
    </div>
  </UContainer>
</template>
