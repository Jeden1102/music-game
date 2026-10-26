<script setup lang="ts">
import type { ClipSeconds, RoomCategory, RoomMembership, TargetCards } from '#shared/types/room'
import { CLIP_SECONDS_OPTIONS, TARGET_CARDS_OPTIONS } from '#shared/types/room'
import { isValidPlayerName, normalizePlayerName } from '#shared/utils/player'
import { DEFAULT_CLIP_SECONDS, DEFAULT_TARGET_CARDS } from '#shared/utils/room'

const { t } = useI18n()
const { lastName, saveMembership } = usePlayerSession()

const { data: categories, error: categoriesError } = await useFetch<RoomCategory[]>('/api/categories')

const name = ref(lastName.value)
const clipSeconds = ref<ClipSeconds>(DEFAULT_CLIP_SECONDS)
const categoryId = ref<number>(0)
const targetCards = ref<TargetCards>(DEFAULT_TARGET_CARDS)
const isSubmitting = ref(false)
const errorKey = ref('')
const errorMessage = computed(() => errorKey.value ? t(errorKey.value) : '')

const clipOptions = computed(() => CLIP_SECONDS_OPTIONS.map(value => ({
  label: t('create.secondsOption', { seconds: value }),
  value
})))

const categoryOptions = computed(() => [
  { label: t('create.allCategories'), value: 0 },
  ...(categories.value ?? []).map(category => ({
    label: `${category.name} (${category.songCount})`,
    value: category.id
  }))
])

const targetOptions = computed(() => TARGET_CARDS_OPTIONS.map(value => ({
  label: t('create.cardsOption', { cards: value }),
  value
})))

async function submit() {
  if (isSubmitting.value) {
    return
  }

  const normalizedName = normalizePlayerName(name.value)
  name.value = normalizedName

  if (!isValidPlayerName(normalizedName)) {
    errorKey.value = 'validation.playerName'
    return
  }

  isSubmitting.value = true
  errorKey.value = ''

  try {
    const membership = await $fetch<RoomMembership>('/api/rooms', {
      method: 'POST',
      body: {
        name: normalizedName,
        clipSeconds: clipSeconds.value,
        categoryId: categoryId.value || null,
        targetCards: targetCards.value
      }
    })

    saveMembership(membership, true, normalizedName)
    await navigateTo(`/room/${membership.room.code}`)
  } catch (error) {
    const statusMessage = (error as { data?: { statusMessage?: string } }).data?.statusMessage

    if (statusMessage === 'INVALID_NAME') {
      errorKey.value = 'validation.playerName'
    } else if (statusMessage === 'CATEGORY_NOT_FOUND') {
      errorKey.value = 'create.categoryError'
    } else if (statusMessage === 'INVALID_SETTINGS') {
      errorKey.value = 'create.settingsError'
    } else {
      errorKey.value = 'errors.generic'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UCard :ui="{ body: 'p-5 sm:p-7' }">
    <form
      class="flex flex-col gap-6"
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

      <div class="rounded-lg border border-default bg-muted/45 p-4 sm:p-5">
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-500/15 text-brand-600 dark:text-brand-300">
            <UIcon
              name="i-lucide-sliders-horizontal"
              class="size-5"
            />
          </span>

          <div>
            <p class="font-bold text-highlighted">
              {{ t('create.settingsTitle') }}
            </p>
            <p class="mt-0.5 text-sm text-muted">
              {{ t('create.settingsHint') }}
            </p>
          </div>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-3">
          <UFormField
            :label="t('create.clipDuration')"
            name="clipSeconds"
          >
            <USelect
              v-model="clipSeconds"
              :items="clipOptions"
              icon="i-lucide-timer"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('create.category')"
            name="categoryId"
          >
            <USelect
              v-model="categoryId"
              :items="categoryOptions"
              icon="i-lucide-tags"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UFormField
            :label="t('create.targetCards')"
            name="targetCards"
          >
            <USelect
              v-model="targetCards"
              :items="targetOptions"
              icon="i-lucide-layers"
              size="lg"
              class="w-full"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="categoriesError"
          class="mt-4"
          color="warning"
          variant="subtle"
          :title="t('create.categoriesUnavailable')"
        />
      </div>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />

      <UButton
        type="submit"
        :label="t('create.submit')"
        icon="i-lucide-plus"
        size="xl"
        block
        :loading="isSubmitting"
      />

      <p class="text-center text-xs text-muted">
        {{ t('create.noAccount') }}
      </p>
    </form>
  </UCard>
</template>
