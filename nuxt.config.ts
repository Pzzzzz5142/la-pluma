// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },
  ssr: false,
  srcDir: 'app/',
  css: ['~/assets/css/main.css'],

  fonts: {
    providers: {
      googleicons: false,
    },
    families: [
      { name: 'Geist', weights: [400, 500, 600, 700] },
    ],
  },

  vite: {
    server: {
      allowedHosts: ['pzzzzz-raspi'],
    },
  },

  modules: [
    '@nuxt/ui',
    '@nuxtjs/supabase',
    '@vite-pwa/nuxt',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@vueuse/motion/nuxt',
  ],

  supabase: {
    useSsrCookies: true,
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      secure: true,
    },
    redirectOptions: {
      login: '/login',
      callback: '/auth/confirm',
      exclude: ['/login'],
    },
  },

  pwa: {
    manifest: {
      name: 'nuxt-notes',
      short_name: 'Notes',
      description: 'Personal notes & writing app',
      theme_color: '#18181b',
      background_color: '#18181b',
      display: 'standalone',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
    },
    devOptions: {
      enabled: false,
    },
  },

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    public: {
      wsUrl: process.env.NUXT_PUBLIC_WS_URL ?? 'ws://localhost:3001',
    },
  },
})
