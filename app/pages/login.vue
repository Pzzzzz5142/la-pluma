<script setup lang="ts">
definePageMeta({ layout: false })

const { signInWithGithub, signInWithPassword } = useAuth()

const email = ref('')
const password = ref('')
const githubLoading = ref(false)
const passwordLoading = ref(false)
const showPasswordForm = ref(false)
const error = ref('')

async function handleGithub() {
  githubLoading.value = true
  error.value = ''
  try {
    await signInWithGithub()
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Sign in failed'
    githubLoading.value = false
  }
}

async function handlePassword() {
  if (!email.value || !password.value) return
  passwordLoading.value = true
  error.value = ''
  try {
    await signInWithPassword(email.value, password.value)
    await navigateTo('/notes')
  }
  catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Sign in failed'
  }
  finally {
    passwordLoading.value = false
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

      <!-- GitHub button -->
      <div v-if="!showPasswordForm" class="space-y-3">
        <UButton
          block
          size="md"
          color="neutral"
          variant="outline"
          :loading="githubLoading"
          class="gap-2"
          @click="handleGithub"
        >
          <template #leading>
            <UIcon name="i-simple-icons-github" class="text-base" />
          </template>
          Continue with GitHub
        </UButton>

        <p class="text-center text-xs text-muted pt-1">
          <button
            type="button"
            class="underline underline-offset-2 hover:text-foreground transition-colors"
            @click="showPasswordForm = true; error = ''"
          >
            Sign in with password
          </button>
        </p>

        <p v-if="error" class="text-xs text-error text-center">{{ error }}</p>
      </div>

      <!-- Password form -->
      <form v-else class="space-y-3" @submit.prevent="handlePassword">
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
          :loading="passwordLoading"
          :disabled="!email || !password"
        >
          Sign in
        </UButton>

        <p class="text-center text-xs text-muted pt-1">
          <button
            type="button"
            class="underline underline-offset-2 hover:text-foreground transition-colors"
            @click="showPasswordForm = false; error = ''"
          >
            Back to GitHub sign in
          </button>
        </p>
      </form>

    </div>
  </div>
</template>
