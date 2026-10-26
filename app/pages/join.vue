<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('join.title'),
  description: () => t('join.subtitle')
})
</script>

<template>
  <UContainer class="py-10 sm:py-16">
    <div class="mx-auto flex max-w-md flex-col gap-8">
      <PageHeading
        :badge="t('join.badge')"
        :title="t('join.title')"
        :description="t('join.subtitle')"
        icon="i-lucide-log-in"
      />

      <RoomJoinForm />

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
