<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('app.title'),
  description: () => t('app.description'),
  ogTitle: () => t('app.title'),
  ogDescription: () => t('app.description')
})
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <div class="mx-auto max-w-4xl">
      <PageHeading
        :badge="t('start.badge')"
        :title="t('start.heading')"
        :description="t('start.subtitle')"
      />

      <div class="mt-10 grid gap-4 sm:grid-cols-2">
        <StartTile
          to="/create"
          icon="i-lucide-plus-circle"
          :title="t('start.createTitle')"
          :description="t('start.createDescription')"
        />

        <StartTile
          to="/join"
          icon="i-lucide-log-in"
          :title="t('start.joinTitle')"
          :description="t('start.joinDescription')"
        />
      </div>

      <p class="mt-8 text-center text-sm">
        <NuxtLink
          to="/play"
          class="text-muted underline underline-offset-4 transition hover:text-primary"
        >
          {{ t('start.demoLink') }}
        </NuxtLink>
      </p>
    </div>
  </UContainer>
</template>
