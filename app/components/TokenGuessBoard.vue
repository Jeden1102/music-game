<script setup lang="ts">
import type {
  RoomPlayer,
  RoundPhase,
  RoundTokenDuel,
  RoundTokenPlacement,
  RoundTokenResult
} from '#shared/types/room'
import { getPlayerInitials } from '#shared/utils/player'

const props = defineProps<{
  roundId: string
  player: RoomPlayer
  placements: RoundTokenPlacement[]
  duels: RoundTokenDuel[]
  results: RoundTokenResult[]
  selfPlayerId: string | null
  selfTokens: number
  canPlace: boolean
  phase: RoundPhase
  pending: boolean
}>()

const emit = defineEmits<{
  place: [position: number]
  guess: []
}>()

const { t } = useI18n()
const selectedPosition = ref<number | null>(null)

const positions = computed(() => {
  return Array.from(
    { length: props.player.timeline.length + 1 },
    (_, index) => index
  )
})
const selfPlacement = computed(() => {
  return props.placements.find(item => item.playerId === props.selfPlayerId) ?? null
})
const selfNeedsYear = computed(() => {
  const placement = selfPlacement.value

  if (!placement || placement.yearGuessSubmitted) {
    return false
  }

  return props.placements.filter(item => item.position === placement.position).length > 1
})
const pendingDuelNames = computed(() => {
  const byPosition = new Map<number, RoundTokenPlacement[]>()

  for (const placement of props.placements) {
    const items = byPosition.get(placement.position) ?? []
    items.push(placement)
    byPosition.set(placement.position, items)
  }

  return [...byPosition.values()]
    .filter(items => items.length > 1 && items.some(item => !item.yearGuessSubmitted))
    .flatMap(items => items.filter(item => !item.yearGuessSubmitted))
    .map(item => item.playerName)
    .filter((name, index, names) => names.indexOf(name) === index)
})
const visible = computed(() => {
  return props.phase === 'listening'
    || props.placements.length > 0
    || props.results.length > 0
})
const hint = computed(() => {
  if (props.phase !== 'listening') {
    return t('room.tokenBoardRevealedHint')
  }

  if (props.canPlace) {
    return t('room.tokenBoardHint', { count: props.selfTokens })
  }

  if (selfPlacement.value) {
    return t('room.tokenBoardPlaced', {
      position: selfPlacement.value.position + 1
    })
  }

  if (props.selfPlayerId === props.player.id) {
    return t('room.tokenBoardActivePlayerHint')
  }

  return t('room.tokenBoardNoTokens')
})

function placementsAt(position: number) {
  return props.placements.filter(item => item.position === position)
}

function canChoose(_position: number) {
  return props.canPlace
    && !selfPlacement.value
    && !props.pending
}

function choosePosition(position: number) {
  if (!canChoose(position)) {
    return
  }

  selectedPosition.value = position
}

function confirmPlacement() {
  if (selectedPosition.value === null || !props.canPlace || props.pending) {
    return
  }

  emit('place', selectedPosition.value)
  selectedPosition.value = null
}

function resultLabel(result: RoundTokenResult) {
  if (result.cardWon && result.tokenWon) {
    return t('room.tokenResultCardAndToken', { name: result.playerName })
  }

  if (result.cardWon) {
    return t('room.tokenResultCard', { name: result.playerName })
  }

  if (result.tokenWon) {
    return t('room.tokenResultToken', { name: result.playerName })
  }

  return t('room.tokenResultLost', { name: result.playerName })
}

watch(
  () => props.roundId,
  () => {
    selectedPosition.value = null
  }
)
</script>

<template>
  <UCard
    v-if="visible"
    :ui="{ body: 'p-4 sm:p-5' }"
  >
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black text-highlighted">
            {{ t('room.tokenBoardTitle', { name: player.name }) }}
          </p>
          <p class="mt-0.5 text-xs font-semibold text-muted">
            {{ hint }}
          </p>
        </div>
        <UBadge
          :label="t('room.tokenBoardTokenCount', { count: selfTokens })"
          icon="i-lucide-ticket"
          color="primary"
          variant="subtle"
        />
      </div>
    </template>

    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="position in positions"
        :key="position"
        type="button"
        class="flex min-h-16 flex-col items-start justify-between rounded-lg border-2 px-3 py-2 text-left transition"
        :class="[
          selectedPosition === position
            ? 'border-brand-500 bg-brand-500/15'
            : 'border-default bg-elevated',
          canChoose(position) ? 'hover:border-brand-500/70' : 'cursor-default'
        ]"
        :disabled="!canChoose(position)"
        :title="t('room.tokenBoardSlot', { position: position + 1 })"
        @click="choosePosition(position)"
      >
        <span class="text-[11px] font-black uppercase tracking-wide text-muted">
          {{ t('room.tokenBoardSlot', { position: position + 1 }) }}
        </span>

        <span class="mt-2 flex flex-wrap items-center gap-1">
          <span
            v-for="placement in placementsAt(position)"
            :key="placement.playerId"
            class="flex items-center gap-1 rounded-full bg-brand-500 py-0.5 pl-0.5 pr-2 text-[10px] font-black text-white"
            :title="placement.playerName"
          >
            <span
              class="flex size-5 items-center justify-center rounded-full bg-white/20 text-[9px]"
            >
              {{ getPlayerInitials(placement.playerName) }}
            </span>
            <UIcon
              v-if="placement.playerId === selfPlayerId"
              name="i-lucide-check"
              class="size-3"
            />
          </span>
          <span
            v-if="placementsAt(position).length === 0"
            class="text-[11px] font-semibold text-muted"
          >
            —
          </span>
        </span>
      </button>
    </div>

    <div
      v-if="pendingDuelNames.length > 0"
      class="mt-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-bold text-warning"
    >
      {{ t('room.tokenBoardPendingYears', { names: pendingDuelNames.join(', ') }) }}
    </div>

    <div
      v-if="phase !== 'listening' && results.length > 0"
      class="mt-4 space-y-2 border-t border-default pt-4"
    >
      <p class="text-xs font-black uppercase tracking-wide text-muted">
        {{ t('room.tokenResultsTitle') }}
      </p>
      <p
        v-for="result in results"
        :key="result.playerId"
        class="text-sm font-semibold text-highlighted"
      >
        {{ resultLabel(result) }}
        <span class="text-xs text-muted">
          {{ t('room.tokenBoardSlot', { position: result.position + 1 }) }}
        </span>
      </p>

      <div
        v-for="duel in duels"
        :key="`duel-${duel.position}`"
        class="rounded-md bg-muted/50 px-3 py-2 text-xs font-semibold text-muted"
      >
        {{
          t('room.tokenDuelSummary', {
            position: duel.position + 1,
            name: duel.winnerName,
            guesses: duel.guesses.map(guess => `${guess.playerName}: ${guess.year}`).join(', ')
          })
        }}
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs font-semibold text-muted">
          <template v-if="selfPlacement">
            {{ t('room.tokenBoardPlaced', { position: selfPlacement.position + 1 }) }}
          </template>
          <template v-else-if="phase === 'listening'">
            {{ t('room.tokenBoardSpendHint') }}
          </template>
        </p>

        <UButton
          v-if="selfNeedsYear && phase === 'listening'"
          :label="t('room.tokenBoardEnterYear')"
          icon="i-lucide-swords"
          color="warning"
          @click="emit('guess')"
        />

        <UButton
          v-if="canPlace"
          :label="t('room.tokenBoardPlace')"
          icon="i-lucide-ticket"
          :disabled="selectedPosition === null || pending"
          :loading="pending"
          @click="confirmPlacement"
        />
      </div>
    </template>
  </UCard>
</template>
