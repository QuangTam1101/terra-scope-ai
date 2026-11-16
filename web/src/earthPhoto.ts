// NASA Blue Marble Next Generation with topography and bathymetry (December 2004), from NASA Earth Observatory /
// Visible Earth, public domain. Stored at 2048 x 1024 in web/public/earth. Used as a realistic surface: the sea on the
// landing globe and the "Satellite photo" look of the Explore globe. Loaded on demand, once per texture size.
export const BLUE_MARBLE_URL = "/earth/blue-marble-2048.jpg";

const cache = new Map<string, Promise<Uint32Array | null>>();

/** RGBA pixels (little-endian Uint32: 0xAABBGGRR) of the photo resampled to tw x th, or null if it cannot be loaded. */
export function loadBlueMarble(tw: number, th: number): Promise<Uint32Array | null> {
  const key = `${tw}x${th}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = tw; c.height = th;
        const ctx = c.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.imageSmoothingQuality = "high"; ctx.drawImage(im, 0, 0, tw, th);
        resolve(new Uint32Array(ctx.getImageData(0, 0, tw, th).data.buffer));
      };
      im.onerror = () => { cache.delete(key); resolve(null); };
      im.src = BLUE_MARBLE_URL;
    });
    cache.set(key, p);
  }
  return p;
}
