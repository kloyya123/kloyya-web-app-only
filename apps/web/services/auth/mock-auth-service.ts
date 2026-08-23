import { API_STATUS } from '@/types/api';
import { ApiError } from '../http/errors';
import { mockRespond, mockError } from '../http/mock-transport';
import { DEMO_CREDENTIALS, DEMO_VERIFICATION_CODE } from './types';
import type {
  AuthService,
  OnboardingProfile,
  Session,
  SettingsPatch,
  SignInInput,
  SignUpInput,
} from './types';

const attempts = new Map<string, number>();
const MAX_ATTEMPTS = 5;

function assertNotRateLimited(email: string): void {
  const count = attempts.get(email) ?? 0;
  if (count >= MAX_ATTEMPTS) {
    mockError(
      API_STATUS.RateLimited,
      'too_many_attempts',
      'Too many sign-in attempts.',
      'This account is temporarily locked after repeated attempts.',
      'Wait a minute, then try again.',
    );
  }
}

function recordFailure(email: string): void {
  attempts.set(email, (attempts.get(email) ?? 0) + 1);
}

function newUserFrom(input: SignUpInput) {
  return {
    id: 'mock-user-id',
    organizationId: 'mock-org-id',
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName,
    jobTitle: '',
    role: 'employee' as const,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isEmailVerified: false,
    hasCompletedOnboarding: false,
    createdAt: new Date().toISOString(),
  };
}

const mockUser = newUserFrom({
  email: DEMO_CREDENTIALS.email,
  password: DEMO_CREDENTIALS.password,
  fullName: 'Demo User',
});

function buildSession(user: ReturnType<typeof newUserFrom>): Session {
  return {
    user,
    organization: {
      id: user.organizationId,
      name: 'Demo Organization',
      industry: 'Technology',
      plan: 'starter' as const,
      subscriptionTier: 'free' as const,
    },
    workspace: {
      id: 'mock-workspace-id',
      organizationId: user.organizationId,
      name: 'Demo Workspace',
      trustScore: 0,
    },
    preferences: {
      role: '',
      goals: [],
      priorities: [],
      proactiveness: 'balanced' as const,
      teamSize: '1-10',
      briefingTime: '08:00',
      workStyle: 'deep_focus' as const,
      notificationLevel: 'important_only' as const,
      aiDraftingEnabled: true,
    },
  };
}

const SESSION_KEY = 'kloyya_mock_session';

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export class MockAuthService implements AuthService {
  async getSession(): Promise<Session | null> {
    return readSession();
  }

  async signIn(input: SignInInput): Promise<Session> {
    const email = input.email.trim().toLowerCase();
    assertNotRateLimited(email);

    const { data: matches } = await mockRespond(
      email === DEMO_CREDENTIALS.email && input.password === DEMO_CREDENTIALS.password,
    );

    if (!matches) {
      recordFailure(email);
      mockError(
        API_STATUS.Unauthorized,
        'invalid_credentials',
        'That email and password do not match.',
        'Kloyya could not verify those credentials.',
        'Check your email and password, then try again.',
      );
    }

    attempts.delete(email);
    const session = buildSession(mockUser);
    writeSession(session);
    return session;
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const email = input.email.trim().toLowerCase();

    const { data: alreadyRegistered } = await mockRespond(email === DEMO_CREDENTIALS.email);

    if (alreadyRegistered) {
      mockError(
        API_STATUS.Conflict,
        'email_taken',
        'That email is already registered.',
        'An account already exists for this address.',
        'Sign in instead, or reset your password.',
      );
    }

    const session = buildSession(newUserFrom({ ...input, email }));
    writeSession(session);
    return session;
  }

  async signOut(): Promise<void> {
    await mockRespond(null);
    clearSession();
  }

  async requestPasswordReset(email: string): Promise<void> {
    await mockRespond(email);
  }

  async updatePassword(newPassword: string): Promise<void> {
    await mockRespond(newPassword);
  }

  async verifyEmail(code: string): Promise<Session> {
    const current = readSession();
    if (!current) {
      mockError(
        API_STATUS.Unauthorized,
        'no_session',
        'Your session has expired.',
        'Kloyya could not find an active sign-up to verify.',
        'Sign up again to receive a new code.',
      );
    }

    const { data: isValid } = await mockRespond(code.trim() === DEMO_VERIFICATION_CODE);

    if (!isValid) {
      mockError(
        API_STATUS.ValidationFailed,
        'invalid_code',
        'That code is not valid.',
        'The verification code is incorrect or has expired.',
        'Check the code in your email, or request a new one.',
      );
    }

    const session: Session = {
      ...current,
      user: { ...current.user, isEmailVerified: true },
    };
    writeSession(session);
    return session;
  }

  async resendVerificationCode(): Promise<void> {
    await mockRespond(null);
  }

  async completeOnboarding(profile: OnboardingProfile): Promise<Session> {
    const current = readSession();
    if (!current) {
      mockError(
        API_STATUS.Unauthorized,
        'no_session',
        'Your session has expired.',
        'Kloyya could not find an active session to update.',
        'Sign in again to continue.',
      );
    }

    await mockRespond(profile);

    const session: Session = {
      ...current,
      user: {
        ...current.user,
        fullName: profile.fullName,
        hasCompletedOnboarding: true,
      },
      organization: { ...current.organization, subscriptionTier: profile.plan },
      preferences: {
        ...current.preferences,
        role: profile.role,
        goals: profile.goals,
        priorities: profile.priorities,
        proactiveness: profile.proactiveness,
      },
    };
    writeSession(session);
    return session;
  }

  async updateSettings(patch: SettingsPatch): Promise<Session> {
    const current = readSession();
    if (!current) {
      mockError(
        API_STATUS.Unauthorized,
        'session_expired',
        'Your session has expired.',
        'Kloyya could not find an active session to update.',
        'Sign in again to continue.',
      );
    }

    await mockRespond(patch);

    const session: Session = {
      ...current,
      user: {
        ...current.user,
        fullName: patch.fullName ?? current.user.fullName,
        jobTitle: patch.jobTitle ?? current.user.jobTitle,
      },
      organization: {
        ...current.organization,
        name: patch.companyName ?? current.organization.name,
        industry: patch.industry ?? current.organization.industry,
      },
      preferences: { ...current.preferences, ...patch.preferences },
    };
    writeSession(session);
    return session;
  }

  // ✅ NOUVEAU : Implémentation requise par l'interface AuthService
  async signInWithGoogle(): Promise<void> {
    throw new Error(
      'Google Sign-In is not available in mock mode. Please use the demo credentials or enable the real backend.'
    );
  }
}
