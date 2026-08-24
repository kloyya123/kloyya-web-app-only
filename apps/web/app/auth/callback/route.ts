/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // 1. On crée D'ABORD la réponse de redirection qu'on veut retourner
  const response = NextResponse.redirect(new URL('/dashboard', requestUrl.origin));

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            // 2. On attache les cookies de Supabase DIRECTEMENT à notre réponse de redirection
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options as any);
            }
          },
        },
      }
    );

    // 3. Cette fonction va maintenant appeler setAll() et modifier notre objet 'response'
    await supabase.auth.exchangeCodeForSession(code);
  }

  // 4. On retourne la réponse qui contient À LA FOIS la redirection ET les cookies de session
  return response;
}
