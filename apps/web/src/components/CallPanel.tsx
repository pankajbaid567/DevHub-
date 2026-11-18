import { useEffect, useRef } from 'react';
import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff, WifiOff } from 'lucide-react';
import type { UserSummary } from '@devhub/shared';
import { useSpeaking, type useCall } from '../lib/useCall';
import { cn, displayName } from '../lib/utils';
import { Avatar } from './ui/primitives';
import { Button } from './ui/Button';

type Call = ReturnType<typeof useCall>;

function Tile({
  stream,
  user,
  muted,
  audio,
  video,
  local,
  connection,
}: {
  stream: MediaStream | null;
  user: Pick<UserSummary, 'username' | 'displayName'>;
  muted: boolean;
  audio: boolean;
  video: boolean;
  local?: boolean;
  connection?: RTCPeerConnectionState;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const speaking = useSpeaking(stream);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const name = displayName(user as UserSummary);
  const showVideo = Boolean(stream?.getVideoTracks().length) && video;
  return (
    <figure
      data-testid={local ? 'call-tile-local' : 'call-tile-remote'}
      className={cn(
        'relative aspect-video overflow-hidden rounded-lg bg-slate-900 ring-2 transition-shadow',
        speaking ? 'ring-success' : 'ring-transparent',
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          'h-full w-full object-cover',
          local && 'scale-x-[-1]',
          !showVideo && 'invisible',
        )}
      />
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={name} size={44} />
        </div>
      )}
      <figcaption className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
        {!audio && <MicOff className="h-3 w-3 text-red-400" aria-label="Muted" />}
        {name}
        {local && ' (you)'}
      </figcaption>
      {connection && connection !== 'connected' && connection !== 'new' && (
        <span className="absolute top-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-amber-300">
          <WifiOff className="h-3 w-3" /> {connection}
        </span>
      )}
    </figure>
  );
}

/** Video call strip: participant tiles plus mic, camera, screen-share and leave controls. */
export function CallPanel({
  call,
  me,
}: {
  call: Call;
  me: { username: string; displayName: string | null };
}) {
  const control = (on: boolean) => (on ? 'secondary' : 'danger');
  return (
    <section aria-label="Video call" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          stream={call.local}
          user={me}
          muted
          audio={call.audio}
          video={call.video || call.screen}
          local
        />
        {call.peers.map((p) => (
          <Tile
            key={p.socketId}
            stream={p.stream}
            user={p.user}
            muted={false}
            audio={p.audio}
            video={p.video || p.screen}
            connection={p.connection}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          size="icon"
          variant={control(call.audio)}
          onClick={call.toggleAudio}
          aria-pressed={!call.audio}
          aria-label={call.audio ? 'Mute microphone' : 'Unmute microphone'}
          disabled={!call.local?.getAudioTracks().length}
        >
          {call.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant={control(call.video)}
          onClick={call.toggleVideo}
          aria-pressed={!call.video}
          aria-label={call.video ? 'Turn camera off' : 'Turn camera on'}
          disabled={!call.local?.getVideoTracks().length}
        >
          {call.video ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant={call.screen ? 'primary' : 'secondary'}
          onClick={() => void call.toggleScreen()}
          aria-pressed={call.screen}
          aria-label={call.screen ? 'Stop sharing screen' : 'Share screen'}
        >
          {call.screen ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={call.leave}
          icon={<PhoneOff className="h-4 w-4" />}
        >
          Leave call
        </Button>
        <span className="text-xs text-muted">{call.peers.length + 1} in call · peer-to-peer</span>
      </div>
    </section>
  );
}
