// Menu extraction for the sign-up flow (issue #11): turn an uploaded source
// (raw text, a website link, or a menu image) into the §menu_parser JSON using
// DigitalOcean Gradient serverless inference. Text/URL reuse parseMenuText
// (Gradient + deterministic price verification); images use the multimodal
// model. Falls back to the deterministic mock parser when no key is present.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { complete, haveKey } from "../runtime/gradient.mjs";
import { parseMenuText } from "./parse.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const instructions = readFileSync(resolve(__dir, "..", "instructions", "menu_parser.md"), "utf8");

function extractJson(text) {
  const s = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("menu parser returned no JSON object");
  return JSON.parse(s.slice(a, b + 1));
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Basic SSRF guard: public http(s) only, no localhost / private ranges.
export function assertPublicUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("url must be http(s)");
  const host = u.hostname.toLowerCase();
  const blocked =
    host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("url host not allowed");
  return u;
}

async function fetchUrlText(url) {
  const u = assertPublicUrl(url);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  let res;
  try {
    res = await fetch(u, { redirect: "follow", signal: ctl.signal, headers: { "user-agent": "rollaway-menu-extractor" } });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const text = stripHtml(await res.text()).slice(0, 20000);
  if (!text) throw new Error("no readable text at that link");
  return text;
}

export function toPlainText(items = []) {
  return items
    .map((i) => `${i.name} — $${Number(i.price).toFixed(2).replace(/\.00$/, "")}`)
    .join("\n");
}

async function extractFromImage({ image_data_url, vendor_id, vendor_type }) {
  if (!haveKey()) throw new Error("image extraction requires a Gradient vision model (GRADIENT_API_KEY)");
  const output = await complete(
    [
      { role: "system", content: instructions },
      {
        role: "user",
        content: [
          { type: "text", text: `Vendor id: ${vendor_id}\nVendor type: ${vendor_type}\nExtract the menu items and prices visible in this image.` },
          { type: "image_url", image_url: { url: image_data_url } },
        ],
      },
    ],
    { max_tokens: 1400, temperature: 0 },
  );
  let parsed;
  try {
    parsed = extractJson(output);
  } catch {
    // Blank/unreadable image: the model answered in prose, not menu JSON.
    // Return no items so the caller shows a friendly "try a clearer photo".
    return { vendor_id: String(vendor_id), vendor_type: String(vendor_type), currency: "USD", items: [] };
  }
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => ({
      name: String(it && it.name || "").trim(),
      keywords: Array.isArray(it && it.keywords)
        ? it.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 12)
        : [],
      price: Number(it && it.price),
    }))
    .filter((it) => it.name && Number.isFinite(it.price));
  return { vendor_id: String(vendor_id), vendor_type: String(vendor_type), currency: parsed.currency || "USD", items };
}

// payload: { input_type: 'text'|'url'|'image', text?, url?, image_data_url?, vendor_id?, vendor_type?, mock? }
export async function extractMenu(payload = {}) {
  const {
    input_type,
    text,
    url,
    image_data_url,
    vendor_id = "vendor",
    vendor_type = "unknown",
    mock = false,
  } = payload;

  let result;
  if (input_type === "url" || (!input_type && url)) {
    result = await parseMenuText({ text: await fetchUrlText(url), vendor_id, vendor_type, mock });
  } else if (input_type === "image" || (!input_type && image_data_url)) {
    result = await extractFromImage({ image_data_url, vendor_id, vendor_type });
  } else {
    result = await parseMenuText({ text, vendor_id, vendor_type, mock });
  }
  return { ok: true, ...result, plain_text: toPlainText(result.items) };
}
