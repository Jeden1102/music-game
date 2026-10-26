<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('create.title'),
  description: () => t('create.subtitle')
})
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <div class="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeading
        :badge="t('create.badge')"
        :title="t('create.title')"
        :description="t('create.subtitle')"
        icon="i-lucide-plus-circle"
      />

      <RoomCreateForm />

      <div class="text-center">
        <UButton
          to="/"
          :label="t('room.backHome')"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
        />
      </div>
    </div>
  </UContainer>
</template>
