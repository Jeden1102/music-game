<script setup lang="ts">
import type { Room } from '#shared/types/room'
import { getPlayerInitials } from '#shared/utils/player'

const props = defineProps<{
  room: Room
  joinUrl: string
  isHost: boolean
  isStarting: boolean
  selfId?: string
}>()

const emit = defineEmits<{
  start: []
  copy: []
}>()

const { t } = useI18n()

const categoryLabel = computed(() => props.room.settings.categoryName ?? t('create.allCategories'))
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
    <div class="space-y-6">
      <UCard :ui="{ body: 'p-5 sm:p-7' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
                {{ t('room.lobbyBadge') }}
              </p>
              <h2 class="mt-1 text-2xl font-black tracking-tight text-highlighted">
                {{ t('room.lobbyTitle') }}
              </h2>
            </div>
            <UBadge
              :label="t('room.playersCount', { count: room.players.length, max: room.maxPlayers })"
              color="primary"
              variant="subtle"
              size="lg"
            />
          </div>
        </template>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg border border-default bg-muted/40 p-3">
            <UIcon
              name="i-lucide-timer"
              class="size-5 text-brand-500"
            />
            <p class="mt-2 text-lg font-black text-highlighted">
              {{ room.settings.clipSeconds }} s
            </p>
            <p class="text-xs font-semibold text-muted">
              {{ t('create.clipDuration') }}
            </p>
          </div>

          <div class="rounded-lg border border-default bg-muted/40 p-3">
            <UIcon
              name="i-lucide-tags"
              class="size-5 text-sun-500"
            />
            <p class="mt-2 truncate text-lg font-black text-highlighted">
              {{ categoryLabel }}
            </p>
            <p class="text-xs font-semibold text-muted">
              {{ t('create.category') }}
            </p>
          </div>

          <div class="rounded-lg border border-default bg-muted/40 p-3">
            <UIcon
              name="i-lucide-layers"
              class="size-5 text-alert-500"
            />
            <p class="mt-2 text-lg font-black text-highlighted">
              {{ room.settings.targetCards }}
            </p>
            <p class="text-xs font-semibold text-muted">
              {{ t('create.targetCards') }}
            </p>
          </div>
        </div>

        <div class="mt-6 space-y-2">
          <div
            v-for="player in room.players"
            :key="player.id"
            class="flex items-center gap-3 rounded-md border border-default bg-elevated px-3 py-2.5"
          >
            <span class="flex size-9 items-center justify-center rounded-md bg-navy-800 text-[11px] font-black text-sun-400 dark:bg-sun-400 dark:text-navy-900">
              {{ getPlayerInitials(player.name) }}
            </span>
            <p class="min-w-0 flex-1 truncate font-bold text-highlighted">
              {{ player.name }}
            </p>
            <UBadge
              v-if="player.id === selfId"
              :label="t('room.youBadge')"
              color="primary"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="player.isHost"
              :label="t('room.host')"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>

        <template #footer>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm text-muted">
              {{ isHost ? t('room.startHint') : t('room.waitingForHost') }}
            </p>

            <UButton
              v-if="isHost"
              :label="t('room.startGame')"
              icon="i-lucide-play"
              size="lg"
              :loading="isStarting"
              @click="emit('start')"
            />
          </div>
        </template>
      </UCard>

      <UAlert
        v-if="!isHost"
        color="info"
        variant="subtle"
        icon="i-lucide-loader-circle"
        :title="t('room.waitingHostTitle')"
        :description="t('room.waitingHostHint')"
      />
    </div>

    <UCard :ui="{ body: 'p-5 sm:p-6' }">
      <div class="text-center">
        <p class="text-xs font-black uppercase tracking-[0.2em] text-muted">
          {{ t('room.inviteFriends') }}
        </p>
        <p class="mt-2 font-mono text-4xl font-black tracking-[0.28em] text-highlighted">
          {{ room.code }}
        </p>
        <UButton
          class="mt-2"
          :label="t('room.copy')"
          icon="i-lucide-copy"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="emit('copy')"
        />
      </div>

      <div class="mt-4">
        <RoomQrCode :value="joinUrl" />
      </div>

      <p class="mt-3 text-center text-sm text-muted">
        {{ t('room.qrHint') }}
      </p>
    </UCard>
  </div>
</template>
