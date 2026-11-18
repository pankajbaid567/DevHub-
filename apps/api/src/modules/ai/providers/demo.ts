import type { AIProvider, GenerateRequest, GenerateResult, StreamResult } from './provider.js';

/**
 * Keyless fallback so the product is fully clickable in a demo or CI without a Gemini key.
 * Every response is labelled as a demo by the API (`isDemo: true`) and the UI shows a banner;
 * nothing here pretends to be a real model.
 */
export class DemoProvider implements AIProvider {
  readonly name = 'demo';
  readonly isDemo = true;

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const last = req.turns[req.turns.length - 1]?.content ?? '';
    if (req.jsonSchema)
      return { text: JSON.stringify(demoJson(req.jsonSchema, last)), model: 'demo' };
    return { text: demoReply(last), model: 'demo' };
  }

  async stream(req: GenerateRequest): Promise<StreamResult> {
    const { text } = await this.generate(req);
    async function* chunks() {
      for (const word of text.split(/(?<=\s)/)) {
        yield word;
        await new Promise((r) => setTimeout(r, 8));
      }
    }
    return { model: 'demo', chunks: chunks() };
  }
}

function demoReply(prompt: string): string {
  const topic = prompt.split(/\s+/).slice(0, 12).join(' ');
  return [
    '> **Demo mode:** no `GEMINI_API_KEY` is configured, so this is a canned response.',
    '',
    `You asked about: _${topic}${prompt.split(/\s+/).length > 12 ? '…' : ''}_`,
    '',
    'A good way to approach most engineering questions:',
    '',
    '1. **Reproduce** the problem with the smallest possible example.',
    '2. **Form a hypothesis** and test one variable at a time.',
    '3. **Read the error and the docs** for the exact versions you use.',
    '4. **Write a test** that fails before the fix and passes after.',
    '',
    '```ts',
    '// Example: guard clauses keep the happy path flat',
    'function parsePort(value: string | undefined): number {',
    "  if (!value) throw new Error('PORT is required');",
    '  const port = Number(value);',
    "  if (!Number.isInteger(port)) throw new Error('PORT must be an integer');",
    '  return port;',
    '}',
    '```',
    '',
    'Set `GEMINI_API_KEY` in `apps/api/.env` to get real, context-aware answers.',
  ].join('\n');
}

/** Builds a schema-shaped object with deterministic, input-derived content. */
function demoJson(schema: Record<string, unknown>, input: string): unknown {
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  if ('overallScore' in props) {
    const words = input.toLowerCase();
    const keywords = [
      'typescript',
      'react',
      'node',
      'sql',
      'docker',
      'aws',
      'testing',
      'ci/cd',
      'system design',
      'kubernetes',
    ];
    const present = keywords.filter((k) => words.includes(k));
    const missing = keywords.filter((k) => !words.includes(k)).slice(0, 5);
    const quantified = (input.match(/\d+%|\d+x|\$\d+|\d{2,}\+?/g) ?? []).length;
    const score = Math.min(95, 45 + present.length * 4 + Math.min(quantified, 6) * 3);
    return {
      overallScore: score,
      summary:
        'Demo analysis based on keyword coverage and quantified impact (no AI key configured).',
      sections: [
        {
          name: 'Impact',
          score: Math.min(95, 40 + quantified * 8),
          strengths: quantified ? ['Uses numbers to show impact'] : [],
          improvements: ['Quantify outcomes: latency, users, revenue, time saved'],
        },
        {
          name: 'Skills',
          score: Math.min(95, 40 + present.length * 7),
          strengths: present.map((k) => `Mentions ${k}`),
          improvements: missing.map((k) => `Consider ${k} if you have real experience`),
        },
      ],
      atsKeywords: { present, missing },
      topActions: [
        'Lead each bullet with a strong verb',
        'Add metrics to your top three achievements',
        'Tailor keywords to the job description',
      ],
    };
  }
  if ('verdict' in props) {
    // Offline triage heuristic: links, shouting, repeated characters and spam phrases.
    const text = input.toLowerCase();
    const links = (text.match(/https?:\/\//g) ?? []).length;
    const spammy = /(buy now|cheap|discount|crypto|casino|click here|free money|whatsapp)/.test(
      text,
    );
    const abusive = /(idiot|stupid|moron|shut up|trash dev)/.test(text);
    if (spammy || links >= 3)
      return {
        verdict: 'likely_violation',
        category: 'spam',
        confidence: 0.8,
        reason: 'Promotional language or many links (demo heuristic).',
      };
    if (abusive)
      return {
        verdict: 'likely_violation',
        category: 'abuse',
        confidence: 0.75,
        reason: 'Insulting language (demo heuristic).',
      };
    return {
      verdict: 'likely_ok',
      category: 'none',
      confidence: 0.6,
      reason: 'No spam or abuse signals found (demo heuristic).',
    };
  }
  if ('roadmap' in props) {
    return {
      level: 'intermediate',
      summary:
        'Demo assessment (no AI key configured): build depth in your strongest skill and close one gap at a time.',
      strengths: ['Consistent self-assessment across core skills'],
      gaps: ['Testing strategy', 'System design fundamentals'],
      roadmap: [
        { phase: 'Foundations', weeks: 4, focus: ['Testing pyramid', 'Debugging tools'] },
        { phase: 'Depth', weeks: 6, focus: ['Data modelling', 'Caching', 'Queues'] },
        {
          phase: 'Showcase',
          weeks: 4,
          focus: ['Ship a project end to end', 'Write a technical post'],
        },
      ],
    };
  }
  return {};
}
