import type { MentorStreamEvent } from '@devhub/shared';
import { rawRequest } from './api';

/**
 * Streams server-sent events from a POST endpoint. EventSource only supports GET without
 * custom headers, so this reads the fetch body incrementally and parses `data:` frames.
 * Goes through rawRequest, so an expired token is refreshed transparently first.
 */
export async function* streamEvents(
  path: string,
  body: unknown,
  signal: AbortSignal,
): AsyncGenerator<MentorStreamEvent> {
  const res = await rawRequest(path, { method: 'POST', body, signal });
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (data) yield JSON.parse(data) as MentorStreamEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
