<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const route = useRoute()
const error = ref('')

onMounted(async () => {
  const code = route.query.code as string | undefined

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (exchangeError) {
      error.value = exchangeError.message
      return
    }
  }

  await navigateTo('/notes')
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center space-y-3">
      <template v-if="error">
        <UIcon name="i-lucide-circle-x" class="text-4xl text-error" />
        <p class="text-sm text-error">{{ error }}</p>
        <UButton variant="ghost" to="/login">Back to login</UButton>
      </template>
      <template v-else>
        <UIcon name="i-lucide-loader-circle" class="text-4xl text-primary animate-spin" />
        <p class="text-sm text-muted">Signing you in...</p>
      </template>
    </div>
  </div>
</template>
