<script setup lang="ts">
import type { RoomPlayer } from '#shared/types/room'
import { getPlayerInitials } from '#shared/utils/player'

defineProps<{
  player: RoomPlayer
  isCurrent: boolean
}>()

const emit = defineEmits<{
  openTimeline: []
  leave: []
}>()

const { t } = useI18n()
const touchStartY = ref<number | null>(null)

function handleTouchStart(event: TouchEvent) {
  touchStartY.value = event.changedTouches[0]?.clientY ?? null
}

function handleTouchEnd(event: TouchEvent) {
  const endY = event.changedTouches[0]?.clientY

  if (touchStartY.value !== null && endY !== undefined && touchStartY.value - endY > 45) {
    emit('openTimeline')
  }

  touchStartY.value = null
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-40 border-t border-default/80 bg-default/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(0,48,73,0.12)] backdrop-blur-xl">
    <div
      class="mx-auto flex max-w-5xl items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-5"
      @touchstart.passive="handleTouchStart"
      @touchend.passive="handleTouchEnd"
    >
      <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-xs font-black text-sun-400 dark:bg-sun-400 dark:text-navy-900">
        {{ getPlayerInitials(player.name) }}
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <p class="truncate text-sm font-black text-highlighted">
            {{ player.name }}
          </p>
          <UIcon
            v-if="player.isHost"
            name="i-lucide-crown"
            class="size-3.5 shrink-0 text-brand-500"
          />
          <span
            v-if="isCurrent"
            class="size-2 shrink-0 animate-pulse rounded-full bg-brand-500"
          />
        </div>
        <p
          class="mt-0.5 flex items-center gap-1 text-[11px] font-semibold"
          :class="isCurrent ? 'text-brand-600 dark:text-brand-300' : 'text-muted'"
        >
          <UIcon
            :name="isCurrent ? 'i-lucide-headphones' : 'i-lucide-chevron-up'"
            class="size-3"
          />
          {{ isCurrent ? t('room.yourTurnBottom') : t('room.swipeHint') }}
        </p>
      </div>

      <UButton
        :aria-label="t('room.leaveRoom')"
        :title="t('room.leaveRoom')"
        icon="i-lucide-log-out"
        color="error"
        variant="ghost"
        size="sm"
        @click="emit('leave')"
      />

      <UButton
        :label="t('room.myTimeline')"
        icon="i-lucide-disc-3"
        size="md"
        @click="emit('openTimeline')"
      />
    </div>
  </div>
</template>
