'use client';

import { ArrowUp, ArrowRight, ExternalLink, Mic, Paperclip, Volume2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, CardContent, Textarea, toast } from '@/components/ui';
import { LogoMark } from '@/components/brand/logo';
import { trackEvent } from '@/lib/analytics';
import { formatRelativeTime } from '@/lib/format';
import { toErrorPresentation } from '@/lib/error-presentation';
import { canSpeak, speak } from '@/lib/speech';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { services, isApiError, type AskAnswer } from '@/services';

/**
 * Ask Kloyya.
 *
 * A question in, an evidence-backed answer out, with the sources cited beneath
 * it. The product's first principle is visible here: the answer never stands
 * alone — the "Sources" list is what Kloyya was allowed to use, drawn from the
 * user's own connected tools.
 *
 * Two failure modes get their own honest treatment rather than a red error box:
 * the assistant not being configured on this server (`ai_unconfigured`) and the
 * model host being briefly down (`ai_unavailable`). Neither is the user's fault,
 * and the copy says so.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'answered'; answer: AskAnswer }
  | { kind: 'unconfigured' }
  | { kind: 'limit_reached'; message: string }
  | { kind: 'error'; message: string };

export interface AskViewProps {
  /** A question arriving from elsewhere (the dashboard's Ask box) — asked automatically. */
  initialQuestion?: string | undefined;
}

export function AskView({ initialQuestion }: AskViewProps = {}) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const queryClient = useQueryClient();

  const trimmed = question.trim();
  const isLoading = phase.kind === 'loading';
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input: dictate into the same box, review, then send — not an
  // auto-send-on-speech assistant. Silently absent where the browser has no
  // SpeechRecognition (Firefox, notably).
  const { isSupported: canDictate, isListening, start: startDictation, stop: stopDictation } =
    useSpeechToText((transcript) => setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript)));

  // Upload, then move the user straight into asking about what they added —
  // the natural next step, not a toast that leads nowhere.
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      const doc = await services.documents.upload(file);
      toast.success(`Uploaded "${doc.name}".`);
      void submit(`What can you tell me about ${doc.name}?`);
    } catch (error) {
      toast.error(toErrorPresentation(error).title);
    } finally {
      setIsUploading(false);
    }
  }

  async function submit(text: string) {
    const value = text.trim();
    if (value.length === 0 || isLoading) return;
    setPhase({ kind: 'loading' });
    trackEvent('ask_submitted', { length: value.length });
    try {
      const answer = await services.ask.ask(value);
      setPhase({ kind: 'answered', answer });
      // A command created something real — the tasks/projects lists elsewhere
      // in the app need to know, not just this screen.
      if (answer.action?.type === 'task_created') {
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      } else if (answer.action?.type === 'project_created') {
        void queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
    } catch (error) {
      if (isApiError(error) && error.errorCode === 'ai_unconfigured') {
        setPhase({ kind: 'unconfigured' });
        return;
      }
      if (isApiError(error) && error.errorCode === 'ask_limit_reached') {
        setPhase({ kind: 'limit_reached', message: error.description ?? error.message });
        return;
      }
      const message = isApiError(error)
        ? error.message
        : 'Something went wrong. Please try again.';
      setPhase({ kind: 'error', message });
    }
  }

  // A question handed off from elsewhere (e.g. the dashboard's Ask box) is
  // asked immediately — the user already committed to it there.
  useEffect(() => {
    if (initialQuestion && initialQuestion.trim().length > 0) {
      void submit(initialQuestion);
    }
    // Only ever fires from the value the page mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2 text-center">
        <span className="bg-primary/10 inline-flex size-11 items-center justify-center rounded-full">
          <LogoMark decorative animated className="size-6" />
        </span>
        <h1 className="text-heading-m text-foreground font-semibold">Ask Kloyya</h1>
        <p className="text-small text-muted-foreground mx-auto max-w-md">
          Ask anything about your work. Kloyya answers from your connected tools and shows you
          exactly where each answer came from.
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
      >
        <div className="border-border bg-surface focus-within:border-muted rounded-lg border p-2 transition-colors">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit(question);
              }
            }}
            placeholder="What did we decide about the Q3 roadmap?"
            rows={2}
            aria-label="Ask Kloyya a question"
            className="border-0 bg-transparent focus-visible:ring-0"
          />
          <div className="flex justify-end gap-2 px-1 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => void handleFile(event)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              isLoading={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              <span className="sr-only">Upload a document</span>
            </Button>

            {canDictate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-pressed={isListening}
                onClick={() => (isListening ? stopDictation() : startDictation())}
                className={isListening ? 'text-critical animate-pulse' : undefined}
              >
                <Mic aria-hidden="true" />
                <span className="sr-only">
                  {isListening ? 'Stop dictating' : 'Ask by voice'}
                </span>
              </Button>
            ) : null}
            <Button
              type="submit"
              size="icon"
              isDisabled={trimmed.length === 0}
              isLoading={isLoading}
              loadingLabel="Thinking"
            >
              <ArrowUp aria-hidden="true" />
              <span className="sr-only">Ask</span>
            </Button>
          </div>
        </div>
      </form>

      {phase.kind === 'answered' ? <AnswerCard answer={phase.answer} /> : null}

      {phase.kind === 'unconfigured' ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-center">
            <p className="text-body text-foreground font-medium">
              Ask Kloyya isn’t switched on here yet.
            </p>
            <p className="text-small text-muted-foreground mx-auto max-w-sm">
              This workspace doesn’t have an AI provider configured. Once a key is set, Kloyya can
              answer from your connected tools.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {phase.kind === 'limit_reached' ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-center">
            <p className="text-body text-foreground font-medium">
              You’ve used today’s Ask Kloyya questions.
            </p>
            <p className="text-small text-muted-foreground mx-auto max-w-sm">{phase.message}</p>
          </CardContent>
        </Card>
      ) : null}

      {phase.kind === 'error' ? (
        <Card>
          <CardContent className="py-6">
            <p role="alert" className="text-small text-critical text-center">
              {phase.message}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function AnswerCard({ answer }: { answer: AskAnswer }) {
  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-body text-foreground whitespace-pre-wrap">{answer.answer}</p>
          {canSpeak() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => speak(answer.answer)}
            >
              <Volume2 aria-hidden="true" className="size-4" />
              <span className="sr-only">Read answer aloud</span>
            </Button>
          ) : null}
        </div>

        {answer.action ? (
          <Link
            href={answer.action.href}
            className="text-small text-link inline-flex items-center gap-1.5 font-medium"
          >
            {answer.action.type === 'task_created' ? 'View task' : 'View project'}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null}

        {answer.citations.length > 0 ? (
          <section aria-labelledby="ask-sources" className="border-border border-t pt-4">
            <h2 id="ask-sources" className="text-caption text-subtle mb-3 font-medium uppercase">
              Sources
            </h2>
            <ul className="space-y-2">
              {answer.citations.map((citation, index) => (
                <li
                  key={`${citation.source}-${citation.label}-${index}`}
                  className="flex items-start gap-2.5"
                >
                  <ExternalLink aria-hidden="true" className="text-subtle mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="text-small text-foreground block truncate">
                      {citation.label}
                    </span>
                    <span className="text-caption text-subtle">
                      {citation.source} · updated {formatRelativeTime(citation.freshness)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-caption text-subtle border-border border-t pt-4">
            No sources matched — Kloyya answered from what little it could find, or told you it
            couldn’t. Connect more tools to give it more to draw on.
          </p>
        )}

        {answer.usage && answer.usage.remaining !== null ? (
          <p className="text-caption text-subtle flex items-center justify-end gap-2">
            <span>{answer.usage.remaining} questions left today</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
