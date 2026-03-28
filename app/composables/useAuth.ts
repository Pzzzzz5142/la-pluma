export function useAuth() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  async function signInWithGithub() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    if (error) throw error
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    await navigateTo('/login')
  }

  return { user, signInWithGithub, signInWithPassword, signOut }
}
