'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { DEMO_CREDENTIALS } from '@/services/auth/mock-auth-service';
import { signInSchema, type SignInValues } from '../schemas';
import { FormError } from './form-error';
import { PasswordInput } from './password-input';

export interface LoginFormProps {
  /**
   * Where to go after a successful sign-in. Already validated by the page —
   * this component must not receive a raw query parameter.
   */
  redirectTo: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await signIn(values);
      router.replace(redirectTo);
    } catch (error) {
      setSubmitError(error);
    }
  });

  // ✅ NOUVEAU : Fonction pour déclencher le flux OAuth Google
  const handleGoogleSignIn = () => {
    // Redirige vers la route d'initiation OAuth de ton API.
    // ⚠️ Vérifie que cette URL correspond bien à ta route d'initiation (GET).
    // Si ta route s'appelle différemment (ex: /api/v1/auth/google), modifie-la ici.
    window.location.href = '/api/v1/integrations/oauth/google';
  };

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="flex-col items-center gap-1.5 text-center">
        <CardTitle as="h1" className="font-serif text-heading-l font-normal">
          Welcome back
        </CardTitle>
        <CardDescription>Sign in to your workspace.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormError error={submitError} />

          <FormField label="Email" error={errors.email?.message} isRequired>
            {(field) => (
              <Input
                {...field}
                {...register('email')}
                type="email"
                autoComplete="username"
                placeholder="you@example.com"
                leadingIcon={<Mail />}
                isInvalid={Boolean(errors.email)}
              />
            )}
          </FormField>

          <FormField label="Password" error={errors.password?.message} isRequired>
            {(field) => (
              <PasswordInput
                {...field}
                {...register('password')}
                autoComplete="current-password"
                isInvalid={Boolean(errors.password)}
              />
            )}
          </FormField>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-caption text-link rounded-sm hover:underline"
            >
              Forgot your password?
            </Link>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel="Signing in"
          >
            Sign in
          </Button>
        </form>

        {/* ✅ NOUVEAU : Séparateur et bouton Google */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full font-medium"
          onClick={handleGoogleSignIn}
        >
          <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Se connecter avec Google
        </Button>
        {/* ✅ FIN NOUVEAU */}

        <p className="text-caption text-muted-foreground mt-6 text-center">
          New to Kloyya?{' '}
          <Link
            href="/signup"
            className="text-link rounded-sm font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>

        <DemoCredentials />
      </CardContent>
    </Card>
  );
}

function DemoCredentials() {
  if (process.env['NEXT_PUBLIC_USE_REAL_API'] === 'true') return null;
  return (
    <div className="border-border mt-6 rounded-sm border border-dashed px-3 py-2.5">
      <p className="text-caption text-muted-foreground">
        <span className="text-foreground font-medium">Demo account.</span> Sign in
        with <span className="font-mono">{DEMO_CREDENTIALS.email}</span> and{' '}
        <span className="font-mono">{DEMO_CREDENTIALS.password}</span>.
      </p>
    </div>
  );
}
