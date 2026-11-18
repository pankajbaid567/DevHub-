# ADR 0007: Peer-to-peer WebRTC mesh for session calls

**Status:** Accepted

## Context

Pairing sessions need voice, video and screen sharing for a handful of people. The original MVP's video call never exchanged signalling, so it couldn't connect anyone.

## Options considered

1. **Mesh.** Every participant connects to every other, and the server relays only signalling. No media infrastructure; end-to-end encrypted by default (DTLS-SRTP). Upload bandwidth grows with the number of peers.
2. **SFU** (LiveKit or mediasoup). One upload per participant and scales to large rooms, but it's a media server to run and pay for.
3. **Third-party API** (Twilio or Daily). Fastest to build, but it adds a vendor and cost, and there's nothing to learn from it for a portfolio project.

## Decision

Use a mesh, capped at 6 participants. Signalling goes over the existing authenticated Socket.IO connection:

- `rtc:signal` is forwarded only between sockets in the same call of the same session;
- membership is verified once per peer pair, cluster-wide;
- clients use the perfect negotiation pattern;
- ICE servers come from configuration (STUN by default, TURN optional) and are given only to call participants.

## Consequences

- There's no media server to operate, and signalling scales with the existing Redis adapter.
- Calls above about 6 people, recording, and simulcast need an SFU. The `rtc:*` contract was kept media-agnostic so an SFU can replace the mesh without UI changes.
