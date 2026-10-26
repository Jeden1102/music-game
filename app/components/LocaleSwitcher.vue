<script setup lang="ts">
const { t, locale, setLocale } = useI18n()

const items = computed(() => [
  {
    label: t('locale.pl'),
    value: 'pl',
    icon: locale.value === 'pl' ? 'i-lucide-check' : 'i-lucide-languages',
    onSelect: () => setLocale('pl')
  },
  {
    label: t('locale.en'),
    value: 'en',
    icon: locale.value === 'en' ? 'i-lucide-check' : 'i-lucide-languages',
    onSelect: () => setLocale('en')
  }
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end' }"
    :ui="{ content: 'min-w-40' }"
  >
    <UButton
      :label="locale.toUpperCase()"
      :aria-label="t('locale.label')"
      icon="i-lucide-languages"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
      size="sm"
    />
  </UDropdownMenu>
</template>
