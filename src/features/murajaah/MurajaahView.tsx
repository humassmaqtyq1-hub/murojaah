import React, { useEffect, useRef, useState } from "react";
import { BASMALAH, META, juzOf, metaOf } from "./data/quranMeta";
import {
  IGNORE,
  getPage,
  getSurahTexts,
  locatePage,
  loose,
  processWords,
  sim,
  skel,
  splitParts,
} from "./lib/quranText";
import {
  DEFAULT_PREFS,
  MurajaahPrefs,
  loadAllProgressOnline,
  loadPrefsOnline,
  savePrefsOnline,
  saveSurahProgressOnline,
} from "./lib/sync";
import {
  AyahItem,
  ReciteSummaryData,
  SeqItem,
  TileItem,
  WordMark,
  toArabicNum,
} from "./types";
import { MushafPageView } from "./view/MushafPageView";
import { RecitePanel } from "./view/RecitePanel";
import { SurahPickerSheet } from "./view/SurahPickerSheet";

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionEvent {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [alt: number]: { transcript: string };
    };
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MurajaahView: React.FC = () => {
  const [prefs, setPrefs] = useState<MurajaahPrefs>(DEFAULT_PREFS);
  const [doneMap, setDoneMap] = useState<Record<number, number[]>>({});
  const [ready, setReady] = useState(false);

  const [surahNo, setSurahNo] = useState(1);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AyahItem[]>([]);
  const [idx, setIdx] = useState(0);

  const [parts, setParts] = useState<[number, number][]>([[0, 0]]);
  const [part, setPart] = useState(0);
  const [tiles, setTiles] = useState<TileItem[]>([]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrongTileId, setWrongTileId] = useState<number | null>(null);
  const [hintTileId, setHintTileId] = useState<number | null>(null);
  const [checkedMarks, setCheckedMarks] = useState<("ok" | "bad" | null)[]>([]);

  const [ayahMistakes, setAyahMistakes] = useState(0);
  const [ayahHints, setAyahHints] = useState(0);
  const [sessMistakes, setSessMistakes] = useState(0);
  const [sessHints, setSessHints] = useState(0);
  const [solved, setSolved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Memuat data online…");
  const [error, setError] = useState(false);

  const [peekText, setPeekText] = useState<string | null>(null);
  const [toastHtml, setToastHtml] = useState<string | null>(null);
  const [finishModal, setFinishModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pageInput, setPageInput] = useState("1");

  const [reciteOn, setReciteOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [rcStatus, setRcStatus] = useState({ msg: "", err: false });
  const [rcHeard, setRcHeard] = useState("");
  const [rcTick, setRcTick] = useState(0);
  const [reciteSummary, setReciteSummary] = useState<ReciteSummaryData | null>(
    null
  );

  const loadTokenRef = useRef(0);
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const mushafRef = useRef<HTMLDivElement>(null!);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const reciteRef = useRef({
    on: false,
    wantListen: false,
    startIdx: 0,
    seq: [] as SeqItem[],
    pos: 0,
    buf: [] as string[],
    marks: [] as (WordMark | undefined)[],
    hinted: new Set<number>(),
    halt: null as number | null,
    tent: null as { pos: number; marks: Record<number, WordMark> } | null,
    rec: null as SpeechRecognition | null,
    silenceT: null as number | null,
    finalUpTo: 0,
    lastFinal: "",
  });

  const safeSurahNo = surahNo >= 1 && surahNo <= 114 ? surahNo : 1;
  const currentMeta = metaOf(safeSurahNo) || META[0];
  const isPage = prefs.view_mode === "page";
  const cur = items[idx];
  const curWords = cur
    ? cur.words.slice(parts[part]?.[0] ?? 0, parts[part]?.[1] ?? 0)
    : [];

  const isDone = (s: number, a: number) => (doneMap[s] ?? []).includes(a - 1);

  const markAyahDone = (s: number, a: number, value: boolean, nextIdx = idx) => {
    setDoneMap((prev) => {
      const set = new Set(prev[s] ?? []);
      if (value) set.add(a - 1);
      else set.delete(a - 1);
      const arr = Array.from(set).sort((x, y) => x - y);
      saveSurahProgressOnline(s, arr, nextIdx).catch(() => {});
      return { ...prev, [s]: arr };
    });
  };

  const updatePrefs = (patch: Partial<MurajaahPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefsOnline(patch).catch(() => {});
      return next;
    });
  };

  const showToast = (html: string) => {
    setToastHtml(html);
    window.setTimeout(() => setToastHtml(null), 1500);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [onlinePrefs, onlineProgress] = await Promise.all([
          loadPrefsOnline(),
          loadAllProgressOnline(),
        ]);
        if (!active) return;
        setPrefs(onlinePrefs);
        setDoneMap(onlineProgress);
        const validSurah =
          onlinePrefs.last_surah >= 1 && onlinePrefs.last_surah <= 114
            ? onlinePrefs.last_surah
            : 1;
        const validPage =
          onlinePrefs.last_page >= 1 && onlinePrefs.last_page <= 604
            ? onlinePrefs.last_page
            : 1;
        setSurahNo(validSurah);
        setPage(validPage);
        setPageInput(String(validPage));
      } catch {
        // lanjut dengan default
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("page-mode", isPage);
    document.body.classList.toggle("recite-mode", reciteOn);
  }, [isPage, reciteOn]);

  const preparePart = (
    ayahItem: AyahItem,
    partList: [number, number][],
    partIdx: number,
    allItems: AyahItem[],
    level: "easy" | "hard"
  ) => {
    const [a, b] = partList[partIdx] || [0, ayahItem.words.length];
    const words = ayahItem.words.slice(a, b);
    let pool = words.slice();
    if (level === "hard") {
      const others = Array.from(new Set(allItems.flatMap((x) => x.words))).filter(
        (w) => !words.includes(w)
      );
      pool = pool.concat(shuffle(others).slice(0, Math.min(3, others.length)));
    }
    let order = shuffle(pool);
    let tries = 0;
    while (
      order.length > 1 &&
      order.join(" ") === pool.join(" ") &&
      tries++ < 10
    ) {
      order = shuffle(pool);
    }
    setTiles(order.map((text, id) => ({ id, text, used: false })));
    setPlaced([]);
    setCheckedMarks([]);
    setWrongTileId(null);
    setHintTileId(null);
  };

  const setupAyah = (
    targetIdx: number,
    allItems = items,
    level = prefs.level,
    pageMode = isPage
  ) => {
    const it = allItems[targetIdx];
    if (!it) return;
    const pList = splitParts(it.words.length);
    setIdx(targetIdx);
    setParts(pList);
    setPart(0);
    setAyahMistakes(0);
    setAyahHints(0);
    setSolved(false);
    preparePart(it, pList, 0, allItems, level);

    if (!pageMode) {
      saveSurahProgressOnline(it.s, doneMap[it.s] ?? [], targetIdx).catch(() => {});
    }
  };

  const loadSurah = async (
    no: number,
    startIdx?: number,
    overridePrefs?: MurajaahPrefs,
    progressSnapshot = doneMap
  ) => {
    const activePrefs = overridePrefs ?? prefs;
    const targetNo = no >= 1 && no <= 114 ? no : 1;
    if (reciteRef.current.on) exitRecite(true);
    const tok = ++loadTokenRef.current;
    setLoading(true);
    setError(false);
    setSolved(false);
    setLoadingText("Memuat ayat…");
    setSurahNo(targetNo);
    updatePrefs({ view_mode: "ayah", last_surah: targetNo });
    setSessMistakes(0);
    setSessHints(0);

    try {
      const texts = await getSurahTexts(targetNo, activePrefs.rasm);
      if (tok !== loadTokenRef.current) return;
      const loaded: AyahItem[] = texts.map((t, i) => ({
        s: targetNo,
        a: i + 1,
        words: processWords(targetNo, i + 1, t),
      }));
      const doneArr = progressSnapshot[targetNo] ?? [];
      let nextIdx = startIdx;
      if (nextIdx === undefined) {
        const firstUndone = loaded.findIndex((x) => !doneArr.includes(x.a - 1));
        nextIdx = firstUndone >= 0 ? firstUndone : 0;
      }
      nextIdx = Math.min(Math.max(0, nextIdx), Math.max(0, loaded.length - 1));
      setItems(loaded);
      setLoading(false);
      setupAyah(nextIdx, loaded, activePrefs.level, false);
    } catch {
      if (tok === loadTokenRef.current) {
        setLoading(false);
        setError(true);
      }
    }
  };

  const loadPage = async (
    n: number,
    target?: { s: number; a: number } | "last",
    overridePrefs?: MurajaahPrefs,
    progressSnapshot = doneMap
  ) => {
    const activePrefs = overridePrefs ?? prefs;
    const clamped = Math.min(604, Math.max(1, Math.floor(n) || 1));
    if (reciteRef.current.on) exitRecite(true);
    const tok = ++loadTokenRef.current;
    setLoading(true);
    setError(false);
    setSolved(false);
    setLoadingText(`Memuat halaman ${clamped}…`);
    setPage(clamped);
    setPageInput(String(clamped));
    updatePrefs({ view_mode: "page", last_page: clamped });
    setSessMistakes(0);
    setSessHints(0);

    try {
      const rows = await getPage(clamped, activePrefs.rasm);
      if (tok !== loadTokenRef.current) return;
      const loaded: AyahItem[] = rows.map(([s, a, t]) => ({
        s,
        a,
        words: processWords(s, a, t),
      }));
      let nextIdx = -1;
      if (target === "last") nextIdx = loaded.length - 1;
      else if (target) {
        nextIdx = loaded.findIndex((x) => x.s === target.s && x.a === target.a);
      }
      if (nextIdx < 0) {
        nextIdx = loaded.findIndex(
          (x) => !(progressSnapshot[x.s] ?? []).includes(x.a - 1)
        );
      }
      if (nextIdx < 0) nextIdx = 0;
      setItems(loaded);
      setLoading(false);
      setupAyah(nextIdx, loaded, activePrefs.level, true);
    } catch {
      if (tok === loadTokenRef.current) {
        setLoading(false);
        setError(true);
      }
    }
  };

  const openAt = async (s: number, a: number) => {
    if (!isPage) {
      await loadSurah(s, a - 1);
      return;
    }
    const tok = ++loadTokenRef.current;
    setLoading(true);
    setLoadingText("Mencari halaman…");
    try {
      const p = await locatePage(s, a, prefs.rasm);
      if (tok !== loadTokenRef.current) return;
      await loadPage(p, { s, a });
    } catch {
      if (tok === loadTokenRef.current) {
        setLoading(false);
        setError(true);
      }
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (prefs.view_mode === "page") {
      loadPage(prefs.last_page, undefined, prefs, doneMap);
    } else {
      loadSurah(prefs.last_surah, undefined, prefs, doneMap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (isPage || !chipsRef.current) return;
    const curEl = chipsRef.current.querySelector(".chip.current") as HTMLElement | null;
    if (curEl && items.length > 20) {
      chipsRef.current.scrollLeft =
        curEl.offsetLeft - chipsRef.current.clientWidth / 2 + curEl.offsetWidth / 2;
    }
  }, [idx, items.length, isPage]);

  useEffect(() => {
    if (!isPage || !mushafRef.current) return;
    const el = mushafRef.current.querySelector(".m-cur") as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const visTop = 80;
    const visBottom = window.innerHeight - 240;
    if (r.top < visTop || r.bottom > visBottom) {
      window.scrollBy({
        top: r.top - (visTop + (visBottom - visTop) / 3),
        behavior: "smooth",
      });
    }
  }, [idx, part, isPage]);

  const solveAyah = (mistakesNow: number, hintsNow: number) => {
    if (!cur) return;
    setSolved(true);
    markAyahDone(cur.s, cur.a, true, idx);
    const pen = mistakesNow + hintsNow;
    const stars = pen === 0 ? 3 : pen <= 2 ? 2 : 1;
    const starTxt = "★".repeat(stars) + "☆".repeat(3 - stars);

    if (isPage) {
      showToast(
        `<span class="st">${starTxt}</span>${
          stars === 3 ? "Sempurna!" : stars === 2 ? "Bagus!" : "Terus berlatih!"
        }`
      );
      const tok = loadTokenRef.current;
      const snapshotIdx = idx;
      window.setTimeout(() => {
        if (tok === loadTokenRef.current && snapshotIdx === idx) {
          if (snapshotIdx < items.length - 1) setupAyah(snapshotIdx + 1);
          else if (
            items.every(
              (x) => isDone(x.s, x.a) || (x.s === cur.s && x.a === cur.a)
            )
          ) {
            setFinishModal(true);
          }
        }
      }, 850);
    }
  };

  const advancePartOrSolve = (mistakesNow: number, hintsNow: number) => {
    if (!cur) return;
    if (part < parts.length - 1) {
      const nextPart = part + 1;
      setPart(nextPart);
      preparePart(cur, parts, nextPart, items, prefs.level);
    } else {
      solveAyah(mistakesNow, hintsNow);
    }
  };

  const pickTile = (tileId: number) => {
    if (solved || !cur) return;
    const tile = tiles.find((t) => t.id === tileId);
    if (!tile || tile.used || placed.length >= curWords.length) return;

    if (prefs.check_mode === "instant" && tile.text !== curWords[placed.length]) {
      setAyahMistakes((m) => m + 1);
      setSessMistakes((m) => m + 1);
      setWrongTileId(tileId);
      window.setTimeout(() => setWrongTileId(null), 420);
      if (navigator.vibrate) navigator.vibrate(120);
      return;
    }

    const nextPlaced = [...placed, tileId];
    setTiles((prev) =>
      prev.map((t) => (t.id === tileId ? { ...t, used: true } : t))
    );
    setPlaced(nextPlaced);
    setCheckedMarks([]);

    if (prefs.check_mode === "instant" && nextPlaced.length === curWords.length) {
      window.setTimeout(() => advancePartOrSolve(ayahMistakes, ayahHints), 300);
    }
  };

  const removePlacedAt = (slotIndex: number) => {
    if (solved || prefs.check_mode !== "end") return;
    const removedId = placed[slotIndex];
    if (removedId === undefined) return;
    setPlaced((prev) => prev.filter((_, i) => i !== slotIndex));
    setTiles((prev) =>
      prev.map((t) => (t.id === removedId ? { ...t, used: false } : t))
    );
    setCheckedMarks([]);
  };

  const checkEndMode = () => {
    const marks = curWords.map((w, i) => {
      const t = tiles.find((x) => x.id === placed[i]);
      return t?.text === w ? "ok" : "bad";
    });
    setCheckedMarks(marks);
    if (marks.every((m) => m === "ok")) {
      window.setTimeout(() => advancePartOrSolve(ayahMistakes, ayahHints), 450);
    } else {
      setAyahMistakes((m) => m + 1);
      setSessMistakes((m) => m + 1);
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
  };

  const triggerHint = () => {
    if (solved) return;
    let i = 0;
    while (i < placed.length) {
      const t = tiles.find((x) => x.id === placed[i]);
      if (t?.text === curWords[i]) i++;
      else break;
    }
    const kept = placed.slice(0, i);
    const freed = new Set(placed.slice(i));
    if (i >= curWords.length) return;

    setPlaced(kept);
    setTiles((prev) =>
      prev.map((t) => (freed.has(t.id) ? { ...t, used: false } : t))
    );
    setAyahHints((h) => h + 1);
    setSessHints((h) => h + 1);

    const targetTile = tiles.find(
      (t) => (!t.used || freed.has(t.id)) && t.text === curWords[i]
    );
    if (targetTile) {
      setHintTileId(targetTile.id);
      window.setTimeout(() => setHintTileId(null), 2000);
    }
  };

  const triggerPeek = () => {
    if (solved || !cur) return;
    setAyahHints((h) => h + 1);
    setSessHints((h) => h + 1);
    const full = `${cur.words.join(" ")} ﴿${toArabicNum(cur.a)}﴾`;
    setPeekText(full);
    window.setTimeout(
      () => setPeekText(null),
      Math.min(6000, 2000 + cur.words.length * 120)
    );
  };

  const nextAyah = () => {
    if (isPage) {
      if (idx < items.length - 1) setupAyah(idx + 1);
      else if (page < 604) loadPage(page + 1);
      return;
    }
    if (idx < items.length - 1) {
      setupAyah(idx + 1);
      return;
    }
    if (items.every((x) => isDone(x.s, x.a))) {
      setFinishModal(true);
    } else {
      const undone = items.findIndex((x) => !isDone(x.s, x.a));
      setupAyah(undone >= 0 ? undone : 0);
    }
  };

  const prevAyah = () => {
    if (idx > 0) setupAyah(idx - 1);
    else if (isPage && page > 1) loadPage(page - 1, "last");
  };

  const stopListening = () => {
    const R = reciteRef.current;
    R.wantListen = false;
    setListening(false);
    if (R.silenceT) window.clearTimeout(R.silenceT);
    if (R.rec) {
      try {
        R.rec.stop();
      } catch {
        // ignore
      }
      R.rec = null;
    }
  };

  const runMatch = (
    st: {
      pos: number;
      buf: string[];
      halt: number | null;
      marks: Record<number, WordMark>;
      haltNew?: boolean;
    },
    words: string[],
    commit: boolean
  ) => {
    const R = reciteRef.current;
    const seq = R.seq;
    const ok = (index: number) => {
      st.marks[index] = R.hinted.has(index) ? "help" : "ok";
    };

    for (const raw of words) {
      const w = skel(raw);
      if (!w) continue;
      if (st.pos >= seq.length) break;

      if (st.halt != null) {
        const e = seq[st.halt];
        if (sim(w, e.k) || (w.length > 2 && loose(w, e.k))) {
          st.marks[st.halt] = R.hinted.has(st.halt) ? "help" : "fixed";
          st.pos = st.halt + 1;
          st.halt = null;
          st.buf = [];
        }
        continue;
      }

      const e = seq[st.pos];
      if (sim(w, e.k)) {
        ok(st.pos);
        st.pos++;
        st.buf = [];
        continue;
      }
      if (st.pos + 1 < seq.length && sim(w, e.k + seq[st.pos + 1].k)) {
        ok(st.pos);
        ok(st.pos + 1);
        st.pos += 2;
        st.buf = [];
        continue;
      }
      if (st.buf.length && sim(st.buf[st.buf.length - 1] + w, e.k)) {
        ok(st.pos);
        st.pos++;
        st.buf = [];
        continue;
      }
      if (
        (st.pos > 0 && sim(w, seq[st.pos - 1].k)) ||
        (st.pos > 1 && sim(w, seq[st.pos - 2].k))
      ) {
        continue;
      }
      if (IGNORE.has(w)) {
        st.buf.push(w);
        continue;
      }

      let found = -1;
      for (let k = 1; k <= 6 && st.pos + k < seq.length; k++) {
        if (sim(w, seq[st.pos + k].k) && (w.length >= 3 || k === 1)) {
          found = k;
          break;
        }
      }

      if (found > 0) {
        const real = st.buf.filter((b) => !IGNORE.has(b));
        let firstErr: number | null = null;
        for (let q = 0; q < found; q++) {
          const index = st.pos + q;
          const ex = seq[index];
          if (ex.lenient) {
            ok(index);
            continue;
          }
          const b = real[q];
          if (b && loose(b, ex.k)) ok(index);
          else {
            st.marks[index] = real.length ? "bad" : "skip";
            if (firstErr === null && (st.marks[index] === "bad" || found >= 2)) {
              firstErr = index;
            }
          }
        }
        if (commit && prefs.stop_mode && firstErr !== null) {
          for (let index = firstErr + 1; index <= st.pos + found; index++) {
            delete st.marks[index];
          }
          st.halt = firstErr;
          st.pos = firstErr;
          st.buf = [];
          st.haltNew = true;
          continue;
        }
        ok(st.pos + found);
        st.pos += found + 1;
        st.buf = [];
        continue;
      }

      st.buf.push(w);
      if (st.buf.filter((b) => !IGNORE.has(b)).length >= 3) {
        if (e.lenient) {
          ok(st.pos);
          st.pos++;
          st.buf = [];
          continue;
        }
        st.marks[st.pos] = "bad";
        if (commit && prefs.stop_mode) {
          st.halt = st.pos;
          st.haltNew = true;
        } else {
          st.pos++;
        }
        st.buf = [];
      }
    }
    return st;
  };

  const finishRecite = (manual: boolean) => {
    const R = reciteRef.current;
    if (!R.on) return;
    stopListening();

    const counts: Record<WordMark, number> = {
      ok: 0,
      fixed: 0,
      bad: 0,
      skip: 0,
      help: 0,
    };
    const perItem: Record<
      number,
      { total: number; marked: number; problem: boolean }
    > = {};

    R.seq.forEach((e, g) => {
      const st = R.marks[g];
      if (st) counts[st]++;
      const p =
        perItem[e.i] || (perItem[e.i] = { total: 0, marked: 0, problem: false });
      p.total++;
      if (st) p.marked++;
      if (st === "bad" || st === "skip" || st === "help") p.problem = true;
    });

    const problems: number[] = [];
    Object.entries(perItem).forEach(([iStr, p]) => {
      const i = Number(iStr);
      const it = items[i];
      if (it && p.marked === p.total) {
        markAyahDone(it.s, it.a, !p.problem, i);
      }
      if (p.problem) problems.push(i);
    });

    const read = R.seq.filter((_, g) => R.marks[g]).length;
    const perfect = !problems.length && !counts.fixed && read === R.seq.length;
    setReciteSummary({
      perfect,
      manual,
      read,
      total: R.seq.length,
      counts,
      problems,
    });
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setRcStatus({
        msg: "Browser ini belum mendukung pengenalan suara. Gunakan Google Chrome.",
        err: true,
      });
      return;
    }
    const R = reciteRef.current;
    const rec = new SR();
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    R.finalUpTo = 0;
    R.lastFinal = "";

    const resetSilence = () => {
      if (R.silenceT) window.clearTimeout(R.silenceT);
      R.silenceT = window.setTimeout(() => {
        if (!R.wantListen || R.pos >= R.seq.length) return;
        R.hinted.add(R.halt ?? R.pos);
        setRcStatus({
          msg: "Lupa? Kata berikutnya ditampilkan samar.",
          err: false,
        });
        setRcTick((t) => t + 1);
      }, 5000);
    };

    rec.onstart = () => {
      setListening(true);
      resetSilence();
      if (R.halt == null) {
        setRcStatus({ msg: "Mendengarkan… silakan mulai membaca.", err: false });
      }
    };

    rec.onresult = (e) => {
      resetSilence();
      let interim = "";
      for (let k = R.finalUpTo; k < e.results.length; k++) {
        const r = e.results[k];
        const t = r[0].transcript.trim();
        if (r.isFinal) {
          let add = t;
          if (R.lastFinal && t.startsWith(R.lastFinal)) {
            add = t.slice(R.lastFinal.length);
          }
          R.lastFinal = t;
          R.finalUpTo = k + 1;
          setRcHeard(t);
          if (add.trim()) {
            const st = runMatch(
              { pos: R.pos, buf: [...R.buf], halt: R.halt, marks: {} },
              add.trim().split(/\s+/),
              true
            );
            Object.entries(st.marks).forEach(([idxStr, v]) => {
              R.marks[Number(idxStr)] = v;
            });
            R.pos = st.pos;
            R.buf = st.buf;
            R.halt = st.halt;
            R.tent = null;
            if (st.haltNew) {
              setRcStatus({
                msg: "⚠ Ada yang keliru. Ulangi dari kata yang ditandai merah.",
                err: true,
              });
              showToast("⚠ Periksa kata yang merah");
            } else if (R.halt == null) {
              setRcStatus({
                msg: "Mendengarkan… lanjutkan bacaan.",
                err: false,
              });
            }
            setRcTick((tk) => tk + 1);
            if (R.pos >= R.seq.length) {
              window.setTimeout(() => finishRecite(false), 700);
            }
          }
        } else {
          interim += " " + t;
        }
      }
      if (interim.trim()) {
        setRcHeard(interim.trim());
        if (R.halt == null) {
          const st = runMatch(
            { pos: R.pos, buf: [...R.buf], halt: null, marks: {} },
            interim.trim().split(/\s+/),
            false
          );
          R.tent = { pos: st.pos, marks: st.marks };
          setRcTick((tk) => tk + 1);
        }
      }
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      R.wantListen = false;
      setListening(false);
      setRcStatus({
        msg: "Terjadi kesalahan mikrofon: " + e.error,
        err: true,
      });
    };

    rec.onend = () => {
      if (R.wantListen && R.on && R.rec === rec) {
        window.setTimeout(() => {
          if (R.wantListen && R.on && R.rec === rec) startListening();
        }, 120);
      } else if (R.rec === rec) {
        setListening(false);
      }
    };

    R.rec = rec;
    R.wantListen = true;
    try {
      rec.start();
    } catch {
      setRcStatus({ msg: "Gagal memulai mikrofon. Coba lagi.", err: true });
    }
  };

  const enterRecite = () => {
    if (loading || !items.length) return;
    setPeekText(null);
    const startIdx = isPage ? 0 : idx;
    const seq: SeqItem[] = [];
    items.forEach((it, i) => {
      if (i < startIdx) return;
      it.words.forEach((w, j) => {
        const k = skel(w);
        seq.push({
          i,
          j,
          k,
          lenient:
            !k || (it.a === 1 && j === 0 && /ٓ/.test(w) && k.length <= 5),
        });
      });
    });

    const R = reciteRef.current;
    R.on = true;
    R.startIdx = startIdx;
    R.seq = seq;
    R.pos = 0;
    R.buf = [];
    R.marks = new Array(seq.length);
    R.hinted = new Set();
    R.halt = null;
    R.tent = null;

    setReciteOn(true);
    setReciteSummary(null);
    setRcHeard("");
    setRcTick((t) => t + 1);
    setRcStatus({
      msg: `Tekan 🎙 lalu baca dari ${metaOf(items[startIdx].s)[1]} ayat ${
        items[startIdx].a
      }.`,
      err: false,
    });
    if (cardRef.current) {
      window.scrollTo({ top: cardRef.current.offsetTop - 10, behavior: "smooth" });
    }
  };

  const exitRecite = (silent = false) => {
    stopListening();
    reciteRef.current.on = false;
    setReciteOn(false);
    setReciteSummary(null);
    if (!silent && items.length) {
      setupAyah(idx);
    }
  };

  const reciteHelp = () => {
    const R = reciteRef.current;
    if (!R.on || R.pos >= R.seq.length) return;
    if (R.halt != null) {
      R.marks[R.halt] = "help";
      R.pos = R.halt + 1;
      R.halt = null;
    } else {
      R.marks[R.pos] = "help";
      R.pos++;
    }
    R.buf = [];
    R.tent = null;
    setRcStatus({
      msg: listening
        ? "Mendengarkan… lanjutkan bacaan."
        : "Tekan 🎙 untuk melanjutkan.",
      err: false,
    });
    setRcTick((t) => t + 1);
    if (R.pos >= R.seq.length) {
      window.setTimeout(() => finishRecite(false), 500);
    }
  };

  void rcTick;
  const pageSurahs = Array.from(new Set(items.map((x) => x.s)));
  const donePageCount = items.filter((x) => isDone(x.s, x.a)).length;
  const pStart = parts[part]?.[0] ?? 0;
  const pEnd = parts[part]?.[1] ?? 0;

  let progressPct = 0;
  if (reciteOn) {
    const len = reciteRef.current.seq.length;
    progressPct = len ? (Math.min(reciteRef.current.pos, len) / len) * 100 : 0;
  } else if (isPage) {
    progressPct = items.length ? (donePageCount / items.length) * 100 : 0;
  } else if (cur) {
    progressPct =
      ((solved ? cur.words.length : pStart + placed.length) /
        Math.max(1, cur.words.length)) *
      100;
  }

  return (
    <div className="wrap">
      <header>
        <div className="brand">Murajaah Al-Qur'an</div>
        <button
          className="surah-btn"
          aria-label="Pilih surah"
          onClick={() => setPickerOpen(true)}
        >
          <div className="surah-name">
            {isPage
              ? pageSurahs.length
                ? pageSurahs.map((s) => metaOf(s)[2]).join(" · ")
                : currentMeta[2]
              : currentMeta[2]}
          </div>
          <div className="surah-sub">
            <span>
              {isPage
                ? items.length
                  ? `Halaman ${page} · Juz ${juzOf(
                      items[0].s,
                      items[0].a
                    )} · ${pageSurahs.map((s) => metaOf(s)[1]).join(", ")}`
                  : `Halaman ${page}`
                : `${currentMeta[0]}. ${currentMeta[1]} · ${
                    currentMeta[3]
                  } ayat · Juz ${(() => {
                    const j1 = juzOf(currentMeta[0], 1);
                    const j2 = juzOf(currentMeta[0], currentMeta[3]);
                    return j1 === j2 ? j1 : `${j1}–${j2}`;
                  })()}`}
            </span>
            <span className="caret">Ganti ▾</span>
          </div>
        </button>
        {!isPage && safeSurahNo !== 1 && safeSurahNo !== 9 && (
          <div className="basmalah">{BASMALAH[prefs.rasm]}</div>
        )}
      </header>

      <div className="toolbar">
        <div className="seg view-seg">
          <button
            className={prefs.view_mode === "ayah" ? "active" : ""}
            onClick={() => {
              if (prefs.view_mode === "ayah") return;
              updatePrefs({ view_mode: "ayah" });
              const s = cur ? cur.s : safeSurahNo;
              loadSurah(s, cur ? cur.a - 1 : undefined);
            }}
          >
            Per Ayat
          </button>
          <button
            className={prefs.view_mode === "page" ? "active" : ""}
            onClick={() => {
              if (prefs.view_mode === "page") return;
              updatePrefs({ view_mode: "page" });
              openAt(cur ? cur.s : safeSurahNo, cur ? cur.a : 1);
            }}
          >
            Per Halaman
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: "-4px" }}>
        <div className="seg">
          <button
            className={prefs.check_mode === "instant" ? "active" : ""}
            onClick={() => {
              if (prefs.check_mode !== "instant" && !loading) {
                updatePrefs({ check_mode: "instant" });
                setupAyah(idx);
              }
            }}
          >
            Cek Langsung
          </button>
          <button
            className={prefs.check_mode === "end" ? "active" : ""}
            onClick={() => {
              if (prefs.check_mode !== "end" && !loading) {
                updatePrefs({ check_mode: "end" });
                setupAyah(idx);
              }
            }}
          >
            Cek di Akhir
          </button>
        </div>

        <div className="seg">
          <button
            className={prefs.level === "easy" ? "active" : ""}
            onClick={() => {
              if (prefs.level !== "easy" && !loading) {
                updatePrefs({ level: "easy" });
                setupAyah(idx, items, "easy");
              }
            }}
          >
            Mudah
          </button>
          <button
            className={prefs.level === "hard" ? "active" : ""}
            onClick={() => {
              if (prefs.level !== "hard" && !loading) {
                updatePrefs({ level: "hard" });
                setupAyah(idx, items, "hard");
              }
            }}
          >
            Sulit
          </button>
        </div>

        <div className="seg">
          <button
            className={prefs.rasm === "uthmani" ? "active" : ""}
            onClick={() => {
              if (prefs.rasm !== "uthmani" && !loading) {
                const nextP = { ...prefs, rasm: "uthmani" as const };
                updatePrefs({ rasm: "uthmani" });
                if (isPage)
                  loadPage(page, cur ? { s: cur.s, a: cur.a } : undefined, nextP);
                else loadSurah(safeSurahNo, idx, nextP);
              }
            }}
          >
            Utsmani
          </button>
          <button
            className={prefs.rasm === "imlai" ? "active" : ""}
            onClick={() => {
              if (prefs.rasm !== "imlai" && !loading) {
                const nextP = { ...prefs, rasm: "imlai" as const };
                updatePrefs({ rasm: "imlai" });
                if (isPage)
                  loadPage(page, cur ? { s: cur.s, a: cur.a } : undefined, nextP);
                else loadSurah(safeSurahNo, idx, nextP);
              }
            }}
          >
            Imla'i
          </button>
        </div>
      </div>

      {!isPage && !loading && !error && (
        <div
          id="chips"
          ref={chipsRef}
          className={`chips ${items.length > 20 ? "scroll" : ""}`}
        >
          {items.map((x, i) => (
            <button
              key={`${x.s}-${x.a}`}
              className={`chip ${isDone(x.s, x.a) ? "done" : ""} ${
                i === idx ? "current" : ""
              }`}
              onClick={() => setupAyah(i)}
            >
              {toArabicNum(x.a)}
            </button>
          ))}
        </div>
      )}

      {isPage && (
        <div className="pagebar">
          <button
            className="btn"
            disabled={page <= 1}
            onClick={() => page > 1 && loadPage(page - 1)}
          >
            →
          </button>
          <div className="pagebox">
            Hal.{" "}
            <input
              type="number"
              min={1}
              max={604}
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => loadPage(Number(pageInput))}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />{" "}
            / 604 ·{" "}
            <span className="pdone">
              {donePageCount}/{items.length}
            </span>{" "}
            ayat
          </div>
          <button
            className="btn"
            disabled={page >= 604}
            onClick={() => page < 604 && loadPage(page + 1)}
          >
            ←
          </button>
        </div>
      )}

      <div
        ref={cardRef}
        className={`card ${prefs.check_mode === "end" ? "mode-end" : ""}`}
      >
        {loading && (
          <div className="state">
            <div className="spinner" />
            <span>{loadingText}</span>
          </div>
        )}

        {!loading && error && (
          <div className="state">
            <div style={{ fontSize: "28px" }}>📡</div>
            <div>
              Gagal memuat teks Al-Qur'an.
              <br />
              Periksa koneksi internet Anda.
            </div>
            <button
              className="btn primary"
              onClick={() => (isPage ? loadPage(page) : loadSurah(safeSurahNo))}
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!loading && !error && cur && (
          <div>
            <div className="card-head">
              <div className="ayah-label">
                {reciteOn ? (
                  <>
                    🎙 Setor · {metaOf(cur.s)[1]} ayat {cur.a}
                    <small>
                      ·{" "}
                      {Math.min(
                        reciteRef.current.pos,
                        reciteRef.current.seq.length
                      )}
                      /{reciteRef.current.seq.length} kata
                    </small>
                  </>
                ) : isPage ? (
                  <>
                    {metaOf(cur.s)[1]} · Ayat {cur.a}
                    <small>
                      · {idx + 1}/{items.length} di halaman ini
                    </small>
                  </>
                ) : (
                  <>
                    Ayat {cur.a} dari {items.length}
                    <small>· Juz {juzOf(cur.s, cur.a)}</small>
                  </>
                )}
              </div>
              <div className="stats">
                <span>
                  Salah: <b>{ayahMistakes}</b>
                </span>
                <span>
                  Bantuan: <b>{ayahHints}</b>
                </span>
              </div>
            </div>

            <div className="progress">
              <div style={{ width: `${progressPct}%` }} />
            </div>

            {(!solved || isPage || reciteOn) && (
              <div>
                {!isPage && !reciteOn && (
                  <div className="ayah-only">
                    {pStart > 0 && (
                      <div className="ctx">
                        {cur.words.slice(0, pStart).join(" ")}
                      </div>
                    )}
                    {parts.length > 1 && (
                      <div className="part-wrap">
                        <span className="part-badge">
                          Bagian {part + 1} dari {parts.length}
                        </span>
                      </div>
                    )}
                    <div className="slots">
                      {curWords.map((_, i) => {
                        const tid = placed[i];
                        const tile =
                          tid !== undefined
                            ? tiles.find((t) => t.id === tid)
                            : undefined;
                        const mark = checkedMarks[i];
                        return (
                          <div
                            key={i}
                            className={`slot ${
                              tile
                                ? "filled pop"
                                : i === placed.length
                                ? "next"
                                : ""
                            } ${mark ?? ""}`}
                            onClick={() => tile && removePlacedAt(i)}
                          >
                            {tile?.text ?? ""}
                          </div>
                        );
                      })}
                      {pEnd < cur.words.length ? (
                        <div className="more">…</div>
                      ) : (
                        <div className="ayah-end">﴿{toArabicNum(cur.a)}﴾</div>
                      )}
                    </div>
                  </div>
                )}

                {(isPage || reciteOn) && (
                  <MushafPageView
                    items={items}
                    idx={idx}
                    rasm={prefs.rasm}
                    solved={solved}
                    pStart={pStart}
                    pEnd={pEnd}
                    curWords={curWords}
                    placed={placed}
                    tiles={tiles}
                    checkedMarks={checkedMarks}
                    isDone={isDone}
                    onSelectAyah={(i) => setupAyah(i)}
                    onRemovePlacedAt={removePlacedAt}
                    reciteOn={reciteOn}
                    reciteState={reciteRef.current}
                    mushafRef={mushafRef}
                  />
                )}

                <div
                  className="dock"
                  style={{
                    visibility: isPage && solved && !reciteOn ? "hidden" : "visible",
                  }}
                >
                  <div id="dockLabel" className="divider">
                    {parts.length > 1
                      ? `bagian ${part + 1} dari ${
                          parts.length
                        } · pilih kata secara berurutan`
                      : "pilih kata secara berurutan"}
                  </div>
                  <div id="bank" className="bank">
                    {tiles.map((t) => (
                      <button
                        key={t.id}
                        className={`tile ${t.used ? "used" : ""} ${
                          wrongTileId === t.id ? "wrong" : ""
                        } ${hintTileId === t.id ? "hint" : ""}`}
                        onClick={() => pickTile(t.id)}
                      >
                        {t.text}
                      </button>
                    ))}
                  </div>

                  <RecitePanel
                    stopMode={prefs.stop_mode}
                    listening={listening}
                    rcStatus={rcStatus}
                    rcHeard={rcHeard}
                    onToggleStopMode={(stop) => updatePrefs({ stop_mode: stop })}
                    onHelp={reciteHelp}
                    onToggleMic={() => {
                      if (listening || reciteRef.current.wantListen) {
                        stopListening();
                        setRcStatus({
                          msg: "Dijeda. Tekan 🎙 untuk melanjutkan.",
                          err: false,
                        });
                      } else {
                        startListening();
                      }
                    }}
                    onDone={() => finishRecite(true)}
                    onExit={() => exitRecite(false)}
                    summary={reciteSummary}
                    items={items}
                    onRetryRecite={() => {
                      setReciteSummary(null);
                      enterRecite();
                    }}
                    onSelectProblemAyah={(i) => {
                      exitRecite(true);
                      setupAyah(i);
                    }}
                  />
                </div>
              </div>
            )}

            {solved && !isPage && !reciteOn && (
              <div className="success">
                <div className="stars">
                  {(() => {
                    const pen = ayahMistakes + ayahHints;
                    const s = pen === 0 ? 3 : pen <= 2 ? 2 : 1;
                    return "★".repeat(s) + "☆".repeat(3 - s);
                  })()}
                </div>
                <div className="full">
                  {cur.words.join(" ")} ﴿{toArabicNum(cur.a)}﴾
                </div>
                <div className="msg">
                  {ayahMistakes + ayahHints === 0
                    ? "مَا شَاءَ اللَّهُ · Sempurna!"
                    : ayahMistakes + ayahHints <= 2
                    ? "بَارَكَ اللَّهُ فِيكَ · Bagus!"
                    : "Terus berlatih, insyaAllah lancar!"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && !error && !reciteOn && (
        <div id="actions" className="actions">
          <button
            className="btn"
            disabled={!isPage ? idx === 0 : idx === 0 && page <= 1}
            onClick={prevAyah}
          >
            → Sebelumnya
          </button>
          <button className="btn" disabled={solved} onClick={triggerHint}>
            💡 Petunjuk
          </button>
          <button className="btn" disabled={solved} onClick={triggerPeek}>
            👁 Intip
          </button>
          <button
            className="btn"
            onClick={() => {
              if (cur) {
                markAyahDone(cur.s, cur.a, false, idx);
                setupAyah(idx);
              }
            }}
          >
            ↺ Ulang
          </button>
          {prefs.check_mode === "end" && !solved && (
            <button
              className="btn primary"
              disabled={placed.length < curWords.length}
              onClick={checkEndMode}
            >
              ✓ Periksa
            </button>
          )}
          <button
            className="btn primary"
            disabled={isPage && idx === items.length - 1 && page >= 604}
            onClick={nextAyah}
          >
            {isPage
              ? idx === items.length - 1
                ? "Halaman berikutnya ←"
                : "Berikutnya ←"
              : idx === items.length - 1
              ? "Selesai ✓"
              : "Berikutnya ←"}
          </button>
          <button className="btn gold" onClick={enterRecite}>
            🎙 Setor Suara
          </button>
        </div>
      )}

      <footer>
        Ketuk kata di bawah sesuai urutan ayat. Ayat panjang dibagi menjadi beberapa bagian.
        <br />
        <b>Per Halaman</b>: ketuk ayat mana saja di halaman untuk melatih ayat itu.
      </footer>

      {peekText && (
        <div className="peek show" onClick={() => setPeekText(null)}>
          {peekText}
        </div>
      )}

      {toastHtml && (
        <div
          className="toast show"
          dangerouslySetInnerHTML={{ __html: toastHtml }}
        />
      )}

      {finishModal && (
        <div className="modal">
          <div className="box">
            <div className="big">مَا شَاءَ اللَّهُ</div>
            <h2>
              {isPage ? `Halaman ${page} Selesai!` : `${currentMeta[1]} Selesai!`}
            </h2>
            <div style={{ color: "var(--muted)", fontSize: "14px" }}>
              Semoga Allah menjaga hafalanmu.
            </div>
            <div className="summary">
              <div>
                <b>{items.length}</b>Ayat
              </div>
              <div>
                <b>{sessMistakes}</b>Salah
              </div>
              <div>
                <b>{sessHints}</b>Bantuan
              </div>
            </div>
            <div className="btns">
              {(!isPage ? safeSurahNo < 114 : page < 604) && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setFinishModal(false);
                    if (isPage) loadPage(page + 1);
                    else loadSurah(safeSurahNo + 1, 0);
                  }}
                >
                  {isPage
                    ? `Lanjut: Halaman ${page + 1} ←`
                    : `Lanjut: ${metaOf(safeSurahNo + 1)[1]} ←`}
                </button>
              )}
              <button
                className="btn"
                onClick={() => {
                  setFinishModal(false);
                  items.forEach((x) => markAyahDone(x.s, x.a, false, 0));
                  setSessMistakes(0);
                  setSessHints(0);
                  setupAyah(0);
                }}
              >
                {isPage ? "Ulangi Halaman Ini" : "Ulangi Surah Ini"}
              </button>
            </div>
          </div>
        </div>
      )}

    <SurahPickerSheet
        open={pickerOpen}
        surahNo={safeSurahNo}
        activeSurah={cur ? cur.s : safeSurahNo}
        doneMap={doneMap}
        onClose={() => setPickerOpen(false)}
        onSelectSurah={(no, start, fromJuz) => {
          if (isPage) openAt(no, start);
          else loadSurah(no, start > 1 ? start - 1 : fromJuz ? 0 : undefined);
        }}
      />
    </div>
  );
};