import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

interface CookieParaDefinir {
  name: string;
  value: string;
  options?: CookieOptions;
}

/**
 * Supabase client for use in Server Components, Route Handlers and
 * Server Actions. Reads/writes the auth cookie via Next's cookies() API.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieParaDefinir[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — safe to ignore since
            // middleware refreshes the session cookie on every request.
          }
        },
      },
    }
  );
}

/**
 * Service-role client for trusted server-only operations (webhooks,
 * scheduled jobs). NEVER import this from client code or expose the key.
 */
export function createServiceRoleClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
