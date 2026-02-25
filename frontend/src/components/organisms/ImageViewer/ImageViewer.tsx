import { invoke } from '@tauri-apps/api/core';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

interface ImageFile {
  id: string;
  original_name: string;
}

interface Props {
  file: ImageFile;
  images: ImageFile[];
  onClose: () => void;
}

const ZOOM_STEP = 0.2;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;
const IDLE_MS = 2500;

export default function ImageViewer({ file, images, onClose }: Props) {
  const [currentId, setCurrentId] = useState(file.id);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(true);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentIndex = images.findIndex((f) => f.id === currentId);
  const current = images[currentIndex] ?? file;

  const resetIdle = useCallback(() => {
    setShowControls(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setShowControls(false), IDLE_MS);
  }, []);

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdle]);

  const loadImage = useCallback(async (id: string) => {
    setLoading(true);
    setError('');
    setSrc(null);
    setScale(1);
    setFitScale(1);
    setTranslate({ x: 0, y: 0 });
    try {
      const base64 = await invoke<string>('get_file_data', { fileId: id });
      setSrc(`data:image/*;base64,${base64}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImage(currentId);
  }, [currentId, loadImage]);

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cw = container.clientWidth - 80;
    const ch = container.clientHeight - 80;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (iw === 0 || ih === 0) return;
    const fit = Math.min(cw / iw, ch / ih, 1);
    setFitScale(fit);
    setScale(fit);
  }, []);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentId(images[currentIndex - 1].id);
  }, [currentIndex, images]);

  const goNext = useCallback(() => {
    if (currentIndex < images.length - 1)
      setCurrentId(images[currentIndex + 1].id);
  }, [currentIndex, images]);

  const zoomIn = () => setScale((s) => Math.min(s + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setScale((s) => Math.max(s - ZOOM_STEP, ZOOM_MIN));
  const resetView = () => {
    setScale(fitScale);
    setTranslate({ x: 0, y: 0 });
  };

  const displayPercent =
    fitScale > 0 ? Math.round((scale / fitScale) * 100) : 100;

  useLayoutEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      resetIdle();
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') resetView();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goPrev, goNext, resetIdle, fitScale]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    resetIdle();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = {
      x: e.clientX - translate.x,
      y: e.clientY - translate.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    resetIdle();
    if (!dragging.current) return;
    setTranslate({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    dragging.current = false;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const controlsClass = `transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  return (
    <div
      data-media-modal
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
      onMouseMove={resetIdle}
      onClick={handleBackdropClick}
    >
      {/* 이미지 영역 */}
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-hidden select-none"
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-white/30" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}
        {src && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              ref={imgRef}
              src={src}
              alt={current.original_name}
              draggable={false}
              onLoad={handleImgLoad}
              className="max-w-none rounded-lg shadow-2xl"
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transition: dragging.current
                  ? 'none'
                  : 'transform 0.15s ease-out',
              }}
            />
          </div>
        )}
      </div>

      {/* 닫기 — 우상단 */}
      <button
        onClick={onClose}
        className={`absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all ${controlsClass}`}
      >
        <X size={16} />
      </button>

      {/* 좌우 네비 화살표 */}
      {images.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all ${controlsClass}`}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {currentIndex < images.length - 1 && (
            <button
              onClick={goNext}
              className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:bg-white/20 hover:text-white transition-all ${controlsClass}`}
            >
              <ChevronRight size={20} />
            </button>
          )}
        </>
      )}

      {/* 하단 컨트롤 */}
      <div
        className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm ${controlsClass}`}
      >
        {images.length > 1 && (
          <span className="text-white/40 text-xs tabular-nums px-1">
            {currentIndex + 1}/{images.length}
          </span>
        )}
        <button
          onClick={zoomOut}
          className="p-1 rounded-md text-white/60 hover:text-white transition-colors"
        >
          <Minus size={14} />
        </button>
        <span className="text-white/40 text-xs w-9 text-center tabular-nums">
          {displayPercent}%
        </span>
        <button
          onClick={zoomIn}
          className="p-1 rounded-md text-white/60 hover:text-white transition-colors"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={resetView}
          className="p-1 rounded-md text-white/60 hover:text-white transition-colors"
        >
          <RotateCcw size={12} />
        </button>
      </div>

      {/* 파일명 */}
      <div
        className={`absolute bottom-5 left-5 z-10 text-white/30 text-xs truncate max-w-[30%] ${controlsClass}`}
      >
        {current.original_name}
      </div>
    </div>
  );
}
