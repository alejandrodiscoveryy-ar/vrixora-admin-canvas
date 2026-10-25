/**
 * SOLO PRUEBAS: reemplaza el middleware Supabase real para usar el cliente
 * sintetico del test. Nunca crea clientes externos ni llama a produccion.
 * El worker de produccion sigue importando npm:@supabase/server@1.5.2.
 */
export function withSupabase(
  _options: unknown,
  handler: (request: Request, context: { supabaseAdmin: unknown }) => Promise<Response>,
) {
  return (request: Request, context: { supabaseAdmin: unknown }) => handler(request, context);
}
