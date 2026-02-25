import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoFile {
  id: string;
  original_name: string;
}

interface Props {
  file: VideoFile;
  videos: VideoFile[];
  onClose: () => void;
}

function getStreamUrl(fileId: string): string {
  return convertFileSrc(fileId, 'stream');
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

const IDLE_MS = 2500;

export default function VideoPlayer({ file, videos, onClose }: Props) {
  const [cur, setCur] = useState(file);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [showUi, setShowUi] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const idleT = useRef<ReturnType<typeof setTimeout>>();
  const seekingRef = useRef(false);
  const hoverBarRef = useRef(false);

  const idx = videos.findIndex((v) => v.id === cur.id);

  const resetIdle = useCallback(() => {
    setShowUi(true);
    clearTimeout(idleT.current);
    idleT.current = setTimeout(() => {
      if (!hoverBarRef.current) setShowUi(false);
    }, IDLE_MS);
  }, []);

  // signal other media to pause
  useEffect(() => {
    window.dispatchEvent(new Event('vault-media-play'));
  }, []);

  const nav = useCallback(
    (d: -1 | 1) => {
      const i = videos.findIndex((v) => v.id === cur.id) + d;
      if (i >= 0 && i < videos.length) {
        setCur(videos[i]);
        setLoading(true);
        setTime(0);
        setDuration(0);
      }
    },
    [videos, cur],
  );

  useEffect(() => {
    setCur(file);
    setLoading(true);
  }, [file]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!seekingRef.current) setTime(v.currentTime);
    };
    const onDur = () => setDuration(v.duration);
    const onPlay = () => {
      setPlaying(true);
      window.dispatchEvent(new Event('vault-media-play'));
    };
    const onPause = () => setPlaying(false);
    const onWait = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onCan = () => setLoading(false);
    const onEnd = () => {
      if (idx < videos.length - 1) nav(1);
      else setPlaying(false);
    };

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWait);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onCan);
    v.addEventListener('ended', onEnd);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWait);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onCan);
      v.removeEventListener('ended', onEnd);
    };
  }, [idx, videos.length, nav]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      resetIdle();
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case ' ':
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) nav(-1);
          else {
            e.preventDefault();
            v.currentTime = Math.max(0, v.currentTime - 5);
          }
          break;
        case 'ArrowRight':
          if (e.shiftKey) nav(1);
          else {
            e.preventDefault();
            v.currentTime = Math.min(v.duration, v.currentTime + 5);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          setVolume(v.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          setVolume(v.volume);
          break;
        case 'f':
        case 'F':
          document.fullscreenElement
            ? document.exitFullscreen()
            : wrapRef.current?.requestFullscreen().catch(() => {});
          break;
        case 'm':
        case 'M':
          v.muted = !v.muted;
          setMuted(v.muted);
          break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, nav, resetIdle]);

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  useEffect(() => {
    resetIdle();
    return () => clearTimeout(idleT.current);
  }, [resetIdle]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }, []);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen().catch(() => {});
  }, []);

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
    const v = videoRef.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    v.currentTime = ratio * duration;
    setTime(v.currentTime);
  };

  // prevent double-click text selection
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const handleLayerClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = undefined;
      toggleFs();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = undefined;
        togglePlay();
      }, 250);
    }
  }, [togglePlay, toggleFs]);

  const progress = duration > 0 ? (time / duration) * 100 : 0;
  const vis = showUi || loading;
  const uiClass = `transition-opacity duration-300 ${vis ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  return (
    <div
      ref={wrapRef}
      data-media-modal
      className={`fixed inset-0 z-[60] bg-black select-none ${!vis && playing ? 'cursor-none' : ''}`}
    >
      {/* Video layer (no pointer-events, purely visual) */}
      <video
        ref={videoRef}
        key={cur.id}
        src={getStreamUrl(cur.id)}
        autoPlay
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        style={{ outline: 'none' }}
      />

      {/* Transparent interaction layer - ALWAYS captures mouse events */}
      <div
        className="absolute inset-0 z-[1] cursor-pointer"
        onMouseMove={resetIdle}
        onClick={handleLayerClick}
      />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <Loader2 size={48} className="animate-spin text-white/50" />
        </div>
      )}

      {/* Center play button (paused only) */}
      {!loading && !playing && (
        <button
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-5 rounded-full bg-white/10 backdrop-blur-md text-white hover:bg-white/20 transition-all"
        >
          <Play size={40} fill="white" />
        </button>
      )}

      {/* Top gradient */}
      <div
        className={`absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none ${uiClass}`}
      />

      {/* Top bar */}
      <div
        className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between px-5 pt-4 ${uiClass}`}
      >
        <p className="text-sm text-white/90 font-medium truncate max-w-[60%]">
          {cur.original_name}
        </p>
        <div className="flex items-center gap-2">
          {videos.length > 1 && (
            <span className="text-xs text-white/50 tabular-nums">
              {idx + 1} / {videos.length}
            </span>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Side nav */}
      {idx > 0 && (
        <button
          onClick={() => nav(-1)}
          className={`absolute left-3 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all ${uiClass}`}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < videos.length - 1 && (
        <button
          onClick={() => nav(1)}
          className={`absolute right-3 top-1/2 -translate-y-1/2 z-30 p-2.5 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all ${uiClass}`}
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Bottom gradient */}
      <div
        className={`absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none ${uiClass}`}
      />

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 inset-x-0 z-30 px-5 pb-4 ${uiClass}`}
        onMouseEnter={() => {
          hoverBarRef.current = true;
        }}
        onMouseLeave={() => {
          hoverBarRef.current = false;
        }}
      >
        {/* Seek bar */}
        <div
          ref={seekRef}
          className="group relative w-full h-5 flex items-center cursor-pointer mb-2"
          onMouseDown={handleSeekDown}
        >
          <div className="absolute inset-x-0 h-1 group-hover:h-1.5 bg-white/20 rounded-full transition-all">
            <div
              className="h-full bg-primary rounded-full relative transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="p-1.5 text-white hover:text-white/80 transition-colors"
          >
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>

          <div className="group/vol flex items-center gap-1.5">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
              className="p-1 text-white/70 hover:text-white transition-colors"
            >
              {muted || volume === 0 ? (
                <VolumeX size={18} />
              ) : (
                <Volume2 size={18} />
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
                  const val = Number(e.target.value);
                  setVolume(val);
                  if (videoRef.current) videoRef.current.volume = val;
                  if (val > 0) setMuted(false);
                }}
                className="w-20 h-1 accent-white cursor-pointer"
              />
            </div>
          </div>

          <span className="text-xs text-white/60 tabular-nums ml-1">
            {fmt(time)}
            <span className="text-white/30 mx-1">/</span>
            {fmt(duration)}
          </span>

          <div className="flex-1" />

          <button
            onClick={toggleFs}
            className="p-1.5 text-white/70 hover:text-white transition-colors"
          >
            {isFs ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
