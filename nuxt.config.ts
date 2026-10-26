import { execSync } from 'node:child_process'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/image',
    '@nuxtjs/i18n'
  ],

  devtools: {
    enabled: true
  },

  app: {
    head: {
      meta: [
        // YouTube IFrame requires a Referer header; error 153 appears when it is stripped.
        { name: 'referrer', content: 'strict-origin-when-cross-origin' }
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Mulish:wght@400;500;600;700;800;900&display=swap'
        }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: ''
  },

  runtimeConfig: {
    adminSecret: process.env.ADMIN_SECRET ?? process.env.NUXT_ADMIN_SECRET ?? '',
    youtubeApiKey: process.env.NUXT_YOUTUBE_API_KEY ?? process.env.YOUTUBE_API_KEY ?? '',
    youtubeRegionCode: process.env.NUXT_YOUTUBE_REGION_CODE ?? 'PL'
  },

  routeRules: {
    '/**': {
      headers: {
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    }
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    experimental: {
      websocket: true
    }
  },

  vite: {
    optimizeDeps: {
      include: ['jsqr', 'qrcode.vue']
    }
  },

  hooks: {
    // Vercel can restore a cached node_modules directory together with a Prisma
    // Client generated from an older schema. Always regenerate it before the
    // server bundle is created, otherwise new models (Room, RoomRound, ...)
    // are missing at runtime even though prisma/schema.prisma is up to date.
    'build:before': () => {
      execSync('pnpm exec prisma generate', { stdio: 'inherit' })
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    locales: [
      { code: 'pl', name: 'Polski', language: 'pl-PL', file: 'pl.json' },
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' }
    ],
    defaultLocale: 'pl',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'musicline_locale',
      redirectOn: 'root',
      fallbackLocale: 'pl'
    }
  }
})
