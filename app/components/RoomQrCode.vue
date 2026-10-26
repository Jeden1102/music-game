<script setup lang="ts">
import { QrcodeSvg } from 'qrcode.vue'

const props = withDefaults(defineProps<{
  value: string
  size?: number
}>(), {
  size: 180
})

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center gap-3 text-center">
    <div
      class="rounded-lg bg-white p-3 shadow-sm"
      role="img"
      :aria-label="t('room.qrTitle')"
    >
      <QrcodeSvg
        :value="props.value"
        :size="props.size"
        level="M"
      />
    </div>

    <p class="max-w-xs text-xs text-muted">
      {{ t('room.qrHint') }}
    </p>
  </div>
</template>
