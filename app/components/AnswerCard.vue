<script setup lang="ts">
import type { Song } from '~/types/song'
import { CLIP_SECONDS } from '~/utils/game'

defineProps<{
  song: Song | null
  revealed: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-semibold text-highlighted">
          {{ t('play.answer') }}
        </h2>

        <UBadge
          v-if="revealed && song"
          :label="song.category.name"
          color="neutral"
          variant="subtle"
        />
      </div>
    </template>

    <div
      v-if="!song"
      class="py-6 text-center text-sm text-muted"
    >
      {{ t('play.emptyAnswer') }}
    </div>

    <div
      v-else-if="!revealed"
      class="flex flex-col items-center gap-2 py-6 text-center"
    >
      <UIcon
        name="i-lucide-headphones"
        class="size-10 text-muted"
      />
      <p class="max-w-sm text-sm text-muted">
        {{ t('play.listenHint', { seconds: CLIP_SECONDS }) }}
      </p>
    </div>

    <div
      v-else
      class="flex flex-col items-center gap-1 py-4 text-center"
    >
      <p class="text-2xl font-bold text-highlighted">
        {{ song.title }}
      </p>
      <p class="text-lg text-muted">
        {{ song.artist }}
      </p>
      <UBadge
        :label="String(song.releaseYear)"
        color="primary"
        variant="solid"
        size="lg"
        class="mt-3"
      />
    </div>
  </UCard>
</template>
