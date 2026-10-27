/** Copy the already drawn yard, without replaying or touching its simulation. */
export function sharePreview(source: HTMLCanvasElement, floor: { left: number; top: number; right: number; bottom: number }): HTMLCanvasElement | null {
  try {
    const box = source.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0 && source.width > 0 && source.height > 0)) return null;
    if (![floor.left, floor.top, floor.right, floor.bottom].every(Number.isFinite)) return null;
    const sx = source.width / box.width;
    const sy = source.height / box.height;
    // The dialog supplies its own frame; leave the yard's walls and open menu-tab gap outside the crop.
    const left = Math.max(0, Math.ceil(floor.left * sx));
    const top = Math.max(0, Math.ceil(floor.top * sy));
    const right = Math.min(source.width, Math.floor(floor.right * sx));
    const bottom = Math.min(source.height, Math.floor(floor.bottom * sy));
    const width = right - left;
    const height = bottom - top;
    if (!(width > 0 && height > 0)) return null;
    const preview = document.createElement('canvas');
    const scale = Math.min(1, 360 / Math.max(width, height));
    preview.width = Math.max(1, Math.round(width * scale));
    preview.height = Math.max(1, Math.round(height * scale));
    const ctx = preview.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, left, top, width, height, 0, 0, preview.width, preview.height);
    return preview;
  } catch { return null; } // Preview availability never holds up sharing.
}
