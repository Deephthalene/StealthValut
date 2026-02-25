import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ChevronUp,
  ListMusic,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioFile {
  id: string;
  original_name: string;
  thumbnail_base64?: string;
}

interface Props {
  file: AudioFile;
  playlist: AudioFile[];
  onClose: () => void;
  onFileChange?: (file: AudioFile) => void;
}

function getStreamUrl(fileId: string): string {
  return convertFileSrc(fileId, 'stream');
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  file,
  playlist,
  onClose,
  onFileChange,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [currentFile, setCurrentFile] = useState(file);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seekingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const currentIdx = playlist.findIndex((f) => f.id === currentFile.id);

  const playFile = useCallback(
    (f: AudioFile) => {
      setCurrentFile(f);
      onFileChange?.(f);
    },
    [onFileChange],
  );

  const navigate = useCallback(
    (dir: -1 | 1) => {
      const idx = playlist.findIndex((f) => f.id === currentFile.id);
      const next = idx + dir;
      if (next >= 0 && next < playlist.length) {
        playFile(playlist[next]);
      }
    },
    [playlist, currentFile, playFile],
  );

  useEffect(() => {
    setCurrentFile(file);
  }, [file]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setLoadError(null);
    audio.src = getStreamUrl(currentFile.id);
    audio.load();
    // play()가 스트림 로딩 전/정책으로 reject될 수 있음. 실제 재생은 나중에 될 수 있어서 여기서는 에러 안 띄움
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }, [currentFile]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (!seekingRef.current) setCurrentTime(audio.currentTime);
    };
    const onDur = () => setDuration(audio.duration);
    const onEnd = () => {
      if (currentIdx < playlist.length - 1) navigate(1);
      else setPlaying(false);
    };
    const onPlay = () => {
      setPlaying(true);
      setLoadError(null);
    };
    const onPause = () => setPlaying(false);
    const onCanPlay = () => setLoadError(null);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('canplay', onCanPlay);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDur);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, [currentIdx, playlist.length, navigate]);

  // pause when another media (video) starts playing
  useEffect(() => {
    const handler = () => {
      audioRef.current?.pause();
    };
    window.addEventListener('vault-media-play', handler);
    return () => window.removeEventListener('vault-media-play', handler);
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setPlaying(false));
    }
  };

  // custom seek bar drag
  const handleSeekDown = (e: React.MouseEvent<HTMLDivElement>) => {
    seekingRef.current = true;
    applySeek(e.nativeEvent);
    const onMove = (ev: MouseEvent) => applySeek(ev);
    const onUp = () => {
      seekingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const applySeek = (e: MouseEvent) => {
    const bar = seekRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setMuted(!muted);
    audio.muted = !muted;
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        if (document.querySelector('[data-media-modal]')) return;
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // scroll current track into view when playlist opens
  useEffect(() => {
    if (showPlaylist && listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [showPlaylist, currentFile.id]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        onError={() => setLoadError('오디오를 불러올 수 없습니다.')}
      />

      {/* Playlist panel */}
      {showPlaylist && (
        <div className="fixed bottom-[60px] right-3 z-50 w-80 max-h-80 bg-card/95 backdrop-blur-xl border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-medium flex items-center gap-2">
              <ListMusic size={14} className="text-muted-foreground" />
              재생목록
            </span>
            <span className="text-xs text-muted-foreground">
              {playlist.length}곡
            </span>
          </div>
          <div ref={listRef} className="overflow-auto max-h-64">
            {playlist.map((f, i) => {
              const active = f.id === currentFile.id;
              return (
                <button
                  key={f.id}
                  data-active={active}
                  onClick={() => playFile(f)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50 ${
                    active ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="shrink-0 w-8 h-8 rounded overflow-hidden bg-accent/30 flex items-center justify-center">
                    {f.thumbnail_base64 ? (
                      <img
                        src={`data:image/jpeg;base64,${f.thumbnail_base64}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music size={14} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${active ? 'text-primary font-medium' : ''}`}
                    >
                      {f.original_name}
                    </p>
                  </div>
                  {active && playing && (
                    <div className="shrink-0 flex items-end gap-[2px] h-3">
                      <span
                        className="w-[3px] bg-primary rounded-full animate-pulse"
                        style={{ height: '60%', animationDelay: '0ms' }}
                      />
                      <span
                        className="w-[3px] bg-primary rounded-full animate-pulse"
                        style={{ height: '100%', animationDelay: '150ms' }}
                      />
                      <span
                        className="w-[3px] bg-primary rounded-full animate-pulse"
                        style={{ height: '40%', animationDelay: '300ms' }}
                      />
                    </div>
                  )}
                  {!active && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mini player */}
      <div className="fixed bottom-0 left-48 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border">
        {/* Seek bar (full width thin line at top) */}
        <div
          ref={seekRef}
          className="group absolute top-0 inset-x-0 h-3 -translate-y-1/2 cursor-pointer z-10"
          onMouseDown={handleSeekDown}
        >
          <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-[3px] group-hover:h-[5px] bg-muted transition-all">
            <div
              className="h-full bg-primary rounded-r-full relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2">
          {/* Thumbnail + equalizer */}
          <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-accent/30 flex items-center justify-center shadow-sm relative">
            {currentFile.thumbnail_base64 ? (
              <img
                src={`data:image/jpeg;base64,${currentFile.thumbnail_base64}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Music size={20} className="text-muted-foreground" />
            )}
            {playing && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-[2px]">
                <span
                  className="w-[3px] rounded-full bg-white animate-bounce"
                  style={{
                    height: 10,
                    animationDuration: '0.4s',
                    animationDelay: '0ms',
                  }}
                />
                <span
                  className="w-[3px] rounded-full bg-white animate-bounce"
                  style={{
                    height: 14,
                    animationDuration: '0.4s',
                    animationDelay: '0.12s',
                  }}
                />
                <span
                  className="w-[3px] rounded-full bg-white animate-bounce"
                  style={{
                    height: 8,
                    animationDuration: '0.4s',
                    animationDelay: '0.24s',
                  }}
                />
                <span
                  className="w-[3px] rounded-full bg-white animate-bounce"
                  style={{
                    height: 12,
                    animationDuration: '0.4s',
                    animationDelay: '0.08s',
                  }}
                />
              </div>
            )}
          </div>

          {/* Title + Time */}
          <div className="min-w-0 w-40 shrink-0">
            <p className="text-sm font-medium truncate">
              {currentFile.original_name}
            </p>
            {loadError ? (
              <p className="text-xs text-rose-500 mt-0.5">{loadError}</p>
            ) : (
              <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                {formatTime(currentTime)} / {formatTime(duration)}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate(-1)}
              disabled={currentIdx <= 0}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
            >
              <SkipBack size={16} />
            </button>
            <button
              onClick={togglePlay}
              className="p-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mx-1"
            >
              {playing ? (
                <Pause size={16} />
              ) : (
                <Play size={16} className="ml-0.5" />
              )}
            </button>
            <button
              onClick={() => navigate(1)}
              disabled={currentIdx >= playlist.length - 1}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-30"
            >
              <SkipForward size={16} />
            </button>
          </div>

          <div className="flex-1" />

          {/* Volume */}
          <div className="group/vol flex items-center gap-1">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              {muted || volume === 0 ? (
                <VolumeX size={16} className="text-muted-foreground" />
              ) : (
                <Volume2 size={16} className="text-muted-foreground" />
              )}
            </button>
            <div className="w-0 group-hover/vol:w-20 overflow-hidden transition-all duration-200">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (audioRef.current) audioRef.current.volume = v;
                  if (v > 0) setMuted(false);
                }}
                className="w-20 h-1 accent-primary cursor-pointer"
              />
            </div>
          </div>

          {/* Playlist toggle */}
          <button
            onClick={() => setShowPlaylist((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${
              showPlaylist
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-accent text-muted-foreground'
            }`}
            title="재생목록"
          >
            {showPlaylist ? <ChevronUp size={16} /> : <ListMusic size={16} />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
