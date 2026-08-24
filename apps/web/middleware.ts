import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { describeAllowlist, isBetaAllowed } from '@/lib/beta-access';
import { safeRedirect } from '@/lib/safe-redirect';
import { SESSION_COOKIE_NAME } from '@/services/auth/session-store';

/**
 * Route protection, enforced on the server before any protected markup is sent.
 *
 * Doing this client-side would render the dashboard shell, then redirect — a
 * visible flash of content the user is not authorized to see. This runs first.
 *
 * SECURITY BOUNDARY. This is a routing convenience, not an authorization control:
 * every API route independently authorizes its caller (validating the Supabase
 * JWT server-side). Never let a route guard be the thing that protects data.
 *
 * Two backends, one gate: with the real backend it reads the Supabase session
 * (and refreshes it, carrying the rotated cookies onto every response); with the
 * mock it reads the unsigned demo cookie. The decision tree — where each of
 * {unauthenticated, unverified, un-onboarded, allowed, provisioned} may go — is
 * shared.
 *
 * The allowlist is back, by request, scoped to two addresses. Sign-up and
 * sign-in still go straight to Supabase, so an account not on the list CAN be
 * created — that call never passes through our server. What it cannot do is
 * reach the app: this runs on every request. See lib/beta-access.ts.
 *
 * This app has no marketing page of its own — kloyya.com is the sole public
 * front door (a separate repo/deployment). `/` here is never rendered; it
 * always bounces onward, same as any other unauthenticated-only route.
 */
const USE_REAL_API = process.env['NEXT_PUBLIC_USE_REAL_API'] === 'true';

/** Where the marketing site's own waitlist section lives, for disallowed accounts. */
const MARKETING_WAITLIST_URL = 'https://kloyya.com/#waitlist';

const ROOT = '/';
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  // The password-recovery email link lands here before any session exists —
  // see app/auth/confirm/route.ts, which is what actually establishes one.
  '/auth/confirm',
  // ✅ AJOUT CRUCIAL : Autorise le middleware à laisser passer le callback OAuth
  // pour que la session puisse être établie avant toute vérification d'authentification.
  '/auth/callback',
];
/** Reachable while authenticated but not yet fully provisioned. */
const PROVISIONING_ROUTES = ['/verify-email', '/onboarding', '/workspace-init'];

/**
 * Setting a new password, reached from the emailed reset link.
 *
 * Exempt from every branch below, in both directions. Supabase establishes a
 * recovery SESSION when the link is followed, so by the time this screen loads
 * the visitor is authenticated — which would otherwise send them straight to
 * /dashboard, past the one screen they came here to use. Equally it must work
 * when no session exists yet, so the link is never a dead end.
 */
const RESET_PASSWORD = '/reset-password';

interface AuthState {
  authed: boolean;
  verified: boolean;
  onboarded: boolean;
  /** On the access allowlist. See lib/beta-access.ts. */
  allowed: boolean;
}

/**
 * The shared gate tree. `carry` is an already-built response whose cookies (the
 * refreshed Supabase session) must survive onto any redirect — the canonical
 * @supabase/ssr pitfall is dropping them.
 */
export function decide(request: NextRequest, state: AuthState, carry: NextResponse): NextResponse {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isProvisioning = PROVISIONING_ROUTES.some((route) => pathname.startsWith(route));

  const redirect = (to: URL) => {
    const res = NextResponse.redirect(to);
    for (const cookie of carry.cookies.getAll()) res.cookies.set(cookie);
    return res;
  };

  // The reset screen is exempt from the whole tree — see RESET_PASSWORD above.
  if (pathname.startsWith(RESET_PASSWORD)) return carry;

  // Unauthenticated: everything except the public routes goes to login, with a
  // validated return path so the user lands where they were headed. `/` is
  // NOT public here — this app has no marketing page, so an unauthenticated
  // visitor to `/` is sent straight to login rather than shown anything.
  if (!state.authed) {
    if (isPublic) return carry;
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    return redirect(login);
  }

  // Signed in, but not on the allowlist.
  //
  // Checked before verification and onboarding on purpose: walking someone
  // through an email code and the onboarding wizard only to refuse them at the
  // end would be a cruel way to spend their time. There is no in-app waitlist
  // page anymore, so a disallowed visitor is sent to the marketing site's own
  // waitlist section.
  if (!state.allowed) {
    if (pathname === ROOT) return carry;
    return redirect(new URL(MARKETING_WAITLIST_URL));
  }

  // Authenticated but unverified: the only way forward is the code.
  if (!state.verified) {
    return pathname.startsWith('/verify-email') ? carry : redirect(new URL('/verify-email', request.url));
  }

  // Verified but not onboarded: the only way forward is onboarding.
  //
  // /workspace-init counts as forward, not backward. It runs immediately AFTER
  // the wizard, and the `onboarded` flag it is measured against is stamped into
  // user_metadata best-effort (see server/users/metadata.ts) — the database is
  // the source of truth, that stamp is a convenience for this very check. When
  // the stamp fails the flag stays false, and without this exemption pressing
  // Continue on the connect-tools screen bounced the user back to the start of
  // the wizard they had just finished: a silent loop that looks like a dead
  // button. Provisioning is idempotent, so letting it through is safe.
  if (!state.onboarded) {
    const movingForward =
      pathname.startsWith('/onboarding') || pathname.startsWith('/workspace-init');
    return movingForward ? carry : redirect(new URL('/onboarding', request.url));
  }

  // Fully provisioned. Bounce away from `/`, the auth screens, and the
  // provisioning screens — a signed-in user has no business on any of them,
  // and `/` renders nothing of its own to stay on.
  if (pathname === ROOT || isPublic || isProvisioning) {
    // Two provisioning routes run AFTER onboarding, on the way to the dashboard,
    // so a provisioned user may see them: connect-tools and workspace-init.
    if (pathname.startsWith('/workspace-init') || pathname.startsWith('/onboarding/connect-tools')) {
      return carry;
    }
    const next = request.nextUrl.searchParams.get('next');
    return redirect(new URL(safeRedirect(next, '/dashboard'), request.url));
  }

  return carry;
}

/**
 * The kill switch. `MAINTENANCE_MODE=true` in Vercel's env vars takes the
 * whole site down with one flip, no redeploy — env vars are read fresh on the
 * next invocation. Checked before anything else, including the Supabase call
 * below, because a real outage severe enough to need this may well be
 * Supabase itself being down, and this must not depend on the thing that's
 * broken. Read directly from `process.env`, not the validated server config
 * in server/config.ts: that module targets the Node runtime and this file
 * runs on the Edge, where pulling in a whole config module for one boolean
 * is the wrong tool.
 */
function maintenanceResponse(): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Kloyya — Down for maintenance</title>
<style>
  body { font-family: system-ui, sans-serif; background: #fafafa; color: #1a1a1a;
    display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
  main { max-width: 28rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #555; line-height: 1.5; }
</style></head>
<body><main>
  <h1>Kloyya is down for maintenance</h1>
  <p>We&rsquo;re making a quick fix. This should only take a few minutes — try again shortly.</p>
</main></body></html>`,
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '120' },
    },
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (process.env['MAINTENANCE_MODE'] === 'true') return maintenanceResponse();
  if (!USE_REAL_API) return mockMiddleware(request);

  // ✅ CORRECTION 1 : 'const' au lieu de 'let' car la variable n'est plus réassignée.
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            // ✅ CORRECTION 2 : Désactivation locale de la règle eslint pour gérer 
            // le conflit de type entre CookieOptions (Supabase) et ResponseCookie (Next.js).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            response.cookies.set(name, value, options as any);
          }
        },
      },
    },
  );

  // getUser (not getSession) revalidates the JWT and refreshes it if stale.
  //
  // This runs on EVERY request, including public pages — /login and /signup
  // hit this before `decide()` ever gets to its own `isPublic` check below.
  // A transient network failure reaching Supabase's auth endpoint must not
  // take down the entire site, so a failed call degrades to "unauthenticated"
  // rather than throwing: public pages keep rendering, and a protected route
  // correctly redirects to login instead of 500ing.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  try {
    ({
      data: { user },
    } = await supabase.auth.getUser());
  } catch (error) {
    console.error('[middleware] supabase.auth.getUser() failed — treating request as unauthenticated', error);
  }

  return withGateHeader(
    decide(
      request,
      {
        authed: Boolean(user),
        verified: Boolean(user?.email_confirmed_at),
        onboarded: user?.user_metadata?.['onboarded'] === true,
        allowed: isBetaAllowed(user?.email),
      },
      response,
    ),
  );
}

/**
 * TEMPORARY, same reasoning as the last time this gate existed: an earlier
 * version once refused an allowlisted address and the cause was never
 * established, because nothing about the check was observable from outside —
 * a missing variable, a malformed one, and a session without an email all
 * produced the same wall. This header carries a count and entry LENGTHS,
 * never an address, so a stray quote or trailing space shows up as a wrong
 * length without publishing anyone's email. Remove once this configuration is
 * confirmed working end to end.
 */
function withGateHeader(response: NextResponse): NextResponse {
  response.headers.set('x-kloyya-gate', describeAllowlist());
  return response;
}

/** The mock branch: read the unsigned demo cookie. No cookies to carry. */
function mockMiddleware(request: NextRequest): NextResponse {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let state: AuthState = {
    authed: false,
    verified: false,
    onboarded: false,
    allowed: false,
  };

  if (raw) {
    try {
      const s = JSON.parse(decodeURIComponent(raw)) as {
        user?: { email?: string; isEmailVerified?: boolean; hasCompletedOnboarding?: boolean };
        organization?: unknown;
        workspace?: unknown;
        preferences?: unknown;
      };
      // A session missing what the app renders from must read as no session.
      if (s.user && s.organization && s.workspace && s.preferences) {
        state = {
          authed: true,
          verified: s.user.isEmailVerified === true,
          onboarded: s.user.hasCompletedOnboarding === true,
          allowed: isBetaAllowed(s.user.email),
        };
      }
    } catch {
      // A tampered cookie means "not signed in", never "crash".
    }
  }

  return withGateHeader(decide(request, state, NextResponse.next()));
}

export const config = {
  /**
   * Everything except Next internals, the API routes (they authorize
   * themselves — running the page-gate here would turn a 401 into an HTML
   * redirect), static assets, and the favicon.
   *
   * robots.txt and sitemap.xml are excluded too: they are generated routes, so
   * without this the gate answers a crawler with a redirect to /login and the
   * site never gets indexed.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|webp|woff|woff2|ttf|eot|css|js)$).*)',
  ],
};
