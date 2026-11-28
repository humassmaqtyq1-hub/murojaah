import { supabase, getUserKey } from "../../../lib/supabase";

export interface MurajaahPrefs {
  view_mode: "ayah" | "page";
  check_mode: "instant" | "end";
  level: "easy" | "hard";
  rasm: "uthmani" | "imlai";
  stop_mode: boolean;
  last_surah: number;
  last_page: number;
}

export const DEFAULT_PREFS: MurajaahPrefs = {
  view_mode: "ayah",
  check_mode: "instant",
  level: "easy",
  rasm: "uthmani",
  stop_mode: true,
  last_surah: 1,
  last_page: 1,
};

export async function loadPrefsOnline(): Promise<MurajaahPrefs> {
  const userKey = getUserKey();
  const { data, error } = await supabase
    .from("murajaah_prefs")
    .select("*")
    .eq("user_key", userKey)
    .maybeSingle();

  if (error || !data) return DEFAULT_PREFS;
  return {
    view_mode: data.view_mode ?? "ayah",
    check_mode: data.check_mode ?? "instant",
    level: data.level ?? "easy",
    rasm: data.rasm ?? "uthmani",
    stop_mode: data.stop_mode ?? true,
    last_surah: data.last_surah ?? 1,
    last_page: data.last_page ?? 1,
  };
}

export async function savePrefsOnline(patch: Partial<MurajaahPrefs>) {
  const userKey = getUserKey();
  const current = await loadPrefsOnline();
  await supabase.from("murajaah_prefs").upsert(
    {
      user_key: userKey,
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_key" }
  );
}

export async function loadAllProgressOnline(): Promise<Record<number, number[]>> {
  const userKey = getUserKey();
  const { data, error } = await supabase
    .from("murajaah_progress")
    .select("surah_no, done_ayahs")
    .eq("user_key", userKey);

  if (error || !data) return {};
  const map: Record<number, number[]> = {};
  for (const row of data) {
    map[row.surah_no] = Array.isArray(row.done_ayahs) ? row.done_ayahs : [];
  }
  return map;
}

export async function saveSurahProgressOnline(
  surahNo: number,
  doneIndices: number[],
  lastAyahIdx = 0
) {
  const userKey = getUserKey();
  await supabase.from("murajaah_progress").upsert(
    {
      user_key: userKey,
      surah_no: surahNo,
      done_ayahs: doneIndices,
      last_ayah_idx: lastAyahIdx,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_key,surah_no" }
  );
}