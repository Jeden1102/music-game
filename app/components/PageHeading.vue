<script setup lang="ts">
defineProps<{
  title: string
  badge?: string
  description?: string
  icon?: string
}>()
</script>

<template>
  <div class="text-center">
    <UBadge
      v-if="badge"
      :label="badge"
      :icon="icon ?? 'i-lucide-disc-3'"
      color="primary"
      variant="subtle"
      size="lg"
    />

    <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
      {{ title }}
    </h1>

    <p
      v-if="description"
      class="mt-2 text-balance text-muted"
    >
      {{ description }}
    </p>
  </div>
</template>
