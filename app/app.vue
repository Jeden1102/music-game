<script setup lang="ts">
const { t, locale } = useI18n()

useHead(() => ({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#003049' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: locale.value
  }
}))

useSeoMeta({
  title: () => t('app.title'),
  description: () => t('app.description'),
  ogTitle: () => t('app.title'),
  ogDescription: () => t('app.description'),
  twitterCard: 'summary'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator color="#f77f00" />

    <div class="flex min-h-screen flex-col">
      <AppHeader />

      <UMain class="flex-1">
        <NuxtPage />
      </UMain>
    </div>
  </UApp>
</template>
