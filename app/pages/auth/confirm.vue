<script setup lang="ts">
definePageMeta({ layout: false })

const supabase = useSupabaseClient()
const error = ref('')

onMounted(async () => {
  // Session might already be set if Supabase parsed the hash before onMounted
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await navigateTo('/notes')
    return
  }

  // Otherwise wait for the async SIGNED_IN event
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      subscription.unsubscribe()
      navigateTo('/notes')
    }
    if (event === 'SIGNED_OUT') {
      error.value = 'Sign in failed'
    }
  })
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
