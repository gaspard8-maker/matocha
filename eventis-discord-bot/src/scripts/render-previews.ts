/* eslint-disable no-console -- script destiné à l'utilisateur */
/**
 * Génère dans previews/ les aperçus des quatre messages à partir du code réel du bot,
 * sans rien publier sur Discord : index.html (rendu façon Discord), payloads JSON et bannière.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { APIEmbed } from "discord.js";
import { logoPng } from "../branding/logo.js";
import type { OutboundMessage } from "../bot/outbound-message.js";
import { buildSaleMessage, SAMPLE_SALE } from "../sales/sale-message.js";
import { buildTicketMessage } from "../tickets/ticket-message.js";
import { releaseFromForm } from "../updates/update-interactions.js";
import { buildUpdateMessage } from "../updates/update-message.js";
import { renderWelcomeBanner } from "../welcome/banner.js";
import { buildWelcomeMessage } from "../welcome/welcome-message.js";

const OUT = resolve(process.cwd(), "previews");
const MEMBER_ID = "200000000000000001";
const OWNER_ROLE_ID = "100000000000000007";
const NAMES: Record<string, string> = { [MEMBER_ID]: "membre", [OWNER_ROLE_ID]: "Owner" };

function placeholderAvatar(): Buffer {
  const c = createCanvas(256, 256);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#5865F2");
  g.addColorStop(1, "#2b2f8f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(128, 104, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(128, 236, 92, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  return c.toBuffer("image/png");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function md(text: string): string {
  return esc(text)
    .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id: string) => `<span class="mention role">@${NAMES[id] ?? id}</span>`)
    .replace(/&lt;@(\d+)&gt;/g, (_, id: string) => `<span class="mention">@${NAMES[id] ?? id}</span>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\\([*_~`|])/g, "$1")
    .replace(/\n/g, "<br>");
}

function dataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

function attachmentSrc(url: string, message: OutboundMessage): string {
  if (!url.startsWith("attachment://")) return url;
  const file = message.files?.find((f) => f.name === url.slice("attachment://".length));
  return file ? dataUri(file.data) : "";
}

function renderEmbed(e: APIEmbed, message: OutboundMessage): string {
  const color = `#${(e.color ?? 0x1e1f22).toString(16).padStart(6, "0")}`;
  const title = e.title ? `<div class="title${e.url ? " link" : ""}">${md(e.title)}</div>` : "";
  const fields = e.fields?.length
    ? `<div class="fields">${e.fields
        .map((f) => `<div class="field"><div class="fname">${md(f.name)}</div><div class="fvalue">${md(f.value)}</div></div>`)
        .join("")}</div>`
    : "";
  const thumb = e.thumbnail ? `<img class="thumb" src="${attachmentSrc(e.thumbnail.url, message)}">` : "";
  const image = e.image ? `<img class="image" src="${attachmentSrc(e.image.url, message)}">` : "";
  const footer = e.footer
    ? `<div class="footer">${md(e.footer.text)}${e.timestamp ? " • Aujourd’hui à 13:36" : ""}</div>`
    : "";
  return `<div class="embed" style="border-left-color:${color}"><div class="grid"><div class="body">${title}${
    e.description ? `<div class="desc">${md(e.description)}</div>` : ""
  }${fields}</div>${thumb}</div>${image}${footer}</div>`;
}

function renderMessage(label: string, message: OutboundMessage, logo: Buffer): string {
  return `<section><h2>${label}</h2><div class="msg"><img class="avatar" src="${dataUri(logo)}"><div class="main">
  <div class="author">Eventis Bot <span class="app">APP</span> <span class="time">12:38</span></div>
  ${message.content ? `<div class="content">${md(message.content)}</div>` : ""}
  ${message.embeds.map((e) => renderEmbed(e, message)).join("")}</div></div></section>`;
}

const CSS = `
body{margin:0;background:#313338;color:#dbdee1;font:16px/1.375 "gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;padding:24px}
h1{font-size:18px;color:#fff;margin:0 0 4px}p.note{color:#949ba4;font-size:13px;margin:0 0 24px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#949ba4;margin:28px 0 8px}
.msg{display:flex;gap:16px;max-width:760px}.avatar{width:40px;height:40px;border-radius:50%}
.author{color:#f2f3f5;font-weight:600}.app{background:#5865f2;color:#fff;font-size:10px;padding:1px 5px;border-radius:3px;vertical-align:2px;font-weight:600}
.time{color:#949ba4;font-size:12px;font-weight:400;margin-left:4px}
.mention{background:rgba(88,101,242,.3);color:#c9cdfb;border-radius:3px;padding:0 2px;font-weight:500}
.mention.role{background:rgba(16,185,129,.15);color:#10b981}
.embed{background:#2b2d31;border-left:4px solid;border-radius:4px;padding:8px 16px 16px 12px;margin-top:4px;max-width:520px;box-sizing:border-box}
.grid{display:flex;gap:16px}.body{flex:1;min-width:0}
.title{color:#f2f3f5;font-weight:600;margin-top:8px}.title.link{color:#00a8fc}
.desc{font-size:14px;margin-top:8px;white-space:normal}
.fields{display:grid;grid-template-columns:repeat(3,auto);gap:8px 16px;margin-top:8px;justify-content:start}
.fname{font-size:14px;font-weight:600;color:#f2f3f5}.fvalue{font-size:14px}
.thumb{width:80px;height:80px;border-radius:4px;object-fit:cover;margin-top:8px}
.image{display:block;width:100%;max-width:480px;border-radius:4px;margin-top:16px}
.footer{font-size:12px;color:#dbdee1;margin-top:8px}`;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const logo = await logoPng(256);
  const banner = await renderWelcomeBanner(placeholderAvatar());
  writeFileSync(resolve(OUT, "welcome-banner.png"), banner);

  const release = releaseFromForm(
    {
      version: "6.4.2",
      tickets: [
        "Exemple de première modification publiée.",
        "Exemple de deuxième modification publiée.",
        "Exemple de troisième modification publiée.",
      ].join("\n"),
      api: "Exemple de correction de l'API.",
    },
    new Date(),
  );
  const messages: [string, string, OutboundMessage][] = [
    ["ticket", "Capture 1 — Ticket (fil privé)", buildTicketMessage(MEMBER_ID, { kind: "role", id: OWNER_ROLE_ID })],
    ["update", "Capture 2 — Mise à jour (#updates)", buildUpdateMessage(release, logo)],
    [
      "sale",
      "Capture 3 — Vente (#sales-feed, données fictives)",
      buildSaleMessage(SAMPLE_SALE, { timeZone: "Europe/Paris", thumbnailAttachment: { name: "event.png", data: logo } }),
    ],
    ["welcome", "Capture 4 — Bienvenue (#arrivant)", buildWelcomeMessage(MEMBER_ID, banner)],
  ];

  for (const [key, , message] of messages) {
    const json = { ...message, files: message.files?.map((f) => ({ name: f.name, bytes: f.data.length })) };
    writeFileSync(resolve(OUT, `${key}.json`), `${JSON.stringify(json, null, 2)}\n`);
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aperçus Eventis Bot</title><style>${CSS}</style></head><body>
<h1>Aperçus Eventis Bot</h1><p class="note">Rendu local approximatif du thème sombre Discord, généré depuis le code du bot. Aucune publication.</p>
${messages.map(([, label, m]) => renderMessage(label, m, logo)).join("\n")}</body></html>`;
  writeFileSync(resolve(OUT, "index.html"), html);
  console.log(`Aperçus générés dans ${OUT}`);
}

await main();
