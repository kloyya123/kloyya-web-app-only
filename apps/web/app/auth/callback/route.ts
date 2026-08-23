import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

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
            const response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              /* eslint-disable @typescript-eslint/no-explicit-any */
              response.cookies.set(name, value, options as any);
              /* eslint-enable @typescript-eslint/no-explicit-any */
            }
            return response;
          },
        },
      }
    );

    // Échange le code OAuth contre une session Supabase valide
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirection vers le dashboard. Le middleware s'occupera de vérifier 
  // si l'utilisateur a besoin de faire l'onboarding ou non.
  return NextResponse.redirect(new URL('/dashboard', requestUrl.origin));
}
