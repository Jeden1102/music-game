<script setup lang="ts">
import type { RoomPlayer } from '#shared/types/room'
import { getPlayerInitials } from '#shared/utils/player'

const props = defineProps<{
  player: RoomPlayer | null
  targetCards: number
  rank: number
  playersCount: number
}>()

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()

const progress = computed(() => {
  if (!props.player || props.targetCards <= 0) {
    return 0
  }

  return Math.min(100, Math.round((props.player.timeline.length / props.targetCards) * 100))
})

const tokenSlots = computed(() => {
  return Math.max(3, props.player?.tokens ?? 0)
})
</script>

<template>
  <UDrawer
    v-model:open="open"
    :title="t('room.myTimeline')"
    :description="player ? t('room.timelineDrawerHint') : undefined"
    :ui="{ content: 'max-h-[88vh]' }"
  >
    <template #body>
      <div
        v-if="!player"
        class="py-8 text-center text-sm text-muted"
      >
        {{ t('room.noPlayerState') }}
      </div>

      <div
        v-else
        class="space-y-6 pb-4"
      >
        <div class="flex items-center gap-3 rounded-lg bg-navy-800 p-4 text-cream-100">
          <span class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-sun-400 text-sm font-black text-navy-900">
            {{ getPlayerInitials(player.name) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-black">
                {{ player.name }}
              </p>
              <UBadge
                v-if="player.isHost"
                :label="t('room.host')"
                color="warning"
                variant="solid"
                size="sm"
              />
            </div>
            <p class="mt-0.5 text-xs font-semibold text-cream-200/70">
              {{ t('room.rankBadge', { rank, players: playersCount }) }}
            </p>
          </div>
          <span class="text-2xl font-black text-sun-400">
            {{ progress }}%
          </span>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-default bg-muted/45 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-muted">
              {{ t('room.cards') }}
            </p>
            <p class="mt-1 text-2xl font-black text-highlighted">
              {{ player.timeline.length }}
              <span class="text-base font-bold text-muted">/ {{ targetCards }}</span>
            </p>
            <UProgress
              class="mt-3"
              :model-value="progress"
              color="primary"
              size="xs"
            />
          </div>

          <div class="rounded-lg border border-default bg-muted/45 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-muted">
              {{ t('room.yourTokens') }}
            </p>
            <div class="mt-2 flex items-center gap-2">
              <span
                v-for="index in tokenSlots"
                :key="index"
                class="flex size-8 items-center justify-center rounded-full border text-xs font-black"
                :class="index <= player.tokens
                  ? 'border-brand-600 bg-brand-500 text-white shadow-sm'
                  : 'border-default bg-default text-muted'"
              >
                <UIcon
                  name="i-lucide-ticket"
                  class="size-4"
                />
              </span>
              <span class="ml-1 text-sm font-bold text-muted">
                ×{{ player.tokens }}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="font-black text-highlighted">
              {{ t('room.yourTimeline') }}
            </h3>
            <UBadge
              :label="t('room.cardsProgress', { cards: player.timeline.length, target: targetCards })"
              color="neutral"
              variant="subtle"
            />
          </div>

          <div
            v-if="player.timeline.length === 0"
            class="rounded-lg border border-dashed border-default bg-muted/35 px-5 py-8 text-center"
          >
            <UIcon
              name="i-lucide-disc-album"
              class="mx-auto size-8 text-muted"
            />
            <p class="mt-2 text-sm font-semibold text-muted">
              {{ t('room.emptyTimelineHint') }}
            </p>
          </div>

          <ol
            v-else
            class="relative ml-2 space-y-3 border-l-2 border-dashed border-default pl-5"
          >
            <li
              v-for="(card, index) in player.timeline"
              :key="`${card.id}-${card.addedAt}`"
              class="relative"
            >
              <span
                class="absolute -left-[29px] top-4 size-3 rounded-full border-2 border-default bg-brand-500"
                :class="index === player.timeline.length - 1 ? 'ring-4 ring-brand-500/15' : ''"
              />

              <div class="rounded-md border border-default bg-elevated p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate font-bold text-highlighted">
                      {{ card.title }}
                    </p>
                    <p class="truncate text-xs font-semibold text-muted">
                      {{ card.artist }}
                    </p>
                  </div>
                  <span class="shrink-0 rounded-lg bg-sun-400 px-2 py-0.5 text-sm font-black text-navy-900">
                    {{ card.releaseYear }}
                  </span>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
