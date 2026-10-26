<script setup lang="ts">
import type { SongImportResult } from '#shared/types/song-import'
import { SONG_IMPORT_PLACEHOLDER, SONG_IMPORT_SAMPLE } from '~/utils/admin'

const props = defineProps<{
  secret: string
}>()

const { t } = useI18n()
const toast = useToast()

const json = ref('')
const isImporting = ref(false)
const result = ref<SongImportResult | null>(null)
const errorMessage = ref('')

const resultMessage = computed(() => {
  if (!result.value) {
    return ''
  }

  return [
    t('admin.successDescription', { count: result.value.imported }),
    t('admin.resultCategories', { categories: result.value.categories.join(', ') })
  ].join(' ')
})

function insertSample() {
  json.value = JSON.stringify(SONG_IMPORT_SAMPLE, null, 2)
}

async function submit() {
  if (isImporting.value) {
    return
  }

  if (!json.value.trim()) {
    errorMessage.value = t('admin.empty')
    return
  }

  isImporting.value = true
  errorMessage.value = ''
  result.value = null

  try {
    result.value = await $fetch<SongImportResult>('/api/admin/songs/import', {
      method: 'POST',
      headers: { 'x-admin-secret': props.secret },
      body: { json: json.value }
    })

    toast.add({
      title: t('admin.successTitle'),
      description: t('admin.successDescription', { count: result.value.imported }),
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
  } catch (error) {
    const fetchError = error as { data?: { message?: string, statusMessage?: string } }
    errorMessage.value = fetchError.data?.message
      ?? fetchError.data?.statusMessage
      ?? t('errors.generic')
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold text-highlighted">
          {{ t('admin.formTitle') }}
        </h2>

        <UButton
          :label="t('admin.sample')"
          icon="i-lucide-file-json-2"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="insertSample"
        />
      </div>
    </template>

    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <UFormField
        :label="t('admin.formTitle')"
        :hint="t('admin.formHint')"
        name="songsJson"
      >
        <UTextarea
          v-model="json"
          :rows="16"
          :placeholder="SONG_IMPORT_PLACEHOLDER"
          spellcheck="false"
          class="w-full font-mono text-xs"
        />
      </UFormField>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="t('admin.failed')"
        :description="errorMessage"
      />

      <UAlert
        v-if="result"
        color="success"
        variant="subtle"
        :title="t('admin.successTitle')"
        :description="resultMessage"
      />
    </form>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          :label="isImporting ? t('admin.importing') : t('admin.import')"
          icon="i-lucide-database-zap"
          size="lg"
          :loading="isImporting"
          @click="submit"
        />
      </div>
    </template>
  </UCard>
</template>
