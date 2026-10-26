<script setup lang="ts">
import type { RoomPlayer } from '#shared/types/room'
import { getPlayerInitials } from '#shared/utils/player'

const props = defineProps<{
  player: RoomPlayer
  targetCards: number
  isCurrent?: boolean
  isSelf?: boolean
  /** The player may pick a slot for the drawn song right now. */
  placementActive?: boolean
  /** A slot was already confirmed and should stay visible on the axis. */
  submittedPosition?: number | null
  selectedPosition?: number | null
  placementPending?: boolean
  placementWaiting?: boolean
  hasClaimed?: boolean
}>()

const emit = defineEmits<{
  selectPosition: [position: number]
  confirmPlacement: []
}>()

const { t } = useI18n()

const progress = computed(() => {
  if (props.targetCards <= 0) {
    return 0
  }

  return Math.min(100, Math.round((props.player.timeline.length / props.targetCards) * 100))
})

const placementVisible = computed(() => {
  return Boolean(props.placementActive || props.placementWaiting) || props.submittedPosition !== null
})

const placementConfirmed = computed(() => props.submittedPosition !== null)
const canSelect = computed(() => Boolean(props.placementActive) && !placementConfirmed.value)
const activeSlot = computed(() => props.submittedPosition ?? props.selectedPosition ?? null)

const placementTitle = computed(() => {
  if (placementConfirmed.value) {
    return t('room.placementConfirmed')
  }

  if (props.isSelf) {
    return t('room.placeCardTitle')
  }

  return t('room.placeCardWaiting', { name: props.player.name })
})

const placementHint = computed(() => {
  if (placementConfirmed.value) {
    return t('room.placementConfirmedHint')
  }

  if (props.isSelf) {
    return t('room.placeCardHint')
  }

  return t('room.placeCardSpectatorHint', { name: props.player.name })
})

const accentClasses = [
  'bg-brand-500',
  'bg-sun-400',
  'bg-alert-500',
  'bg-navy-400'
]

function showSlot(index: number) {
  return Boolean(props.placementActive) || props.submittedPosition === index
}

function slotSelected(index: number) {
  return activeSlot.value === index
}

function slotLabel(index: number) {
  return t('room.placeSlotLabel', { position: index + 1 })
}

function chooseSlot(index: number) {
  if (!canSelect.value) {
    return
  }

  emit('selectPosition', index)
}
</script>

<template>
  <UCard
    :class="isCurrent ? 'ring-2 ring-brand-500/45' : ''"
    :ui="{ body: 'p-5 sm:p-6' }"
  >
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-sm font-black text-sun-400 shadow-md dark:bg-sun-400 dark:text-navy-900"
          :class="isCurrent ? 'ring-4 ring-brand-500/20' : ''"
        >
          {{ getPlayerInitials(player.name) }}
        </span>

        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <h2 class="truncate text-lg font-black tracking-tight text-highlighted">
              {{ player.name }}
            </h2>
            <UBadge
              v-if="isSelf"
              :label="t('room.youBadge')"
              color="primary"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="isCurrent"
              :label="t('room.guessingNowBadge')"
              icon="i-lucide-headphones"
              color="warning"
              variant="solid"
              size="sm"
            />
            <UBadge
              v-if="hasClaimed"
              :label="t('room.claimedBadge')"
              icon="i-lucide-hand"
              color="success"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-0.5 text-sm text-muted">
            {{ t('room.cardsProgress', { cards: player.timeline.length, target: targetCards }) }}
          </p>
        </div>
      </div>

      <div class="w-full max-w-44">
        <div class="mb-1.5 flex items-center justify-between text-xs font-bold text-muted">
          <span>{{ progress }}%</span>
          <span>{{ player.timeline.length }}/{{ targetCards }}</span>
        </div>
        <UProgress
          :model-value="progress"
          color="primary"
          size="sm"
        />
      </div>
    </div>

    <div
      v-if="placementVisible"
      class="mt-5 flex items-start gap-3 rounded-lg border-2 border-dashed px-4 py-3"
      :class="placementConfirmed
        ? 'border-success/40 bg-success/10'
        : 'border-brand-500/50 bg-brand-500/10'"
    >
      <span
        class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md"
        :class="placementConfirmed
          ? 'bg-success text-white'
          : 'bg-brand-500 text-white'"
      >
        <UIcon
          :name="placementConfirmed ? 'i-lucide-check' : 'i-lucide-mouse-pointer-click'"
          class="size-4"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-black text-highlighted">
          {{ placementTitle }}
        </p>
        <p class="mt-0.5 text-xs font-semibold text-muted">
          {{ placementHint }}
        </p>
      </div>
      <UBadge
        v-if="placementConfirmed && submittedPosition !== null"
        :label="t('room.placeSlotChosen', { position: (submittedPosition ?? 0) + 1 })"
        color="success"
        variant="solid"
        size="sm"
      />
    </div>

    <div
      v-if="player.timeline.length > 0 || placementVisible"
      class="mt-6"
    >
      <div class="overflow-x-auto pb-2">
        <div class="relative flex min-w-max items-stretch gap-2 sm:gap-3">
          <div class="pointer-events-none absolute left-4 right-4 top-1/2 h-px bg-gradient-to-r from-transparent via-cream-500/40 to-transparent" />

          <template
            v-for="(card, index) in player.timeline"
            :key="`${card.id}-${card.addedAt}`"
          >
            <button
              v-if="showSlot(index)"
              type="button"
              class="relative z-10 my-auto flex h-20 w-9 shrink-0 items-center justify-center rounded-md border-2 border-dashed transition"
              :class="slotSelected(index)
                ? 'border-brand-500 bg-brand-500 text-white shadow-lg'
                : canSelect
                  ? 'border-brand-500/60 bg-default text-brand-500 hover:scale-105 hover:border-brand-500 hover:bg-brand-500/10'
                  : 'border-default bg-default text-muted'"
              :disabled="!canSelect"
              :aria-label="slotLabel(index)"
              :title="slotLabel(index)"
              @click="chooseSlot(index)"
            >
              <UIcon
                :name="slotSelected(index) ? 'i-lucide-check' : 'i-lucide-plus'"
                class="size-4"
              />
            </button>

            <article
              class="group relative w-40 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-navy-800 via-navy-700 to-navy-600 p-4 text-cream-100 shadow-lg shadow-navy-900/20 transition duration-200 hover:-translate-y-0.5 hover:shadow-xl sm:w-44"
            >
              <span
                class="absolute inset-x-0 top-0 h-1"
                :class="accentClasses[index % accentClasses.length]"
              />
              <span
                v-if="isCurrent"
                class="absolute inset-x-0 bottom-0 h-1 bg-brand-500/70"
              />

              <div class="flex items-start justify-between gap-2">
                <span class="rounded-lg bg-sun-400 px-2 py-0.5 text-lg font-black leading-tight text-navy-900">
                  {{ card.releaseYear }}
                </span>
                <UIcon
                  name="i-lucide-disc-3"
                  class="mt-1 size-4 text-cream-200/50"
                />
              </div>

              <p class="mt-6 line-clamp-2 min-h-10 text-sm font-black leading-tight">
                {{ card.title }}
              </p>
              <p class="mt-1 line-clamp-1 text-xs font-semibold uppercase tracking-wide text-cream-200/65">
                {{ card.artist }}
              </p>
            </article>
          </template>

          <button
            v-if="showSlot(player.timeline.length)"
            type="button"
            class="relative z-10 my-auto flex h-20 w-9 shrink-0 items-center justify-center rounded-md border-2 border-dashed transition"
            :class="slotSelected(player.timeline.length)
              ? 'border-brand-500 bg-brand-500 text-white shadow-lg'
              : canSelect
                ? 'border-brand-500/60 bg-default text-brand-500 hover:scale-105 hover:border-brand-500 hover:bg-brand-500/10'
                : 'border-default bg-default text-muted'"
            :disabled="!canSelect"
            :aria-label="slotLabel(player.timeline.length)"
            :title="slotLabel(player.timeline.length)"
            @click="chooseSlot(player.timeline.length)"
          >
            <UIcon
              :name="slotSelected(player.timeline.length) ? 'i-lucide-check' : 'i-lucide-plus'"
              class="size-4"
            />
          </button>
        </div>
      </div>

      <div
        v-if="isSelf && canSelect"
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-muted/40 p-3"
      >
        <p class="text-xs font-semibold text-muted">
          {{ selectedPosition !== null
            ? t('room.placeSelectHint', { position: (selectedPosition ?? 0) + 1 })
            : t('room.placeSelectEmpty') }}
        </p>
        <UButton
          :label="t('room.confirmPlacement')"
          icon="i-lucide-check"
          size="md"
          :disabled="selectedPosition === null"
          :loading="placementPending"
          @click="emit('confirmPlacement')"
        />
      </div>
    </div>

    <div
      v-else
      class="mt-6 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-default bg-muted/40 px-6 py-10 text-center"
    >
      <UIcon
        name="i-lucide-disc-album"
        class="size-9 text-muted"
      />
      <p class="font-bold text-highlighted">
        {{ t('room.emptyTimeline') }}
      </p>
      <p class="max-w-sm text-sm text-muted">
        {{ t('room.emptyTimelineHint') }}
      </p>
    </div>
  </UCard>
</template>
