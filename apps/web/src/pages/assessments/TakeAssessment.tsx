import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock,
  Code,
  ListChecks,
  Layers,
  PenLine,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Shield,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/primitives';

type SectionType = 'CODING' | 'MCQ' | 'SYSTEM_DESIGN' | 'SUBJECTIVE';

interface McqOption { text: string }
interface McqQuestion { question: string; options: McqOption[]; explanation?: string }
interface Section {
  type: SectionType;
  title: string;
  durationMinutes: number;
  problems: string[];
  mcqQuestions?: McqQuestion[];
  instructions?: string;
}
interface AssessmentView {
  id: string;
  title: string;
  description?: string;
  sections: Section[];
  totalDurationMinutes: number;
  status: string;
  startedAt?: string;
  endsAt?: string;
}

const sectionIcon: Record<SectionType, typeof Code> = {
  CODING: Code,
  MCQ: ListChecks,
  SYSTEM_DESIGN: Layers,
  SUBJECTIVE: PenLine,
};

export default function TakeAssessment() {
  const { token } = useParams();
  useDocumentTitle('Assessment');
  const qc = useQueryClient();

  const assessmentQuery = useQuery({
    queryKey: ['assessment-take', token],
    queryFn: () => api<AssessmentView>(`/assess/${token}`),
    enabled: Boolean(token),
  });

  const [started, setStarted] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<number, number | string>>>({});
  const [codingSolutions, setCodingSolutions] = useState<Record<string, Record<string, string>>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const assessment = assessmentQuery.data;

  const startMutation = useMutation({
    mutationFn: () => api(`/assess/${token}/start`, { method: 'POST' }),
    onSuccess: (data: any) => {
      setStarted(true);
      if (data.endsAt) {
        const ms = new Date(data.endsAt).getTime() - Date.now();
        setTimeLeft(Math.max(0, Math.floor(ms / 1000)));
      }
      qc.invalidateQueries({ queryKey: ['assessment-take', token] });
      toast.success('Assessment started — good luck!');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submitMutation = useMutation({
    mutationFn: (body: unknown) => api(`/assess/${token}/submit`, { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Assessment submitted successfully!');
      setStarted(false);
      if (timerRef.current) clearInterval(timerRef.current);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useEffect(() => {
    if (!started || timeLeft === null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0;
        const next = prev - 1;
        if (next === 0) handleAutoSubmit();
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [started]);

  const handleAutoSubmit = useCallback(() => {
    toast.warning('Time is up! Auto-submitting...');
    handleSubmit();
  }, [answers, codingSolutions]);

  const handleSubmit = () => {
    if (!assessment) return;
    const sectionResults = assessment.sections.map((section, sIdx) => {
      if (section.type === 'MCQ') {
        const sectionAnswers = answers[`${sIdx}`] ?? {};
        return {
          sectionIndex: sIdx,
          type: 'MCQ',
          mcqResponses: Object.entries(sectionAnswers).map(([qIdx, answer]) => ({
            questionIndex: Number(qIdx),
            selectedOption: answer as number,
          })),
        };
      }
      if (section.type === 'CODING') {
        const solutions = codingSolutions[`${sIdx}`] ?? {};
        return {
          sectionIndex: sIdx,
          type: 'CODING',
          codingSolutions: Object.entries(solutions).map(([slug, code]) => ({
            problemSlug: slug,
            code,
            language: 'javascript',
          })),
        };
      }
      return {
        sectionIndex: sIdx,
        type: section.type,
        textResponse: answers[`${sIdx}`]?.[0] as string ?? '',
      };
    });

    submitMutation.mutate({ sectionResults });
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  if (assessmentQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted">Loading assessment...</div>
      </div>
    );
  }

  if (assessmentQuery.error || !assessment) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md space-y-3 p-6 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="text-lg font-semibold">Invalid or Expired Link</h2>
          <p className="text-sm text-muted">
            This assessment link is invalid, expired, or has already been submitted.
          </p>
        </Card>
      </div>
    );
  }

  if (assessment.status === 'SUBMITTED' || assessment.status === 'EVALUATED') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md space-y-3 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-400" />
          <h2 className="text-lg font-semibold">Assessment Submitted</h2>
          <p className="text-sm text-muted">
            Your responses have been recorded. You'll be notified when results are available.
          </p>
        </Card>
      </div>
    );
  }

  if (!started && assessment.status === 'INVITED') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Card className="max-w-lg space-y-5 p-8">
          <h1 className="text-2xl font-bold">{assessment.title}</h1>
          {assessment.description && (
            <p className="text-sm text-muted">{assessment.description}</p>
          )}
          <div className="space-y-2 rounded-lg bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted" />
              <span>
                Total Duration: <strong>{assessment.totalDurationMinutes} minutes</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-muted" />
              <span>
                Sections: <strong>{assessment.sections.length}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-muted" />
              <span>This assessment is proctored</span>
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Sections:</h3>
            {assessment.sections.map((s, i) => {
              const Icon = sectionIcon[s.type];
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted" />
                  <span>{s.title}</span>
                  <span className="text-muted">— {s.durationMinutes} min</span>
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-400">
            <strong>Important:</strong> Once you start, the timer cannot be paused. Make sure you
            have a stable internet connection and {assessment.totalDurationMinutes} minutes of
            uninterrupted time.
          </div>
          <Button
            className="w-full"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? 'Starting...' : 'Start Assessment'}
          </Button>
        </Card>
      </div>
    );
  }

  const section = assessment.sections[currentSection];
  const SectionIcon = sectionIcon[section.type];

  return (
    <div className="flex min-h-screen flex-col">
      {/* Timer bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{assessment.title}</span>
          <span className="text-xs text-muted">
            Section {currentSection + 1}/{assessment.sections.length}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-mono font-bold ${
                timeLeft < 300 ? 'bg-red-500/10 text-red-400' : 'bg-surface-2'
              }`}
            >
              <Clock className="h-4 w-4" />
              {formatTime(timeLeft)}
            </div>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={submitMutation.isPending}>
            <Send className="mr-1.5 h-4 w-4" />
            {submitMutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </div>

      {/* Section content */}
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center gap-3">
            <SectionIcon className="h-6 w-6 text-accent" />
            <h2 className="text-xl font-bold">{section.title}</h2>
            <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {section.type.replace('_', ' ')}
            </span>
          </div>

          {section.instructions && (
            <Card className="p-3 text-sm text-muted">{section.instructions}</Card>
          )}

          {section.type === 'MCQ' &&
            section.mcqQuestions?.map((q, qIdx) => (
              <Card key={qIdx} className="space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <span className="rounded bg-accent/10 px-2 py-0.5 text-sm font-bold text-accent">
                    {qIdx + 1}
                  </span>
                  <p className="font-medium">{q.question}</p>
                </div>
                <div className="space-y-2 pl-8">
                  {q.options.map((opt, oIdx) => {
                    const selected = answers[`${currentSection}`]?.[qIdx] === oIdx;
                    return (
                      <label
                        key={oIdx}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                          selected
                            ? 'border-accent bg-accent/5'
                            : 'border-line hover:bg-surface-2'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${currentSection}-${qIdx}`}
                          checked={selected}
                          onChange={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [`${currentSection}`]: {
                                ...prev[`${currentSection}`],
                                [qIdx]: oIdx,
                              },
                            }))
                          }
                          className="accent-accent"
                        />
                        <span>
                          {String.fromCharCode(65 + oIdx)}.{' '}
                          {opt.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Card>
            ))}

          {section.type === 'CODING' && (
            <div className="space-y-4">
              {section.problems.map((slug) => (
                <Card key={slug} className="space-y-3 p-4">
                  <h3 className="font-semibold">{slug}</h3>
                  <textarea
                    value={codingSolutions[`${currentSection}`]?.[slug] ?? ''}
                    onChange={(e) =>
                      setCodingSolutions((prev) => ({
                        ...prev,
                        [`${currentSection}`]: {
                          ...prev[`${currentSection}`],
                          [slug]: e.target.value,
                        },
                      }))
                    }
                    rows={12}
                    placeholder="Write your solution here..."
                    className="w-full rounded-lg border border-line bg-surface font-mono text-sm px-3 py-2"
                    spellCheck={false}
                  />
                </Card>
              ))}
            </div>
          )}

          {(section.type === 'SYSTEM_DESIGN' || section.type === 'SUBJECTIVE') && (
            <Card className="p-4">
              <textarea
                value={(answers[`${currentSection}`]?.[0] as string) ?? ''}
                onChange={(e) =>
                  setAnswers((prev) => ({
                    ...prev,
                    [`${currentSection}`]: { 0: e.target.value },
                  }))
                }
                rows={16}
                placeholder={
                  section.type === 'SYSTEM_DESIGN'
                    ? 'Describe your system design — components, data flow, trade-offs...'
                    : 'Write your answer here...'
                }
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </Card>
          )}
        </div>
      </div>

      {/* Section navigation */}
      <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-surface px-6 py-3">
        <Button
          variant="secondary"
          disabled={currentSection === 0}
          onClick={() => setCurrentSection((p) => p - 1)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <div className="flex gap-1">
          {assessment.sections.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                i === currentSection ? 'bg-accent' : 'bg-surface-2 hover:bg-muted'
              }`}
              onClick={() => setCurrentSection(i)}
            />
          ))}
        </div>
        <Button
          variant="secondary"
          disabled={currentSection === assessment.sections.length - 1}
          onClick={() => setCurrentSection((p) => p + 1)}
        >
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
