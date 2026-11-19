# ADR 0013: A voice interviewer on the Gemini Live API with ephemeral tokens

**Status:** Accepted

## Context

Interview mode needed a way to practise alone. Typing to a chatbot doesn't feel like an interview; speaking does. That means low-latency, two-way audio, with the model able to be interrupted, and it should run on the Gemini free tier the project already uses.

## Options

- **A speech-to-text → chat → text-to-speech pipeline on our server.** Three models, several seconds of latency, no natural interruption, and our servers carry every audio frame.
- **Proxy the Gemini Live WebSocket through the API.** Hides the key, but every replica holds long-lived audio streams, which defeats the stateless scaling story and adds a hop of latency.
- **The browser connects to Gemini Live directly, with an ephemeral token from our API.** One native-audio model (speech in, speech out, built-in voice activity detection and barge-in), no audio through our servers, and the real key stays server-side.

## Decision

The third option. `POST /sessions/:id/interview/voice-token` mints a token with `authTokens.create` (v1alpha) that is:

- **single use**, must be used **within 60 s**, and expires with the interview (at most 30 minutes);
- **constrained**: the model, the interviewer system prompt (including the problem), audio-only responses, input and output transcription, the voice and sliding-window context compression are locked (`lockAdditionalFields: []`). We verified that a client which sends its own system instruction is ignored;
- **rationed**: a live interview session is required (the candidate must wait for the start), with a 15 s per-user cooldown and 10 per user per day, which keeps a public demo inside free-tier quotas.

The browser captures the microphone through an AudioWorklet, downsamples to 16 kHz PCM16 (pure, unit-tested functions), streams it with `sendRealtimeInput`, and plays the 24 kHz replies through a scheduled `AudioBufferSourceNode` queue. On `interrupted` it stops playback immediately. Context is streamed as text: the code every 30 s (only if it changed), each run result, and a "five minutes left" notice from the server-kept deadline. The SDK is loaded lazily (a separate 425 KB chunk), so nobody downloads it unless they press "Start talking".

After hanging up, the transcript (from the model's own transcription) and the final code go to `POST /interview/feedback`, where a text model scores them against the same rubric as the human scorecard. The output is zod-validated before it is stored.

## Consequences

- No audio infrastructure to run or scale; latency is the browser-to-Google round trip (about 4 s from click to the first spoken words in testing, including the microphone, the token and the WebSocket).
- The client depends on Google's WebSocket endpoint being reachable (CSP `connect-src` allows `wss:`).
- Ephemeral tokens are a v1alpha feature, and the model is a preview. Both are configurable (`GEMINI_LIVE_MODEL`), and `VOICE_INTERVIEWER=false` turns the feature off without a deploy of the web app; the panel hides itself.
- It can't run in CI without a key and a microphone. It was verified end to end with a real key by feeding a synthesised spoken answer to Chromium as a fake microphone: the interviewer greeted, the answer was transcribed, the follow-up was relevant, and the feedback referred to the actual half-written code. The server side (token constraints, limits, feedback validation) is covered by integration tests with a fake issuer.
