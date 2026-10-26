<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  to: string
  icon: string
  title: string
  description: string
}>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="group block h-full"
  >
    <UCard
      class="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-primary/40"
      :ui="{ body: 'p-6 sm:p-8' }"
    >
      <div class="flex h-full flex-col gap-4">
        <span class="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <UIcon
            :name="icon"
            class="size-6"
          />
        </span>

        <div>
          <h2 class="text-xl font-semibold text-highlighted">
            {{ title }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ description }}
          </p>
        </div>

        <span class="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
          {{ t('start.open') }}
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4 transition group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </UCard>
  </NuxtLink>
</template>
