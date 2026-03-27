<script setup lang="ts">
definePageMeta({ layout: false })

const { signIn, signInWithPassword } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')
const showPassword = ref(false)

async function handleSubmit() {
  if (!email.value) return
  loading.value = true
  error.value = ''
  try {
    if (showPassword.value) {
      await signInWithPassword(email.value, password.value)
      await navigateTo('/notes')
    }
    else {
      await signIn(email.value)
      sent.value = true
    }
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Sign in failed'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-background px-6">
    <div class="w-full max-w-sm">

      <!-- Wordmark -->
      <div class="mb-12 text-center">
        <div class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 mb-5">
          <UIcon name="i-lucide-notebook-pen" class="text-xl text-primary" />
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">nuxt-notes</h1>
        <p class="text-sm text-muted mt-1.5">Your personal workspace</p>
      </div>

      <!-- Sent state -->
      <div v-if="sent" class="text-center space-y-4 py-6">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-1">
          <UIcon name="i-lucide-mail-check" class="text-2xl text-primary" />
        </div>
        <div>
          <p class="font-medium">Check your inbox</p>
          <p class="text-sm text-muted mt-1 leading-relaxed">
            We sent a magic link to <span class="text-foreground font-medium">{{ email }}</span>
          </p>
        </div>
        <button
          class="text-xs text-muted underline underline-offset-2 hover:text-foreground transition-colors mt-2"
          @click="sent = false"
        >
          Use a different email
        </button>
      </div>

      <!-- Form -->
      <form v-else class="space-y-3" @submit.prevent="handleSubmit">
        <UInput
          v-model="email"
          type="email"
          placeholder="your@email.com"
          autocomplete="email"
          required
          size="md"
          class="w-full"
        />

        <UInput
          v-if="showPassword"
          v-model="password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
          required
          size="md"
          class="w-full"
        />

        <p v-if="error" class="text-xs text-error">{{ error }}</p>

        <UButton
          type="submit"
          block
          size="md"
          :loading="loading"
          :disabled="!email"
          class="mt-1"
        >
          {{ showPassword ? 'Sign in' : 'Send magic link' }}
        </UButton>

        <p class="text-center text-xs text-muted pt-1">
          <button
            type="button"
            class="underline underline-offset-2 hover:text-foreground transition-colors"
            @click="showPassword = !showPassword; error = ''"
          >
            {{ showPassword ? 'Use magic link instead' : 'Sign in with password' }}
          </button>
        </p>
      </form>

    </div>
  </div>
</template>
