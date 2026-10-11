// Local test wrapper only. No environment, Supabase client or network access.
export function withSupabase(_options: unknown, handler: (req: Request, context: { supabaseAdmin: unknown }) => Promise<Response>) {
  return handler;
}
