import type { Organization, User, Workspace } from '@/types/domain';
import type { OnboardingProfile, SettingsPatch, UserPreferences } from '@kloyya/core/preferences';

/**
 * Preferences and onboarding shapes now live in @kloyya/core — the API collects,
 * validates, and returns exactly these, so one definition serves both ends.
 * Re-exported here so `@/services/auth/types` remains the app's import site.
 */
export {
  DEFAULT_PREFERENCES,
  TEAM_SIZES,
  GOALS,
  WORK_STYLES,
  BRIEFING_TIMES,
  NOTIFICATION_LEVELS,
  PROACTIVENESS,
  SUBSCRIPTION_TIERS,
} from '@kloyya/core/preferences';
export type {
  TeamSize,
  Goal,
  WorkStyle,
  BriefingTime,
  NotificationLevel,
  Proactiveness,
  SubscriptionTier,
  UserPreferences,
  OnboardingProfile,
  SettingsPatch,
} from '@kloyya/core/preferences';

/**
 * KESM session model: "Short-lived access tokens, Refresh tokens, Device
 * binding, ... Session revocation."
 *
 * NO TOKEN APPEARS HERE, deliberately. The real session lives entirely in an
 * httpOnly cookie the server writes and JavaScript cannot read — the browser
 * attaches it, `credentials: 'include'` sends it, and no client code ever holds
 * it. That absence is the security property: a token this type could carry is a
 * token an XSS could steal.
 *
 * Expiry is absent for the same reason. The cookie's own lifetime is the
 * expiry, enforced by the browser (which stops sending it) and by the server
 * (which stops accepting it) — a timestamp mirrored into JavaScript would only
 * ever be a second opinion, and the wrong one when it disagreed.
 *
 * This type is what a signed-in client RENDERS from, not what authenticates it.
 */
export interface Session {
  user: User;
  organization: Organization;
  workspace: Workspace;
  /**
   * How this user wants Kloyya to behave. Collected at onboarding and editable
   * in Settings — before this existed, onboarding asked the questions and then
   * threw the answers away.
   */
  preferences: UserPreferences;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  fullName: string;
  email: string;
  password: string;
}

/**
 * The contract the real backend must satisfy.
 *
 * Every method either resolves or throws `ApiError`. No method returns a
 * discriminated result union: a failed sign-in is exceptional, and forcing every
 * call site to unwrap a union makes the happy path unreadable.
 */
export interface AuthService {
  /** Current session, or null. Cheap: reads the stored token, does not refresh. */
  getSession(): Promise<Session | null>;

  /** Throws 401 on bad credentials, 429 when rate-limited. */
  signIn(input: SignInInput): Promise<Session>;

  /**
   * Creates an unverified user and dispatches a verification code.
   * Throws 409 when the email is already registered.
   */
  signUp(input: SignUpInput): Promise<Session>;

  signOut(): Promise<void>;

  /**
   * Always resolves, even for an unknown address.
   *
   * Returning 404 here would turn the form into an account-enumeration oracle:
   * an attacker could discover which employees have Kloyya accounts by
   * submitting addresses and reading the status code.
   */
  requestPasswordReset(email: string): Promise<void>;

  /**
   * Set a new password, using the recovery session the emailed link established.
   *
   * Throws when there is no such session — an expired or already-used link — so
   * the form can say that plainly instead of appearing to succeed.
   */
  updatePassword(newPassword: string): Promise<void>;

  /** Throws 422 when the code is wrong or expired. */
  verifyEmail(code: string): Promise<Session>;

  resendVerificationCode(): Promise<void>;

  /** Persists onboarding answers and flips `hasCompletedOnboarding`. */
  completeOnboarding(profile: OnboardingProfile): Promise<Session>;

  /**
   * Updates profile, organization, and preferences from Settings. A patch: only
   * the fields present are changed. Throws 401 without a session.
   */
  updateSettings(patch: SettingsPatch): Promise<Session>;
   signInWithGoogle(): Promise<void>;
}

