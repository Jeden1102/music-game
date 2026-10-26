<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-default/80 bg-default/85 backdrop-blur-xl">
    <UContainer class="flex h-16 items-center justify-between gap-3">
      <NuxtLink
        to="/"
        class="group flex min-w-0 items-center gap-3"
        :aria-label="t('nav.home')"
      >
        <span class="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-navy-800 text-sun-400 shadow-lg shadow-navy-900/20 transition group-hover:-rotate-3 dark:bg-sun-400 dark:text-navy-900">
          <UIcon
            name="i-lucide-audio-lines"
            class="size-5"
          />
          <span class="absolute -right-1 -top-1 size-3 rounded-full bg-brand-500" />
          <span class="absolute -bottom-1 -left-1 size-2 rounded-full bg-alert-500/80" />
        </span>

        <span class="min-w-0">
          <span class="block truncate text-lg font-black leading-none tracking-tight text-highlighted">
            musicline
          </span>
          <span class="mt-1 hidden text-[10px] font-bold uppercase tracking-[0.24em] text-muted sm:block">
            {{ t('app.tagline') }}
          </span>
        </span>
      </NuxtLink>

      <div class="flex shrink-0 items-center gap-1.5">
        <LocaleSwitcher />
        <UColorModeButton
          color="neutral"
          variant="ghost"
          :aria-label="t('app.toggleTheme')"
        />
      </div>
    </UContainer>
  </header>
</template>
