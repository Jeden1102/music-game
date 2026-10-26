<script setup lang="ts">
import type { RoomMembership } from '#shared/types/room'
import { isValidPlayerName, normalizePlayerName } from '#shared/utils/player'
import { isValidRoomCode, normalizeRoomCode } from '#shared/utils/room'
import { extractRoomCode } from '~/utils/qr'

const { t } = useI18n()
const route = useRoute()
const { lastName, saveMembership } = usePlayerSession()

const name = ref(lastName.value)
const rawCode = ref('')
const isSubmitting = ref(false)
const scannerOpen = ref(false)
const errorKey = ref('')

const code = computed({
  get: () => rawCode.value,
  set: (value: string) => {
    rawCode.value = normalizeRoomCode(value)
  }
})

const errorMessage = computed(() => errorKey.value ? t(errorKey.value) : '')

watch(() => route.query.code, (value) => {
  if (typeof value === 'string') {
    rawCode.value = normalizeRoomCode(value)
  }
}, { immediate: true })

function handleDetected(value: string) {
  const scannedCode = extractRoomCode(value)

  if (!isValidRoomCode(scannedCode)) {
    errorKey.value = 'join.invalidQr'
    return
  }

  rawCode.value = scannedCode
  scannerOpen.value = false
  errorKey.value = ''
}

async function submit() {
  if (isSubmitting.value) {
    return
  }

  const normalizedName = normalizePlayerName(name.value)
  name.value = normalizedName
  errorKey.value = ''

  if (!isValidPlayerName(normalizedName)) {
    errorKey.value = 'validation.playerName'
    return
  }

  if (!isValidRoomCode(code.value)) {
    errorKey.value = 'validation.roomCode'
    return
  }

  isSubmitting.value = true

  try {
    const membership = await $fetch<RoomMembership>(`/api/rooms/${code.value}/join`, {
      method: 'POST',
      body: { name: normalizedName }
    })

    saveMembership(membership, false, normalizedName)
    await navigateTo(`/room/${membership.room.code}`)
  } catch (error) {
    const statusMessage = (error as { data?: { statusMessage?: string } }).data?.statusMessage

    if (statusMessage === 'ROOM_NOT_FOUND') {
      errorKey.value = 'join.notFound'
    } else if (statusMessage === 'ROOM_FULL') {
      errorKey.value = 'join.full'
    } else if (statusMessage === 'INVALID_NAME') {
      errorKey.value = 'validation.playerName'
    } else {
      errorKey.value = 'errors.generic'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UCard>
    <form
      class="flex flex-col gap-5"
      @submit.prevent="submit"
    >
      <UFormField
        :label="t('fields.playerName')"
        name="playerName"
      >
        <UInput
          v-model="name"
          :placeholder="t('fields.playerNamePlaceholder')"
          :maxlength="20"
          autocomplete="nickname"
          size="xl"
          class="w-full"
        />
      </UFormField>

      <UFormField
        :label="t('fields.roomCode')"
        name="roomCode"
        :hint="t('join.codeHint')"
      >
        <div class="flex gap-2">
          <UInput
            v-model="code"
            :placeholder="t('fields.roomCodePlaceholder')"
            :maxlength="4"
            inputmode="numeric"
            autocomplete="one-time-code"
            size="xl"
            class="min-w-0 flex-1"
          />

          <UButton
            :label="t('join.scan')"
            icon="i-lucide-qr-code"
            color="neutral"
            variant="outline"
            size="xl"
            @click="scannerOpen = true"
          />
        </div>
      </UFormField>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />

      <UButton
        type="submit"
        :label="t('join.submit')"
        icon="i-lucide-log-in"
        size="xl"
        block
        :loading="isSubmitting"
      />
    </form>

    <QrScannerModal
      v-model:open="scannerOpen"
      @detected="handleDetected"
    />
  </UCard>
</template>
