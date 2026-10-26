<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const secret = computed(() => typeof route.query.secret === 'string' ? route.query.secret : '')

const { data: authorized, status: authStatus } = await useAsyncData(
  'admin-authorized',
  async () => {
    if (!secret.value) {
      return false
    }

    try {
      await $fetch('/api/admin/verify', {
        headers: { 'x-admin-secret': secret.value }
      })

      return true
    } catch {
      return false
    }
  },
  { watch: [secret] }
)

const hasAccess = computed(() => authorized.value === true)

useSeoMeta({
  title: () => t('admin.title'),
  description: () => t('admin.subtitle'),
  robots: 'noindex, nofollow'
})

useHead({
  meta: [
    { name: 'referrer', content: 'no-referrer' }
  ]
})
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <div class="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeading
        :badge="t('admin.badge')"
        :title="t('admin.title')"
        :description="t('admin.subtitle')"
        icon="i-lucide-shield"
      />

      <UCard v-if="authStatus === 'pending'">
        <div class="flex items-center justify-center gap-3 py-12 text-muted">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-6 animate-spin"
          />
          {{ t('admin.importing') }}
        </div>
      </UCard>

      <UCard v-else-if="!hasAccess">
        <UAlert
          color="error"
          variant="subtle"
          :title="t('admin.denied')"
          :description="t('admin.deniedHint')"
        />

        <div class="mt-4 flex justify-center">
          <UButton
            to="/"
            :label="t('admin.back')"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
          />
        </div>
      </UCard>

      <template v-else>
        <SongImportForm :secret="secret" />

        <div class="text-center">
          <UButton
            to="/"
            :label="t('admin.back')"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
          />
        </div>
      </template>
    </div>
  </UContainer>
</template>
