<script setup lang="ts">
definePageMeta({ layout: false })

const user = useSupabaseUser()

watch(user, () => {
  if (user.value) navigateTo('/notes')
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center space-y-3">
      <UIcon name="i-lucide-loader-circle" class="text-4xl text-primary animate-spin" />
      <p class="text-sm text-muted">Signing you in...</p>
    </div>
  </div>
</template>
