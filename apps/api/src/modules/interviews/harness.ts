import { randomBytes } from 'node:crypto';
import type { RunnableProblemLanguage } from '@devhub/shared';
import type { ProblemSuite, TestInput } from './problem-tests.js';

export interface Harness {
  code: string;
  /** Printed before the JSON results, so the solution's own output can't be mistaken for them. */
  marker: string;
}

export type CaseOutput = { ok: true; value: unknown } | { ok: false; error: string };

/**
 * Wraps a solution in a test driver. Only the *inputs* go into the sandbox: expected values
 * stay on the server and are compared there, so a solution can't read the answers, and
 * printing fake results requires already knowing them.
 */
export function buildHarness(
  language: RunnableProblemLanguage,
  kind: ProblemSuite['kind'],
  entry: string,
  inputs: TestInput[],
  userCode: string,
  preamble?: ProblemSuite['preamble'],
): Harness {
  const marker = `__DEVHUB_RESULTS_${randomBytes(8).toString('hex')}__`;
  const json = JSON.stringify(inputs);
  const pyPreamble = preamble?.python ?? '';
  const jsPreamble = preamble?.javascript ?? '';
  if (language === 'python') {
    // A JSON string literal is a valid Python string literal.
    const call =
      kind === 'function'
        ? `__v = ${entry}(*__case)`
        : `__obj = ${entry}(*__case[0][1:])
            __v = [None] + [getattr(__obj, __c[0])(*__c[1:]) for __c in __case[1:]]`;
    return {
      marker,
      code: `${pyPreamble}
${userCode}

def __devhub_run():
    import json as __json
    __out = []
    for __case in __json.loads(${JSON.stringify(json)}):
        try:
            ${call}
            __out.append({"ok": True, "value": __v})
        except Exception as __e:
            __out.append({"ok": False, "error": (type(__e).__name__ + ": " + str(__e))[:300]})
    print(${JSON.stringify(marker)} + __json.dumps(__out, default=str))

__devhub_run()
`,
    };
  }
  const call =
    kind === 'function'
      ? `__v = ${entry}(...__case);`
      : `const __obj = new ${entry}(...__case[0].slice(1));
        __v = [null, ...__case.slice(1).map(([m, ...a]) => { const r = __obj[m](...a); return r === undefined ? null : r; })];`;
  return {
    marker,
    code: `${jsPreamble}
${userCode}
;(() => {
  const __out = [];
  for (const __case of ${json}) {
    try {
      let __v;
      ${call}
      __out.push({ ok: true, value: __v === undefined ? null : __v });
    } catch (__e) {
      __out.push({ ok: false, error: String((__e && __e.name ? __e.name + ': ' : '') + (__e && __e.message !== undefined ? __e.message : __e)).slice(0, 300) });
    }
  }
  console.log(${JSON.stringify(marker)} + JSON.stringify(__out));
})();
`,
  };
}

/** Splits the program's stdout into the solution's own output and the harness results. */
export function parseHarnessOutput(
  stdout: string,
  marker: string,
): { printed: string; outputs: CaseOutput[] | null } {
  const at = stdout.lastIndexOf(marker);
  if (at === -1) return { printed: stdout, outputs: null };
  const line = stdout.slice(at + marker.length).split('\n')[0]!;
  try {
    const outputs = JSON.parse(line) as CaseOutput[];
    return { printed: stdout.slice(0, at), outputs: Array.isArray(outputs) ? outputs : null };
  } catch {
    return { printed: stdout, outputs: null };
  }
}
