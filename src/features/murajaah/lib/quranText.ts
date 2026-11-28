import { FATIHAH, SURAH_PAGE, metaOf } from "../data/quranMeta";

export const MAX_WORDS = 10;
const HAS_LETTER = /[ء-يٱ-ۓۺ-ۼ]/;
const memCache = new Map<string, unknown>();

const normalize = (w: string) =>
  w.replace(/[ً-ٰٟۖ-ۭـ\uFEFF]/g, "").replace(/[ٱأإآ]/g, "ا");

export function tokenize(text: string): string[] {
  const raw = text.replace(/\uFEFF/g, "").trim().split(/\s+/);
  const out: string[] = [];
  let carry = "";
  for (const t of raw) {
    if (!HAS_LETTER.test(t)) {
      if (out.length) out[out.length - 1] += " " + t;
      else carry += t + " ";
    } else {
      out.push(carry + t);
      carry = "";
    }
  }
  return out;
}

export function processWords(s: number, a: number, text: string): string[] {
  let words = tokenize(text);
  if (a === 1 && s !== 1 && s !== 9 && words.length > 4) {
    const head = words
      .slice(0, 4)
      .map(normalize)
      .join(" ")
      .replace(/[۞\s]+/g, " ")
      .trim();
    if (head === "بسم الله الرحمن الرحيم") words = words.slice(4);
  }
  return words;
}

export function splitParts(n: number): [number, number][] {
  const k = Math.max(1, Math.ceil(n / MAX_WORDS));
  const size = Math.max(1, Math.ceil(n / k));
  const parts: [number, number][] = [];
  for (let s = 0; s < n; s += size) parts.push([s, Math.min(n, s + size)]);
  return parts.length ? parts : [[0, 0]];
}

async function fetchJSON(url: string) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

export async function getSurahTexts(
  no: number,
  rasm: "uthmani" | "imlai"
): Promise<string[]> {
  const key = `q_${rasm}_${no}`;
  if (memCache.has(key)) return memCache.get(key) as string[];

  let texts: string[] | null = null;
  try {
    const j = await fetchJSON(
      `https://api.alquran.cloud/v1/surah/${no}/${rasm === "uthmani" ? "quran-uthmani" : "quran-simple"}`
    );
    texts = j.data.ayahs.map((a: { text: string }) => a.text);
  } catch {
    try {
      const f = rasm === "uthmani" ? "uthmani" : "imlaei";
      const j = await fetchJSON(
        `https://api.quran.com/api/v4/quran/verses/${f}?chapter_number=${no}`
      );
      texts = j.verses.map((v: Record<string, string>) => v[`text_${f}`]);
    } catch {
      texts = null;
    }
  }

  if ((!texts || texts.length !== 7) && no === 1) {
    memCache.set(key, FATIHAH);
    return FATIHAH;
  }
  if (!texts || texts.length !== metaOf(no)[3]) throw new Error("fetch failed");
  memCache.set(key, texts);
  return texts;
}

export async function getPage(
  n: number,
  rasm: "uthmani" | "imlai"
): Promise<[number, number, string][]> {
  const key = `p_${rasm}_${n}`;
  if (memCache.has(key)) return memCache.get(key) as [number, number, string][];

  let rows: [number, number, string][] | null = null;
  try {
    const j = await fetchJSON(
      `https://api.alquran.cloud/v1/page/${n}/${rasm === "uthmani" ? "quran-uthmani" : "quran-simple"}`
    );
    rows = j.data.ayahs.map(
      (a: { surah: { number: number }; numberInSurah: number; text: string }) => [
        a.surah.number,
        a.numberInSurah,
        a.text,
      ]
    );
  } catch {
    try {
      const f = rasm === "uthmani" ? "uthmani" : "imlaei";
      const j = await fetchJSON(
        `https://api.quran.com/api/v4/quran/verses/${f}?page_number=${n}`
      );
      rows = j.verses.map((v: Record<string, string>) => {
        const [s, a] = v.verse_key.split(":").map(Number);
        return [s, a, v[`text_${f}`]];
      });
    } catch {
      rows = null;
    }
  }

  if ((!rows || !rows.length) && n === 1) {
    const fallback: [number, number, string][] = FATIHAH.map((t, i) => [1, i + 1, t]);
    memCache.set(key, fallback);
    return fallback;
  }
  if (!rows || !rows.length) throw new Error("fetch failed");
  memCache.set(key, rows);
  return rows;
}

export function estimatePage(s: number, a: number): number {
  const sp = SURAH_PAGE[s - 1];
  const np = s < 114 ? SURAH_PAGE[s] : 604;
  return Math.min(
    604,
    Math.max(1, sp + Math.floor(((a - 1) / metaOf(s)[3]) * (np - sp + 1)))
  );
}

export async function locatePage(
  s: number,
  a: number,
  rasm: "uthmani" | "imlai"
): Promise<number> {
  let p = estimatePage(s, a);
  const key = s * 1000 + a;
  for (let i = 0; i < 12; i++) {
    const rows = await getPage(p, rasm);
    const f = rows[0][0] * 1000 + rows[0][1];
    const l = rows[rows.length - 1][0] * 1000 + rows[rows.length - 1][1];
    if (key < f && p > 1) p--;
    else if (key > l && p < 604) p++;
    else return p;
  }
  return p;
}

export const skel = (w: string) =>
  (w || "")
    .replace(/[ً-ٰٟۖ-ۭـ\uFEFF]/g, "")
    .replace(/[ٱأإآا]/g, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/[^ء-ي]/g, "");

export function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) {
      c[j] = Math.min(
        prev[j] + 1,
        c[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = c;
  }
  return prev[n];
}

export function sim(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const L = Math.max(a.length, b.length);
  return lev(a, b) <= (L <= 2 ? 0 : L <= 4 ? 1 : L <= 8 ? 2 : 3);
}

export const loose = (a: string, b: string) =>
  !!a && !!b && lev(a, b) <= Math.max(1, Math.round(Math.max(a.length, b.length) * 0.4));

export const IGNORE = new Set(
  [
    "اعوذ","أعوذ","بالله","بسم","الله","الرحمن","الرحيم","من","الشيطان","الرجيم","صدق","العظيم",
    "الف","لام","ميم","را","راء","كاف","ها","هاء","يا","ياء","عين","صاد","طا","طاء","سين","حا","حاء","قاف","نون"
  ].map(skel)
);