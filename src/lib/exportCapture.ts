import { toJpeg, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/** Visible dashboard frame or a fixed aspect-ratio slide size. */
export type ExportFrameSize =
  | 'viewport'
  | 'hd1080'
  | 'hd720'
  | 'hd1440'
  | 'uhd4k'
  | 'portrait1080'
  | 'square1080'
  | 'fourThree1200';

export type ExportFormat = 'pdf' | 'jpeg';

/** Fixed export sizes sorted by resolution (pixel area), then special aspects. */
export const EXPORT_FRAME_OPTIONS: readonly {
  value: ExportFrameSize;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'viewport', label: 'Screen (current view)', shortLabel: 'Screen' },
  { value: 'hd720', label: '1280×720 — 16:9 HD', shortLabel: '16:9 · 720p' },
  { value: 'hd1080', label: '1920×1080 — 16:9 widescreen', shortLabel: '16:9 · 1080p' },
  { value: 'hd1440', label: '2560×1440 — 16:9 QHD', shortLabel: '16:9 · 1440p' },
  { value: 'uhd4k', label: '3840×2160 — 16:9 4K UHD', shortLabel: '16:9 · 4K' },
  { value: 'square1080', label: '1080×1080 — 1:1 square', shortLabel: '1:1 · square' },
  { value: 'portrait1080', label: '1080×1920 — 9:16 portrait', shortLabel: '9:16 · portrait' },
  { value: 'fourThree1200', label: '1600×1200 — 4:3 classic', shortLabel: '4:3 · classic' },
] as const;

const FIXED_FRAMES: Record<Exclude<ExportFrameSize, 'viewport'>, { width: number; height: number }> = {
  hd1080: { width: 1920, height: 1080 },
  hd720: { width: 1280, height: 720 },
  hd1440: { width: 2560, height: 1440 },
  uhd4k: { width: 3840, height: 2160 },
  portrait1080: { width: 1080, height: 1920 },
  square1080: { width: 1080, height: 1080 },
  fourThree1200: { width: 1600, height: 1200 },
};

/**
 * 16:9 layout used when a preset is not 16:9. Those frames letterbox this layout.
 * 16:9 presets (including 4K) are captured at their own pixel size so the file is
 * sharp instead of an upscale of 1080p.
 */
export const CANONICAL_EXPORT = { width: 1920, height: 1080 } as const;

const CANONICAL_ASPECT = CANONICAL_EXPORT.width / CANONICAL_EXPORT.height;

function isSixteenNine(width: number, height: number): boolean {
  return Math.abs(width / height - CANONICAL_ASPECT) < 0.02;
}

/** Largest 16:9 size that fits inside the target without upscaling. */
function sixteenNineSourceSize(targetWidth: number, targetHeight: number): { width: number; height: number } {
  const widthIfHeightMatches = Math.round(targetHeight * CANONICAL_ASPECT);
  if (widthIfHeightMatches <= targetWidth + 1) {
    return { width: widthIfHeightMatches, height: targetHeight };
  }
  return { width: targetWidth, height: Math.round(targetWidth / CANONICAL_ASPECT) };
}

/**
 * 16:9 presets are captured at their listed pixel size, so 4K is a real 3840×2160
 * render. Other aspects keep a 1080p (or larger, if the frame would upscale it)
 * 16:9 layout and letterbox it in.
 */
function presetCaptureSize(targetWidth: number, targetHeight: number): { width: number; height: number } {
  if (isSixteenNine(targetWidth, targetHeight)) {
    return { width: targetWidth, height: targetHeight };
  }
  const canonicalScale = Math.min(
    targetWidth / CANONICAL_EXPORT.width,
    targetHeight / CANONICAL_EXPORT.height
  );
  if (canonicalScale >= 1) return sixteenNineSourceSize(targetWidth, targetHeight);
  return { width: CANONICAL_EXPORT.width, height: CANONICAL_EXPORT.height };
}

export function exportFrameLabel(frame: ExportFrameSize): string {
  return EXPORT_FRAME_OPTIONS.find(o => o.value === frame)?.label ?? 'Screen';
}

function resolveTargetSize(frame: ExportFrameSize, element: HTMLElement): { width: number; height: number } {
  if (frame !== 'viewport') return FIXED_FRAMES[frame];
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Export image failed to load'));
    img.src = dataUrl;
  });
}

/** Uniform scale + center on white canvas — same dashboard layout, different frame. */
async function letterboxDataUrl(
  pngDataUrl: string,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  format: ExportFormat
): Promise<string> {
  const img = await loadImage(pngDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dstW, dstH);
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const x = (dstW - drawW) / 2;
  const y = (dstH - drawH) / 2;
  ctx.drawImage(img, x, y, drawW, drawH);
  return format === 'jpeg' ? canvas.toDataURL('image/jpeg', 0.95) : canvas.toDataURL('image/png');
}

/** Chart ResizeObservers debounce ~100ms, then re-render SVG text sized for the new frame. */
const CHART_RESIZE_SETTLE_MS = 350;

function waitForLayout(captureWidth: number): Promise<void> {
  const settleMs = captureWidth > CANONICAL_EXPORT.width ? 700 : CHART_RESIZE_SETTLE_MS;
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, settleMs);
      });
    });
  });
}

type SavedStyles = {
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  overflow: string;
  flex: string;
};

function saveElementStyles(el: HTMLElement): SavedStyles {
  return {
    width: el.style.width,
    height: el.style.height,
    minWidth: el.style.minWidth,
    minHeight: el.style.minHeight,
    maxWidth: el.style.maxWidth,
    maxHeight: el.style.maxHeight,
    overflow: el.style.overflow,
    flex: el.style.flex,
  };
}

function restoreElementStyles(el: HTMLElement, saved: SavedStyles) {
  el.style.width = saved.width;
  el.style.height = saved.height;
  el.style.minWidth = saved.minWidth;
  el.style.minHeight = saved.minHeight;
  el.style.maxWidth = saved.maxWidth;
  el.style.maxHeight = saved.maxHeight;
  el.style.overflow = saved.overflow;
  el.style.flex = saved.flex;
}

async function captureAtSize(
  element: HTMLElement,
  width: number,
  height: number,
  image: 'png' | 'jpeg'
): Promise<string> {
  const saved = saveElementStyles(element);
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.minWidth = `${width}px`;
  element.style.minHeight = `${height}px`;
  element.style.maxWidth = `${width}px`;
  element.style.maxHeight = `${height}px`;
  element.style.flex = 'none';
  element.style.overflow = 'hidden';

  await waitForLayout(width);

  const captureOptions = {
    quality: 0.95,
    backgroundColor: '#ffffff',
    width,
    height,
    pixelRatio: 1,
    cacheBust: true,
  };

  try {
    return image === 'jpeg' ? await toJpeg(element, captureOptions) : await toPng(element, captureOptions);
  } finally {
    restoreElementStyles(element, saved);
  }
}

export async function exportDashboardArea(opts: {
  element: HTMLElement;
  frame: ExportFrameSize;
  format: ExportFormat;
  filenameBase: string;
}): Promise<void> {
  const { element, frame, format, filenameBase } = opts;
  const target = resolveTargetSize(frame, element);
  const safeName = filenameBase.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'export';

  let dataUrl: string;

  if (frame === 'viewport') {
    const contentW = element.scrollWidth;
    const contentH = element.scrollHeight;
    const scale = Math.min(target.width / contentW, target.height / contentH);
    const prevOverflow = element.style.overflow;
    element.style.overflow = 'visible';
    try {
      const captureOptions = {
        quality: 0.95,
        backgroundColor: '#ffffff',
        width: target.width,
        height: target.height,
        pixelRatio: 1,
        style: {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${contentW}px`,
          height: `${contentH}px`,
        },
      };
      dataUrl =
        format === 'jpeg'
          ? await toJpeg(element, captureOptions)
          : await toPng(element, captureOptions);
    } finally {
      element.style.overflow = prevOverflow;
    }
  } else {
    const source = presetCaptureSize(target.width, target.height);
    const native =
      source.width === target.width && source.height === target.height;
    if (native) {
      dataUrl = await captureAtSize(element, source.width, source.height, format === 'jpeg' ? 'jpeg' : 'png');
    } else {
      const png = await captureAtSize(element, source.width, source.height, 'png');
      dataUrl = await letterboxDataUrl(
        png,
        source.width,
        source.height,
        target.width,
        target.height,
        format
      );
    }
  }

  if (format === 'jpeg') {
    const link = document.createElement('a');
    link.download = `climate-dashboard-${safeName}.jpg`;
    link.href = dataUrl;
    link.click();
    return;
  }

  const pdf = new jsPDF({
    orientation: target.width > target.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [target.width, target.height],
  });
  pdf.addImage(dataUrl, 'PNG', 0, 0, target.width, target.height);
  const canvasUrl = 'https://climatecanvas.app';
  const footerStripH = Math.min(64, Math.max(36, target.height * 0.07));
  pdf.link(0, target.height - footerStripH, target.width, footerStripH, { url: canvasUrl });
  pdf.save(`climate-dashboard-${safeName}.pdf`);
}
