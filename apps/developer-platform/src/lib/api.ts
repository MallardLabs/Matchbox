import { supabase } from "@/config/supabase"

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`)
  }
  return fetch(input, { ...init, headers })
}
