<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  value: number
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 text-center">
    <div class="relative flex size-28 items-center justify-center">
      <span class="absolute inset-0 animate-ping rounded-full bg-primary/30" />
      <span class="relative text-6xl font-black text-white">
        {{ value }}
      </span>
    </div>
    <p class="text-sm text-white/70">
      {{ t('play.getReady') }}
    </p>
  </div>
</template>
