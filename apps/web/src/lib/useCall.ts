import { useCallback, useEffect, useRef, useState } from 'react';
import type { IceServer, RtcPeer, RtcSignal } from '@devhub/shared';
import { getSocket } from './socket';

export interface CallPeer extends RtcPeer {
  stream: MediaStream | null;
  connection: RTCPeerConnectionState;
}

interface PeerConn {
  pc: RTCPeerConnection;
  /** Perfect negotiation: on an offer collision the polite peer yields. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export interface CallState {
  joined: boolean;
  joining: boolean;
  local: MediaStream | null;
  audio: boolean;
  video: boolean;
  screen: boolean;
  peers: CallPeer[];
  error: string | null;
}

const INITIAL: CallState = {
  joined: false,
  joining: false,
  local: null,
  audio: false,
  video: false,
  screen: false,
  peers: [],
  error: null,
};

async function getMedia(): Promise<MediaStream | null> {
  const audio = { echoCancellation: true, noiseSuppression: true };
  const video = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };
  for (const constraints of [{ audio, video }, { audio }, { video }]) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      /* try a smaller set of devices */
    }
  }
  return null; // listen-only
}

/**
 * Mesh WebRTC call for a session: every participant holds one RTCPeerConnection per peer.
 * The server only relays signalling between call members; media flows peer to peer.
 * Suitable for small rooms (the server caps calls at 6); an SFU is the path beyond that.
 */
export function useCall(sessionId: string) {
  const [state, setState] = useState<CallState>(INITIAL);
  const conns = useRef(new Map<string, PeerConn>());
  const pending = useRef(new Map<string, RtcSignal[]>());
  const localRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStreamTrack | null>(null);
  const iceRef = useRef<IceServer[]>([]);
  const joinedRef = useRef(false);
  const mediaRef = useRef({ audio: false, video: false, screen: false });

  const patchPeer = useCallback((socketId: string, patch: Partial<CallPeer>) => {
    setState((s) => ({
      ...s,
      peers: s.peers.map((p) => (p.socketId === socketId ? { ...p, ...patch } : p)),
    }));
  }, []);

  const handleSignal = useCallback(
    async (from: string, { description, candidate }: RtcSignal) => {
      const entry = conns.current.get(from);
      if (!entry) {
        // Signal raced ahead of the peer-joined event: hold it until we know the peer.
        pending.current.set(from, [
          ...(pending.current.get(from) ?? []),
          { sessionId, description, candidate } as RtcSignal,
        ]);
        return;
      }
      const { pc } = entry;
      try {
        if (description) {
          const collision =
            description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
          entry.ignoreOffer = !entry.polite && collision;
          if (entry.ignoreOffer) return;
          await pc.setRemoteDescription(description as RTCSessionDescriptionInit);
          if (description.type === 'offer') {
            await pc.setLocalDescription();
            getSocket().emit('rtc:signal', {
              sessionId,
              to: from,
              description: pc.localDescription!.toJSON(),
            });
          }
        } else if (candidate) {
          await pc.addIceCandidate(candidate as RTCIceCandidateInit).catch((err) => {
            if (!entry.ignoreOffer) throw err;
          });
        }
      } catch (err) {
        console.warn('WebRTC signalling error', err);
      }
    },
    [sessionId],
  );

  const addPeer = useCallback(
    (peer: RtcPeer) => {
      const socket = getSocket();
      if (conns.current.has(peer.socketId)) return;
      const pc = new RTCPeerConnection({ iceServers: iceRef.current as RTCIceServer[] });
      const entry: PeerConn = {
        pc,
        polite: (socket.id ?? '') < peer.socketId,
        makingOffer: false,
        ignoreOffer: false,
      };
      conns.current.set(peer.socketId, entry);

      const local = localRef.current;
      for (const t of local?.getTracks() ?? []) {
        if (t.kind === 'video' && screenRef.current) continue; // the screen replaces the camera
        pc.addTrack(t, local!);
      }
      // Always be able to receive both kinds, even when we send nothing.
      if (!local?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
      if (!local?.getVideoTracks().length && !screenRef.current)
        pc.addTransceiver('video', { direction: 'recvonly' });
      if (screenRef.current)
        pc.addTrack(screenRef.current, local ?? new MediaStream([screenRef.current]));

      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          socket.emit('rtc:signal', {
            sessionId,
            to: peer.socketId,
            description: pc.localDescription!.toJSON(),
          });
        } catch (err) {
          console.warn('negotiation failed', err);
        } finally {
          entry.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate)
          socket.emit('rtc:signal', {
            sessionId,
            to: peer.socketId,
            candidate: candidate.toJSON(),
          });
      };
      pc.ontrack = ({ streams, track }) => {
        const stream = streams[0] ?? new MediaStream([track]);
        patchPeer(peer.socketId, { stream });
      };
      pc.onconnectionstatechange = () => {
        patchPeer(peer.socketId, { connection: pc.connectionState });
        if (pc.connectionState === 'failed') pc.restartIce();
      };

      setState((s) => ({
        ...s,
        peers: [
          ...s.peers.filter((p) => p.socketId !== peer.socketId),
          { ...peer, stream: null, connection: 'new' },
        ],
      }));
      for (const sig of pending.current.get(peer.socketId) ?? [])
        void handleSignal(peer.socketId, sig);
      pending.current.delete(peer.socketId);
    },
    [handleSignal, patchPeer, sessionId],
  );

  const removePeer = useCallback((socketId: string) => {
    conns.current.get(socketId)?.pc.close();
    conns.current.delete(socketId);
    pending.current.delete(socketId);
    setState((s) => ({ ...s, peers: s.peers.filter((p) => p.socketId !== socketId) }));
  }, []);

  const closeAll = useCallback(() => {
    for (const id of [...conns.current.keys()]) removePeer(id);
  }, [removePeer]);

  const broadcastState = useCallback(() => {
    if (joinedRef.current) getSocket().emit('rtc:state', { sessionId, ...mediaRef.current });
  }, [sessionId]);

  const enter = useCallback(async () => {
    const res = await getSocket().emitWithAck('rtc:join', {
      sessionId,
      audio: mediaRef.current.audio,
      video: mediaRef.current.video || mediaRef.current.screen,
    });
    if (!res.ok) throw new Error(res.message);
    iceRef.current = res.data.iceServers;
    joinedRef.current = true;
    for (const p of res.data.peers) addPeer(p);
  }, [addPeer, sessionId]);

  const join = useCallback(async () => {
    if (joinedRef.current) return;
    setState((s) => ({ ...s, joining: true, error: null }));
    const local = await getMedia();
    localRef.current = local;
    mediaRef.current = {
      audio: Boolean(local?.getAudioTracks().length),
      video: Boolean(local?.getVideoTracks().length),
      screen: false,
    };
    try {
      await enter();
      setState((s) => ({ ...s, joined: true, joining: false, local, ...mediaRef.current }));
    } catch (err) {
      local?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      setState({
        ...INITIAL,
        error: err instanceof Error ? err.message : 'Could not join the call',
      });
    }
  }, [enter]);

  const leave = useCallback(() => {
    if (!joinedRef.current && !localRef.current) return;
    joinedRef.current = false;
    getSocket().emit('rtc:leave', { sessionId });
    closeAll();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenRef.current?.stop();
    localRef.current = null;
    screenRef.current = null;
    setState(INITIAL);
  }, [closeAll, sessionId]);

  const toggleAudio = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    mediaRef.current.audio = track.enabled;
    setState((s) => ({ ...s, audio: track.enabled }));
    broadcastState();
  }, [broadcastState]);

  const toggleVideo = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    mediaRef.current.video = track.enabled;
    setState((s) => ({ ...s, video: track.enabled }));
    broadcastState();
  }, [broadcastState]);

  const stopScreen = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) return;
    screen.stop();
    screenRef.current = null;
    const camera = localRef.current?.getVideoTracks()[0] ?? null;
    for (const { pc } of conns.current.values()) {
      const sender = pc.getSenders().find((s) => s.track === screen);
      if (sender) await sender.replaceTrack(camera);
    }
    mediaRef.current.screen = false;
    setState((s) => ({ ...s, screen: false }));
    broadcastState();
  }, [broadcastState]);

  const toggleScreen = useCallback(async () => {
    if (screenRef.current) return stopScreen();
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return; // user cancelled the picker
    }
    const screen = display.getVideoTracks()[0]!;
    screenRef.current = screen;
    screen.onended = () => void stopScreen();
    for (const { pc } of conns.current.values()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      // replaceTrack swaps the outgoing video without renegotiation; addTrack renegotiates.
      if (sender) await sender.replaceTrack(screen);
      else pc.addTrack(screen, localRef.current ?? display);
    }
    mediaRef.current.screen = true;
    setState((s) => ({ ...s, screen: true }));
    broadcastState();
  }, [broadcastState, stopScreen]);

  // Socket events for the lifetime of the hook.
  useEffect(() => {
    const socket = getSocket();
    const onJoined = ({ sessionId: sid, peer }: { sessionId: string; peer: RtcPeer }) => {
      if (sid === sessionId && joinedRef.current) addPeer(peer);
    };
    const onLeft = ({ sessionId: sid, socketId }: { sessionId: string; socketId: string }) => {
      if (sid === sessionId) removePeer(socketId);
    };
    const onSignal = (p: RtcSignal & { from: string }) => {
      if (p.sessionId === sessionId && joinedRef.current) void handleSignal(p.from, p);
    };
    const onState = (p: {
      sessionId: string;
      socketId: string;
      audio: boolean;
      video: boolean;
      screen: boolean;
    }) => {
      if (p.sessionId === sessionId)
        patchPeer(p.socketId, { audio: p.audio, video: p.video, screen: p.screen });
    };
    // After a reconnect the server has dropped us from the call (new socket id): rejoin.
    const onReconnect = () => {
      if (!joinedRef.current) return;
      closeAll();
      void enter().catch(() => leave());
    };
    socket.on('rtc:peer-joined', onJoined);
    socket.on('rtc:peer-left', onLeft);
    socket.on('rtc:signal', onSignal);
    socket.on('rtc:state', onState);
    socket.on('connect', onReconnect);
    return () => {
      socket.off('rtc:peer-joined', onJoined);
      socket.off('rtc:peer-left', onLeft);
      socket.off('rtc:signal', onSignal);
      socket.off('rtc:state', onState);
      socket.off('connect', onReconnect);
    };
  }, [addPeer, closeAll, enter, handleSignal, leave, patchPeer, removePeer, sessionId]);

  // Leave the call when the room unmounts.
  useEffect(() => () => leave(), [leave]);

  return { ...state, join, leave, toggleAudio, toggleVideo, toggleScreen };
}

let sharedAudioContext: AudioContext | null = null;

/** True while the stream's audio level is above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track || typeof AudioContext === 'undefined') return;
    sharedAudioContext ??= new AudioContext();
    const ctx = sharedAudioContext;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const id = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setSpeaking(track.enabled && Math.sqrt(sum / data.length) > 0.04);
    }, 200);
    return () => {
      window.clearInterval(id);
      source.disconnect();
      setSpeaking(false);
    };
  }, [stream]);
  return speaking;
}
