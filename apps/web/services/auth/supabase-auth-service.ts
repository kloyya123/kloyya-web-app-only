import { supabaseBrowser } from '@/lib/supabase/browser';
import { API_STATUS } from '@/types/api';
import { ApiError, isApiError } from '../http/errors';
import { apiFetch } from '../http/transport';
import { DEFAULT_PREFERENCES } from './types';
import type {
  AuthService,
  OnboardingProfile,
  Session,
  SettingsPatch,
  SignInInput,
  SignUpInput,
} from './types';

const PENDING_EMAIL_KEY = 'kloyya_pending_email';

function setPendingEmail(email: string): void {
  try { sessionStorage.setItem(PENDING_EMAIL_KEY, email); } catch {}
}

function pendingEmail(): string | null {
  try { return sessionStorage.getItem(PENDING_EMAIL_KEY); } catch { return null; }
}

function unverifiedSession(email: string, fullName: string): Session {
  return {
    user: {
      id: 'pending', organizationId: 'pending', email, fullName, jobTitle: '',
      role: 'employee', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isEmailVerified: false, hasCompletedOnboarding: false, createdAt: new Date().toISOString(),
    },
    organization: { id: 'pending', name: '', industry: '', plan: 'starter', subscriptionTier: 'free' },
    workspace: { id: 'pending', organizationId: 'pending', name: '', trustScore: 0 },
    preferences: DEFAULT_PREFERENCES,
  };
}

export class SupabaseAuthService implements AuthService {
  private get sb() { return supabaseBrowser(); }

  async getSession(): Promise<Session | null> {
    try { return await apiFetch<Session>('/v1/session'); } 
    catch (error) {
      if (isApiError(error) && error.httpStatus === API_STATUS.Unauthorized) return null;
      throw error;
    }
  }

  async signIn(input: SignInInput): Promise<Session> {
    const { error } = await this.sb.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw signInError(error);
    return this.requireSession();
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const email = input.email.trim().toLowerCase();
    const { data, error } = await this.sb.auth.signUp({
      email, password: input.password, options: { data: { full_name: input.fullName } },
    });
    if (error) throw signUpError(error);
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      throw new ApiError({
        errorCode: 'email_taken', httpStatus: API_STATUS.Conflict,
        message: 'That email is already registered.', description: 'An account already exists for this address.',
        suggestedResolution: 'Sign in instead, or reset your password.', correlationId: 'auth', timestamp: new Date().toISOString(),
      });
    }
    setPendingEmail(email);
    return unverifiedSession(email, input.fullName);
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    } catch {}
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) {
      throw new ApiError({
        errorCode: 'password_update_failed', httpStatus: API_STATUS.BadRequest,
        message: 'That reset link is no longer valid.', description: 'Reset links expire and can only be used once.',
        suggestedResolution: 'Request a new reset email.', correlationId: 'auth', timestamp: new Date().toISOString(),
      });
    }
  }

  async verifyEmail(code: string): Promise<Session> {
    const email = pendingEmail();
    if (!email) {
      throw new ApiError({
        errorCode: 'no_pending_verification', httpStatus: API_STATUS.Unauthorized,
        message: 'We could not find a sign-up to verify.', description: 'Sign up again to get a new code.',
        suggestedResolution: 'Sign up again.', correlationId: 'auth', timestamp: new Date().toISOString(),
      });
    }
    const { error } = await this.sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    if (error) {
      throw new ApiError({
        errorCode: 'invalid_code', httpStatus: API_STATUS.ValidationFailed,
        message: 'That code is not valid.', description: 'The verification code is incorrect or has expired.',
        suggestedResolution: 'Check the code in your email.', correlationId: 'auth', timestamp: new Date().toISOString(),
      });
    }
    try { sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch {}
    return this.requireSession();
  }

  async resendVerificationCode(): Promise<void> {
    const email = pendingEmail();
    if (!email) return;
    await this.sb.auth.resend({ type: 'signup', email });
  }

  async completeOnboarding(profile: OnboardingProfile): Promise<Session> {
    const session = await apiFetch<Session>('/v1/onboarding', { method: 'POST', body: profile });
    await this.sb.auth.refreshSession();
    return session;
  }

  async updateSettings(patch: SettingsPatch): Promise<Session> {
    return apiFetch<Session>('/v1/settings', { method: 'PATCH', body: patch });
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    
    if (error) {
      throw new ApiError({
        errorCode: 'oauth_failed',
        httpStatus: API_STATUS.InternalServerError,
        message: 'Échec de la connexion avec Google.',
        description: error.message,
        suggestedResolution: 'Veuillez réessayer ou utiliser votre email et mot de passe.',
        correlationId: 'auth',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async requireSession(): Promise<Session> {
    const session = await this.getSession();
    if (!session) throw new Error('Signed in, but no session could be loaded.');
    return session;
  }
}

// ✅ CORRECTION : Ajout explicite de `| undefined` pour satisfaire `exactOptionalPropertyTypes: true`
interface SupabaseAuthError { 
  message: string; 
  status?: number | undefined; 
  code?: string | undefined; 
}

function signInError(error: SupabaseAuthError): ApiError {
  const rateLimited = error.status === 429;
  return new ApiError({
    errorCode: rateLimited ? 'too_many_attempts' : 'invalid_credentials',
    httpStatus: rateLimited ? API_STATUS.RateLimited : API_STATUS.Unauthorized,
    message: rateLimited ? 'Too many sign-in attempts.' : 'That email and password do not match.',
    description: rateLimited ? 'This account is temporarily locked.' : 'Kloyya could not verify those credentials.',
    suggestedResolution: rateLimited ? 'Wait a minute, then try again.' : 'Check your email and password.',
    correlationId: 'auth', timestamp: new Date().toISOString(),
  });
}

function signUpError(error: SupabaseAuthError): ApiError {
  const taken = /already registered|already exists/i.test(error.message);
  return new ApiError({
    errorCode: taken ? 'email_taken' : 'signup_failed',
    httpStatus: taken ? API_STATUS.Conflict : API_STATUS.BadRequest,
    message: taken ? 'That email is already registered.' : 'We could not create that account.',
    description: taken ? 'An account already exists for this address.' : error.message,
    suggestedResolution: taken ? 'Sign in instead, or reset your password.' : 'Check the details and try again.',
    correlationId: 'auth', timestamp: new Date().toISOString(),
  });
}
