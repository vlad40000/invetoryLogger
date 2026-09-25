export interface PreparedPhoto {
  blob: Blob;
  url: string; // object URL for this page load
  width: number;
  height: number;
}

const MAX_EDGE = 1800; // plenty for reading plates; Claude sees ~1.2 MP anyway
const QUALITY = 0.82;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> decode */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Upright, downscaled JPEG of a camera photo — smaller uploads on cellular,
 *  same readability. Falls back to the original file if decoding fails. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  try {
    const d = await decode(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(d.w, d.h));
    const w = Math.max(1, Math.round(d.w * scale));
    const h = Math.max(1, Math.round(d.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(d.src, 0, 0, w, h);
    d.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
    if (!blob) throw new Error('encode failed');
    return { blob, url: URL.createObjectURL(blob), width: w, height: h };
  } catch {
    const okType = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
    if (!okType) throw new Error('unsupported');
    return { blob: file, url: URL.createObjectURL(file), width: 0, height: 0 };
  }
}
