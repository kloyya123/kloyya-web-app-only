'use client';

import { createContext, use, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type {
  OnboardingProfile,
  Session,
  SettingsPatch,
  SignInInput,
  SignUpInput,
} from '@/services/auth/types';

const SESSION_KEY = ['session'] as const;

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  signIn: (input: SignInInput) => Promise<Session>;
  signUp: (input: SignUpInput) => Promise<Session>;
  signOut: () => Promise<void>;
  verifyEmail: (code: string) => Promise<Session>;
  resendVerificationCode: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  completeOnboarding: (profile: OnboardingProfile) => Promise<Session>;
  updateSettings: (patch: SettingsPatch) => Promise<Session>;
  signInWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
  initialSession: Session | null;
}

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const queryClient = useQueryClient();

  const { data: session = null, isPending } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => services.auth.getSession(),
    // ✅ CORRECTION CRUCIALE : 
    // Si initialSession est null, on passe 'undefined'. 
    // Cela force TanStack Query à ignorer initialData et à lancer queryFn côté client.
    initialData: initialSession || undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const commit = (next: Session) => queryClient.setQueryData(SESSION_KEY, next);

  const signInMutation = useMutation({ mutationFn: (input: SignInInput) => services.auth.signIn(input), onSuccess: commit });
  const signUpMutation = useMutation({ mutationFn: (input: SignUpInput) => services.auth.signUp(input), onSuccess: commit });
  const verifyEmailMutation = useMutation({ mutationFn: (code: string) => services.auth.verifyEmail(code), onSuccess: commit });
  const onboardingMutation = useMutation({ mutationFn: (profile: OnboardingProfile) => services.auth.completeOnboarding(profile), onSuccess: commit });
  const settingsMutation = useMutation({ mutationFn: (patch: SettingsPatch) => services.auth.updateSettings(patch), onSuccess: commit });
  
  const signOutMutation = useMutation({
    mutationFn: () => services.auth.signOut(),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading: isPending,
      signIn: signInMutation.mutateAsync,
      signUp: signUpMutation.mutateAsync,
      signOut: signOutMutation.mutateAsync,
      verifyEmail: verifyEmailMutation.mutateAsync,
      resendVerificationCode: () => services.auth.resendVerificationCode(),
      requestPasswordReset: (email: string) => services.auth.requestPasswordReset(email),
      updatePassword: (newPassword: string) => services.auth.updatePassword(newPassword),
      completeOnboarding: onboardingMutation.mutateAsync,
      updateSettings: settingsMutation.mutateAsync,
      signInWithGoogle: () => services.auth.signInWithGoogle(),
    }),
    [
      session,
      isPending,
      signInMutation.mutateAsync,
      signUpMutation.mutateAsync,
      signOutMutation.mutateAsync,
      verifyEmailMutation.mutateAsync,
      onboardingMutation.mutateAsync,
      settingsMutation.mutateAsync,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
