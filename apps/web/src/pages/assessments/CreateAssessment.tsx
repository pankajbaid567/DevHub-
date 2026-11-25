import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Code,
  ListChecks,
  Layers,
  PenLine,
  ArrowLeft,
  GripVertical,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/primitives';

type SectionType = 'CODING' | 'MCQ' | 'SYSTEM_DESIGN' | 'SUBJECTIVE';

interface McqOption {
  text: string;
  isCorrect: boolean;
}

interface McqQuestion {
  question: string;
  options: McqOption[];
  explanation: string;
}

interface Section {
  type: SectionType;
  title: string;
  durationMinutes: number;
  problems: string[];
  mcqQuestions: McqQuestion[];
  instructions: string;
}

const sectionTypeConfig: Record<SectionType, { icon: typeof Code; label: string; color: string }> = {
  CODING: { icon: Code, label: 'Coding', color: 'text-blue-400' },
  MCQ: { icon: ListChecks, label: 'MCQ', color: 'text-green-400' },
  SYSTEM_DESIGN: { icon: Layers, label: 'System Design', color: 'text-purple-400' },
  SUBJECTIVE: { icon: PenLine, label: 'Subjective', color: 'text-orange-400' },
};

export default function CreateAssessment() {
  useDocumentTitle('Create Assessment');
  const { orgId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [passingScore, setPassingScore] = useState(60);
  const [sections, setSections] = useState<Section[]>([]);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: unknown) =>
      api(`/orgs/${orgId}/assessments`, { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', orgId] });
      toast.success('Assessment created');
      navigate(`/assessments/${orgId}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addSection = (type: SectionType) => {
    setSections((prev) => [
      ...prev,
      {
        type,
        title: sectionTypeConfig[type].label,
        durationMinutes: type === 'MCQ' ? 30 : type === 'CODING' ? 60 : 45,
        problems: [],
        mcqQuestions: [],
        instructions: '',
      },
    ]);
    setExpandedSection(sections.length);
  };

  const updateSection = (idx: number, updates: Partial<Section>) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...updates } : s)));
  };

  const removeSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setExpandedSection(null);
  };

  const addMcqQuestion = (sectionIdx: number) => {
    const section = sections[sectionIdx];
    updateSection(sectionIdx, {
      mcqQuestions: [
        ...section.mcqQuestions,
        { question: '', options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
        ], explanation: '' },
      ],
    });
  };

  const updateMcqQuestion = (sectionIdx: number, qIdx: number, updates: Partial<McqQuestion>) => {
    const section = sections[sectionIdx];
    const updated = section.mcqQuestions.map((q, i) => (i === qIdx ? { ...q, ...updates } : q));
    updateSection(sectionIdx, { mcqQuestions: updated });
  };

  const removeMcqQuestion = (sectionIdx: number, qIdx: number) => {
    const section = sections[sectionIdx];
    updateSection(sectionIdx, {
      mcqQuestions: section.mcqQuestions.filter((_, i) => i !== qIdx),
    });
  };

  const handleSubmit = () => {
    if (!title.trim()) return toast.error('Title is required');
    if (sections.length === 0) return toast.error('Add at least one section');

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      passingScore,
      sections: sections.map((s) => ({
        type: s.type,
        title: s.title,
        durationMinutes: s.durationMinutes,
        problems: s.problems.filter(Boolean),
        mcqQuestions: s.type === 'MCQ' ? s.mcqQuestions : undefined,
        instructions: s.instructions || undefined,
      })),
    });
  };

  const totalDuration = sections.reduce((s, sec) => s + sec.durationMinutes, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/assessments/${orgId}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">Create Assessment</h1>
      </div>

      {/* Basic info */}
      <Card className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. SDE-1 Hiring Challenge"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Assessment description shown to candidates before starting..."
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Passing Score (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={passingScore}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="text-sm text-muted">
            Total Duration: <strong>{totalDuration} min</strong> ({sections.length} section
            {sections.length !== 1 ? 's' : ''})
          </div>
        </div>
      </Card>

      {/* Sections */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Sections</h2>
        {sections.map((section, idx) => {
          const cfg = sectionTypeConfig[section.type];
          const Icon = cfg.icon;
          const isExpanded = expandedSection === idx;

          return (
            <Card key={idx} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2"
                onClick={() => setExpandedSection(isExpanded ? null : idx)}
              >
                <GripVertical className="h-4 w-4 text-muted" />
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div className="flex-1">
                  <span className="font-medium">{section.title}</span>
                  <span className="ml-2 text-sm text-muted">
                    {section.durationMinutes} min · {cfg.label}
                    {section.type === 'MCQ' && ` · ${section.mcqQuestions.length} questions`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSection(idx);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </button>

              {isExpanded && (
                <div className="space-y-4 border-t border-line p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Section Title</label>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => updateSection(idx, { title: e.target.value })}
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Duration (minutes)</label>
                      <input
                        type="number"
                        min={5}
                        value={section.durationMinutes}
                        onChange={(e) => updateSection(idx, { durationMinutes: Number(e.target.value) })}
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium">Instructions</label>
                    <textarea
                      value={section.instructions}
                      onChange={(e) => updateSection(idx, { instructions: e.target.value })}
                      rows={2}
                      placeholder="Instructions shown to candidates for this section..."
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </div>

                  {section.type === 'CODING' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium">
                        Problem Slugs (from problem bank)
                      </label>
                      <input
                        type="text"
                        value={section.problems.join(', ')}
                        onChange={(e) =>
                          updateSection(idx, {
                            problems: e.target.value.split(',').map((s) => s.trim()),
                          })
                        }
                        placeholder="two-sum, reverse-linked-list, lru-cache"
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-muted">Comma-separated problem slugs</p>
                    </div>
                  )}

                  {section.type === 'MCQ' && (
                    <div className="space-y-4">
                      {section.mcqQuestions.map((q, qIdx) => (
                        <div key={qIdx} className="rounded-lg border border-line p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-muted">Q{qIdx + 1}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMcqQuestion(idx, qIdx)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
                          <input
                            type="text"
                            value={q.question}
                            onChange={(e) =>
                              updateMcqQuestion(idx, qIdx, { question: e.target.value })
                            }
                            placeholder="Question text"
                            className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`mcq-${idx}-${qIdx}`}
                                  checked={opt.isCorrect}
                                  onChange={() => {
                                    const newOptions = q.options.map((o, i) => ({
                                      ...o,
                                      isCorrect: i === oIdx,
                                    }));
                                    updateMcqQuestion(idx, qIdx, { options: newOptions });
                                  }}
                                  className="accent-accent"
                                />
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={(e) => {
                                    const newOptions = [...q.options];
                                    newOptions[oIdx] = { ...newOptions[oIdx], text: e.target.value };
                                    updateMcqQuestion(idx, qIdx, { options: newOptions });
                                  }}
                                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                  className="flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
                                />
                              </div>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={q.explanation}
                            onChange={(e) =>
                              updateMcqQuestion(idx, qIdx, { explanation: e.target.value })
                            }
                            placeholder="Explanation (shown after submission)"
                            className="w-full rounded border border-line bg-surface px-2 py-1.5 text-sm"
                          />
                        </div>
                      ))}
                      <Button variant="secondary" size="sm" onClick={() => addMcqQuestion(idx)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add Question
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add section buttons */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(sectionTypeConfig) as [SectionType, (typeof sectionTypeConfig)[SectionType]][]).map(
          ([type, cfg]) => {
            const Icon = cfg.icon;
            return (
              <Button key={type} variant="secondary" size="sm" onClick={() => addSection(type)}>
                <Icon className={`mr-1.5 h-4 w-4 ${cfg.color}`} /> Add {cfg.label} Section
              </Button>
            );
          },
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => navigate(`/assessments/${orgId}`)}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creating...' : 'Create Assessment'}
        </Button>
      </div>
    </div>
  );
}
