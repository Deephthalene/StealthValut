import { invoke } from '@tauri-apps/api/core';
import { Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DocFile {
  id: string;
  original_name: string;
}

interface Props {
  file: DocFile;
  onClose: () => void;
}

type DocType = 'pdf' | 'docx' | 'hwp' | 'excel' | 'text' | 'unsupported';

function detectType(name: string): DocType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['hwp', 'hwpx'].includes(ext)) return 'hwp';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel';
  if (
    [
      'txt',
      'md',
      'json',
      'xml',
      'html',
      'htm',
      'log',
      'rtf',
      'yaml',
      'yml',
      'toml',
      'ini',
      'cfg',
      'conf',
      'sh',
      'bat',
      'ps1',
      'py',
      'js',
      'ts',
      'jsx',
      'tsx',
      'css',
      'scss',
      'less',
      'sql',
      'java',
      'c',
      'cpp',
      'h',
      'hpp',
      'rs',
      'go',
      'rb',
      'php',
      'swift',
      'kt',
      'dart',
      'lua',
      'r',
      'pl',
      'env',
    ].includes(ext)
  )
    return 'text';
  return 'unsupported';
}

export default function DocumentViewer({ file, onClose }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const docType = detectType(file.original_name);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const base64 = await invoke<string>('get_file_data', { fileId: file.id });
      const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = '';

      switch (docType) {
        case 'pdf':
          await renderPdf(el, binary);
          break;
        case 'docx':
          await renderDocx(el, binary);
          break;
        case 'hwp':
          await renderHwp(el, binary);
          break;
        case 'excel':
          await renderExcel(el, binary);
          break;
        case 'text':
          renderText(el, binary);
          break;
        default:
          setError(t('document.unsupportedFormat'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [file.id, docType, t]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-media-modal
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-black/40">
        <h2 className="text-white text-sm font-medium truncate max-w-[60%]">
          {file.original_name}
        </h2>
        <div className="flex items-center gap-2">
          {docType === 'pdf' && (
            <>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              >
                <ZoomOut size={18} />
              </button>
              <span className="text-white/60 text-xs min-w-[3rem] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(5, s + 0.25))}
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
              >
                <ZoomIn size={18} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex justify-center">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={36} className="animate-spin text-white/60" />
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}
        <div
          ref={containerRef}
          className="doc-viewer-content"
          style={{
            display: loading ? 'none' : 'block',
            transform: docType === 'pdf' ? `scale(${scale})` : undefined,
            transformOrigin: 'top center',
            padding: '24px',
            maxWidth: docType === 'text' ? '900px' : undefined,
            width: docType === 'text' ? '100%' : undefined,
          }}
        />
      </div>
    </div>
  );
}

async function renderPdf(container: HTMLElement, data: Uint8Array) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const pdf = await pdfjsLib.getDocument({ data }).promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto 16px';
    canvas.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
    canvas.style.borderRadius = '4px';

    await page.render({ canvas, viewport }).promise;
    container.appendChild(canvas);
  }
}

async function renderDocx(container: HTMLElement, data: Uint8Array) {
  const { renderAsync } = await import('docx-preview');
  const wrapper = document.createElement('div');
  wrapper.style.background = '#fff';
  wrapper.style.borderRadius = '8px';
  wrapper.style.padding = '0';
  wrapper.style.maxWidth = '900px';
  wrapper.style.margin = '0 auto';
  wrapper.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
  wrapper.style.overflow = 'hidden';

  container.appendChild(wrapper);
  await renderAsync(
    new Blob([data.buffer as ArrayBuffer]),
    wrapper,
    undefined,
    {
      className: 'docx-viewer',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
    },
  );
}

async function renderHwp(container: HTMLElement, data: Uint8Array) {
  const hwpModule = await import('hwp.js');
  const HWPViewer = hwpModule.Viewer;
  const wrapper = document.createElement('div');
  wrapper.style.maxWidth = '900px';
  wrapper.style.margin = '0 auto';
  wrapper.style.borderRadius = '8px';
  wrapper.style.overflow = 'hidden';
  container.appendChild(wrapper);

  new HWPViewer(wrapper, data, { type: 'binary' });
}

async function renderExcel(container: HTMLElement, data: Uint8Array) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type: 'array' });

  const wrapper = document.createElement('div');
  wrapper.style.maxWidth = '100%';
  wrapper.style.margin = '0 auto';

  workbook.SheetNames.forEach((sheetName: string, idx: number) => {
    const sheet = workbook.Sheets[sheetName];
    const html = XLSX.utils.sheet_to_html(sheet, { editable: false });

    const sheetDiv = document.createElement('div');
    sheetDiv.style.background = '#fff';
    sheetDiv.style.borderRadius = '8px';
    sheetDiv.style.marginBottom = '16px';
    sheetDiv.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
    sheetDiv.style.overflow = 'auto';

    if (workbook.SheetNames.length > 1) {
      const tab = document.createElement('div');
      tab.style.padding = '12px 16px';
      tab.style.borderBottom = '1px solid #e5e7eb';
      tab.style.fontWeight = '600';
      tab.style.fontSize = '14px';
      tab.style.color = '#374151';
      tab.style.background = idx === 0 ? '#f9fafb' : '#fff';
      tab.textContent = sheetName;
      sheetDiv.appendChild(tab);
    }

    const tableWrapper = document.createElement('div');
    tableWrapper.style.padding = '0';
    tableWrapper.style.overflow = 'auto';
    tableWrapper.innerHTML = html;

    const table = tableWrapper.querySelector('table');
    if (table) {
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '13px';

      table.querySelectorAll('td, th').forEach((cell) => {
        const el = cell as HTMLElement;
        el.style.border = '1px solid #e5e7eb';
        el.style.padding = '6px 10px';
        el.style.whiteSpace = 'nowrap';
      });
      table.querySelectorAll('th').forEach((th) => {
        const el = th as HTMLElement;
        el.style.background = '#f3f4f6';
        el.style.fontWeight = '600';
      });
    }

    sheetDiv.appendChild(tableWrapper);
    wrapper.appendChild(sheetDiv);
  });

  container.appendChild(wrapper);
}

function renderText(container: HTMLElement, data: Uint8Array) {
  const decoder = new TextDecoder('utf-8');
  let text = decoder.decode(data);

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const pre = document.createElement('pre');
  pre.textContent = text;
  pre.style.background = '#1e1e2e';
  pre.style.color = '#cdd6f4';
  pre.style.padding = '24px';
  pre.style.borderRadius = '8px';
  pre.style.fontSize = '13px';
  pre.style.lineHeight = '1.6';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-word';
  pre.style.fontFamily = "'Cascadia Code', 'Fira Code', 'Consolas', monospace";
  pre.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
  pre.style.overflow = 'auto';
  pre.style.maxHeight = '100%';

  container.appendChild(pre);
}
