import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { BRAND_COLOR_HEX } from "../branding/brand.js";
import { FONTS_DIR, loadLogoImage } from "../branding/logo.js";

/** Proportions de la capture 4 (≈ 600 × 180), rendues en 2x pour la netteté. */
export const BANNER_WIDTH = 1200;
export const BANNER_HEIGHT = 360;

const DISPLAY_FONT = "EventisDisplay";
const WORDMARK_FONT = "EventisWordmark";
let fontsRegistered = false;

function registerFonts(): void {
  if (fontsRegistered) return;
  GlobalFonts.registerFromPath(`${FONTS_DIR}ArchivoBlack-Regular.ttf`, DISPLAY_FONT);
  GlobalFonts.registerFromPath(`${FONTS_DIR}Inter-ExtraBold.ttf`, WORDMARK_FONT);
  fontsRegistered = true;
}

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx: SKRSContext2D): void {
  const base = ctx.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  base.addColorStop(0, "#04100c");
  base.addColorStop(0.55, "#03140f");
  base.addColorStop(1, "#020807");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

  const glows: [number, number, number, string][] = [
    [330, 150, 520, "rgba(16, 185, 129, 0.16)"],
    [900, 60, 420, "rgba(16, 185, 129, 0.07)"],
  ];
  for (const [x, y, r, color] of glows) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(16, 185, 129, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  }
}

function drawLogo(ctx: SKRSContext2D, logo: Image, x: number, y: number, size: number): void {
  ctx.save();
  roundedRect(ctx, x, y, size, size, size * 0.24);
  ctx.clip();
  ctx.drawImage(logo, x, y, size, size);
  ctx.restore();
}

function drawAvatar(ctx: SKRSContext2D, avatar: Image | null): void {
  const cx = 298;
  const cy = 180;
  const r = 104;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#0b1f19";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(16, 185, 129, 0.55)";
  ctx.shadowBlur = 22;
  ctx.lineWidth = 6;
  ctx.strokeStyle = BRAND_COLOR_HEX;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawWelcome(ctx: SKRSContext2D): void {
  const text = "WELCOME";
  const left = 488;
  const targetWidth = 540;
  const stretch = 1.18;
  const fontSize = 76;
  ctx.font = `${fontSize}px ${DISPLAY_FONT}`;
  const natural = ctx.measureText(text).width * stretch;
  const scale = targetWidth / natural;

  ctx.save();
  ctx.translate(left, 180);
  ctx.scale(stretch * scale, scale);
  ctx.textBaseline = "middle";
  const gradient = ctx.createLinearGradient(0, -fontSize / 2, 0, fontSize / 2);
  gradient.addColorStop(0, "#A7F3D0");
  gradient.addColorStop(0.5, "#34D399");
  gradient.addColorStop(1, "#059669");
  ctx.shadowColor = "rgba(16, 185, 129, 0.35)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = gradient;
  ctx.fillText(text, 0, 4);
  ctx.restore();
}

function drawWordmark(ctx: SKRSContext2D, logo: Image): void {
  const right = 1168;
  const cy = 318;
  ctx.font = `28px ${WORDMARK_FONT}`;
  ctx.textBaseline = "middle";
  const proWidth = ctx.measureText("Pro").width;
  const eventisWidth = ctx.measureText("Eventis").width;
  const textLeft = right - proWidth - eventisWidth;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Eventis", textLeft, cy);
  ctx.fillStyle = BRAND_COLOR_HEX;
  ctx.fillText("Pro", textLeft + eventisWidth, cy);
  drawLogo(ctx, logo, textLeft - 50, cy - 20, 40);
}

/** Bannière WELCOME (capture 4) avec l'avatar du membre et le logo EventisPro. */
export async function renderWelcomeBanner(avatarPng: Buffer | null): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
  const ctx = canvas.getContext("2d");
  const logo = await loadLogoImage();
  const avatar = avatarPng ? await loadImage(avatarPng).catch(() => null) : null;

  drawBackground(ctx);
  drawLogo(ctx, logo, 40, 32, 56);
  drawAvatar(ctx, avatar);
  drawWelcome(ctx);
  drawWordmark(ctx, logo);
  return canvas.toBuffer("image/png");
}

const AVATAR_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

/** Télécharge l'avatar depuis le CDN Discord uniquement ; null en cas d'échec (bannière sans photo). */
export async function fetchAvatar(url: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !AVATAR_HOSTS.has(parsed.hostname)) return null;
    const response = await fetchImpl(parsed, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.length > 0 && data.length <= MAX_AVATAR_BYTES ? data : null;
  } catch {
    return null;
  }
}
