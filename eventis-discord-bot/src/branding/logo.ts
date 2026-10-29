import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";

const ASSETS_DIR = fileURLToPath(new URL("../../assets/", import.meta.url));

/** Logo EventisPro fourni (un fichier PNG du même nom, s'il est ajouté, est prioritaire). */
export const LOGO_CANDIDATES = ["eventispro-logo.png", "eventispro-logo.webp"].map((f) => `${ASSETS_DIR}${f}`);
export const FONTS_DIR = `${ASSETS_DIR}fonts/`;

let logoImage: Promise<Image> | undefined;
const pngCache = new Map<number, Promise<Buffer>>();

export function loadLogoImage(): Promise<Image> {
  logoImage ??= (async () => {
    const path = LOGO_CANDIDATES.find((p) => existsSync(p));
    if (!path) throw new Error("Logo EventisPro introuvable dans assets/.");
    return loadImage(path);
  })();
  return logoImage;
}

/** Logo EventisPro en PNG carré (pour les miniatures d'embeds). */
export function logoPng(size = 256): Promise<Buffer> {
  let cached = pngCache.get(size);
  if (!cached) {
    cached = (async () => {
      const image = await loadLogoImage();
      const canvas = createCanvas(size, size);
      canvas.getContext("2d").drawImage(image, 0, 0, size, size);
      return canvas.toBuffer("image/png");
    })();
    pngCache.set(size, cached);
  }
  return cached;
}
