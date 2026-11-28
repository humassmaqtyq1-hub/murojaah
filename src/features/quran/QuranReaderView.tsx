import React, { useEffect, useMemo, useState } from "react";
import { BASMALAH, META, metaOf } from "../murajaah/data/quranMeta";
import { toArabicNum } from "../murajaah/types";

export interface LastReadBookmark {
  surah: number;
  ayah: number;
  page?: number;
  updatedAt: string;
}

interface QuranAyahRow {
  surahNo: number;
  numberInSurah: number;
  arabic: string;
  translation: string;
}

interface QuranReaderViewProps {
  lastRead: LastReadBookmark;
  onUpdateLastRead: (bookmark: LastReadBookmark) => void;
}

const LAST_READ_KEY = "ibadah_quran_last_read_v1";
const PREF_KEY = "ibadah_quran_reader_prefs_v1";

interface ReaderPrefs {
  displayMode: "page" | "ayah";
  rasm: "uthmani" | "imlai";
  showTajwid: boolean;
  showTranslation: boolean;
  arabicFontSize: number;
  translationFontSize: number;
}

const DEFAULT_READER_PREFS: ReaderPrefs = {
  displayMode: "page",
  rasm: "uthmani",
  showTajwid: true,
  showTranslation: true,
  arabicFontSize: 28,
  translationFontSize: 14,
};

const surahCache = new Map<string, QuranAyahRow[]>();
const pageCache = new Map<string, QuranAyahRow[]>();

function classifyTajwidToken(
  token: string
): "ghunnah" | "qalqalah" | "mad" | "waqf" | "normal" {
  if (!token || /^[٠-٩\u0660-\u0669﴿﴾\s]+$/.test(token)) return "waqf";
  if (/[نم][ًٌٍَُِّّْ]/.test(token) || /[نم]ّ/.test(token)) {
    return "ghunnah";
  }
  if (/[قطبجد][ْ]/.test(token)) {
    return "qalqalah";
  }
  if (/[ٰٓ]|ا[َ]?|و[ُ]?|ي[ِ]?/.test(token) && token.length >= 2) {
    return "mad";
  }
  return "normal";
}

function renderArabicWithTajwid(
  text: string,
  showTajwid: boolean
): React.ReactNode {
  const words = text.trim().split(/\s+/);
  if (!showTajwid) {
    return words.join(" ");
  }

  return words.map((word, idx) => {
    const kind = classifyTajwidToken(word);
    const color =
      kind === "ghunnah"
        ? "#0f8a5f"
        : kind === "qalqalah"
        ? "#b8892f"
        : kind === "mad"
        ? "#2563eb"
        : kind === "waqf"
        ? "var(--gold)"
        : "inherit";

    const bg =
      kind === "ghunnah"
        ? "rgba(15, 138, 95, 0.08)"
        : kind === "qalqalah"
        ? "rgba(184, 137, 47, 0.10)"
        : kind === "mad"
        ? "rgba(37, 99, 235, 0.08)"
        : "transparent";

    return (
      <React.Fragment key={idx}>
        <span
          style={{
            color,
            background: bg,
            borderRadius: "6px",
            padding: kind !== "normal" && kind !== "waqf" ? "0 3px" : "0",
          }}
        >
          {word}
        </span>{" "}
      </React.Fragment>
    );
  });
}

export const QuranReaderView: React.FC<QuranReaderViewProps> = ({
  lastRead,
  onUpdateLastRead,
}) => {
  const [readerPrefs, setReaderPrefs] = useState<ReaderPrefs>(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        return {
          ...DEFAULT_READER_PREFS,
          ...JSON.parse(raw),
          displayMode:
            JSON.parse(raw)?.displayMode === "ayah" ? "ayah" : "page",
        };
      }
    } catch {
      // abaikan error storage
    }
    return DEFAULT_READER_PREFS;
  });

  const isPageMode = readerPrefs.displayMode === "page";

  const [pageNo, setPageNo] = useState<number>(() =>
    lastRead.page && lastRead.page >= 1 && lastRead.page <= 604
      ? lastRead.page
      : 1
  );
  const [pageInput, setPageInput] = useState<string>(() =>
    String(
      lastRead.page && lastRead.page >= 1 && lastRead.page <= 604
        ? lastRead.page
        : 1
    )
  );

  const [surahNo, setSurahNo] = useState<number>(() =>
    lastRead.surah >= 1 && lastRead.surah <= 114 ? lastRead.surah : 1
  );
  const [activeAyah, setActiveAyah] = useState<number>(() =>
    lastRead.ayah >= 1 ? lastRead.ayah : 1
  );
  const [rows, setRows] = useState<QuranAyahRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [showFontPanel, setShowFontPanel] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<string>("");

  const meta = useMemo(() => metaOf(surahNo) || META[0], [surahNo]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(readerPrefs));
    } catch {
      // abaikan error storage
    }
  }, [readerPrefs]);

  // Mode Per Halaman (default)
  useEffect(() => {
    if (!isPageMode) return;
    let cancelled = false;
    const cacheKey = `p_${pageNo}_${readerPrefs.rasm}`;

    setPageInput(String(pageNo));

    if (pageCache.has(cacheKey)) {
      const cachedRows = pageCache.get(cacheKey) || [];
      setRows(cachedRows);
      if (cachedRows[0]) {
        setSurahNo(cachedRows[0].surahNo);
        setActiveAyah(cachedRows[0].numberInSurah);
      }
      setLoading(false);
      setError(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(false);
        const edition =
          readerPrefs.rasm === "uthmani" ? "quran-uthmani" : "quran-simple";
        const res = await fetch(
          `https://api.alquran.cloud/v1/page/${pageNo}/editions/${edition},id.indonesian`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const editionsData = json?.data;
        if (!Array.isArray(editionsData) || editionsData.length < 2) {
          throw new Error("Invalid page data");
        }

        const arAyahs = editionsData[0]?.ayahs || [];
        const idAyahs = editionsData[1]?.ayahs || [];

        const merged: QuranAyahRow[] = arAyahs.map(
          (
            item: {
              surah?: { number: number };
              numberInSurah: number;
              text: string;
            },
            i: number
          ) => ({
            surahNo: item.surah?.number || 1,
            numberInSurah: item.numberInSurah,
            arabic: item.text,
            translation: idAyahs[i]?.text || "",
          })
        );

        if (cancelled) return;
        pageCache.set(cacheKey, merged);
        setRows(merged);
        if (merged[0]) {
          setSurahNo(merged[0].surahNo);
          setActiveAyah(merged[0].numberInSurah);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPageMode, pageNo, readerPrefs.rasm]);

  // Mode Per Ayat
  useEffect(() => {
    if (isPageMode) return;
    let cancelled = false;
    const cacheKey = `s_${surahNo}_${readerPrefs.rasm}`;

    if (surahCache.has(cacheKey)) {
      setRows(surahCache.get(cacheKey) || []);
      setLoading(false);
      setError(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(false);
        const edition =
          readerPrefs.rasm === "uthmani" ? "quran-uthmani" : "quran-simple";
        const res = await fetch(
          `https://api.alquran.cloud/v1/surah/${surahNo}/editions/${edition},id.indonesian`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const editionsData = json?.data;
        if (!Array.isArray(editionsData) || editionsData.length < 2) {
          throw new Error("Invalid surah data");
        }

        const arAyahs = editionsData[0]?.ayahs || [];
        const idAyahs = editionsData[1]?.ayahs || [];

        const merged: QuranAyahRow[] = arAyahs.map(
          (item: { numberInSurah: number; text: string }, i: number) => ({
            surahNo,
            numberInSurah: item.numberInSurah,
            arabic: item.text,
            translation: idAyahs[i]?.text || "",
          })
        );

        if (cancelled) return;
        surahCache.set(cacheKey, merged);
        setRows(merged);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPageMode, surahNo, readerPrefs.rasm]);

  const handleMarkLastRead = (
    targetSurah: number,
    targetAyah: number,
    targetPage = pageNo
  ) => {
    const bookmark: LastReadBookmark = {
      surah: targetSurah,
      ayah: targetAyah,
      page: targetPage,
      updatedAt: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    try {
      localStorage.setItem(LAST_READ_KEY, JSON.stringify(bookmark));
    } catch {
      // abaikan error storage
    }
    onUpdateLastRead(bookmark);
    setSavedNotice(
      `Ditandai: ${metaOf(targetSurah)[1]} ayat ${targetAyah} (Hal. ${targetPage})`
    );
    window.setTimeout(() => setSavedNotice(""), 1800);
  };

  const handleJumpLastRead = () => {
    if (isPageMode && lastRead.page) {
      const clampedPage = Math.min(604, Math.max(1, lastRead.page));
      setPageNo(clampedPage);
      setPageInput(String(clampedPage));
      return;
    }
    const targetS =
      lastRead.surah >= 1 && lastRead.surah <= 114 ? lastRead.surah : 1;
    const targetA = lastRead.ayah >= 1 ? lastRead.ayah : 1;
    setSurahNo(targetS);
    setActiveAyah(targetA);
  };

  const goToPage = (raw: number) => {
    const clamped = Math.min(604, Math.max(1, Math.floor(raw) || 1));
    setPageNo(clamped);
    setPageInput(String(clamped));
  };

  const pageSurahs = useMemo(
    () => Array.from(new Set(rows.map((r) => r.surahNo))),
    [rows]
  );

  return (
    <div className="wrap">
      <header>
        <div className="brand">Al-Qur'an Digital</div>
        <div className="surah-name">
          {isPageMode
            ? pageSurahs.length
              ? pageSurahs.map((s) => metaOf(s)[2]).join(" · ")
              : meta[2]
            : meta[2]}
        </div>
        <div className="surah-sub">
          <span>
            {isPageMode
              ? `Halaman ${pageNo} dari 604 · ${
                  pageSurahs.length
                    ? pageSurahs.map((s) => metaOf(s)[1]).join(", ")
                    : meta[1]
                }`
              : `${meta[0]}. ${meta[1]} · ${meta[3]} Ayat`}
          </span>
        </div>
        {!isPageMode && surahNo !== 1 && surahNo !== 9 && (
          <div className="basmalah">{BASMALAH[readerPrefs.rasm]}</div>
        )}
      </header>

      {/* Baris Mode Tampilan: Per Halaman (Default) / Per Ayat & Terjemahan */}
      <div className="toolbar">
        <div className="seg view-seg">
          <button
            className={isPageMode ? "active" : ""}
            onClick={() =>
              setReaderPrefs((p) => ({ ...p, displayMode: "page" }))
            }
          >
            Per Halaman
          </button>
          <button
            className={!isPageMode ? "active" : ""}
            onClick={() =>
              setReaderPrefs((p) => ({ ...p, displayMode: "ayah" }))
            }
          >
            Per Ayat
          </button>
        </div>

        <div className="seg">
          <button
            className={readerPrefs.showTranslation ? "active" : ""}
            onClick={() =>
              setReaderPrefs((p) => ({
                ...p,
                showTranslation: !p.showTranslation,
              }))
            }
          >
            {readerPrefs.showTranslation
              ? "Terjemahan: Aktif"
              : "Terjemahan: Nonaktif"}
          </button>
          <button
            className={readerPrefs.showTajwid ? "active" : ""}
            onClick={() =>
              setReaderPrefs((p) => ({ ...p, showTajwid: !p.showTajwid }))
            }
          >
            Tajwid Warna
          </button>
        </div>

        <button
          className={`btn ${showFontPanel ? "primary" : ""}`}
          style={{ padding: "8px 12px", fontSize: "12px" }}
          onClick={() => setShowFontPanel((v) => !v)}
        >
          Aa Font &amp; Rasm
        </button>
      </div>

      {/* Navigasi Halaman (saat Per Halaman) atau Pilihan Surah (saat Per Ayat) */}
      {isPageMode ? (
        <div className="pagebar">
          <button
            className="btn"
            disabled={pageNo <= 1}
            onClick={() => goToPage(pageNo - 1)}
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
              onBlur={() => goToPage(Number(pageInput))}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />{" "}
            / 604
          </div>
          <button
            className="btn"
            disabled={pageNo >= 604}
            onClick={() => goToPage(pageNo + 1)}
          >
            ←
          </button>
        </div>
      ) : (
        <div className="toolbar" style={{ marginTop: "-4px" }}>
          <select
            className="juz-select"
            style={{ width: "auto", minWidth: "200px" }}
            value={surahNo}
            onChange={(e) => {
              const nextS = Number(e.target.value);
              setSurahNo(nextS);
              setActiveAyah(1);
              handleMarkLastRead(nextS, 1);
            }}
          >
            {META.map((m) => (
              <option key={m[0]} value={m[0]}>
                {m[0]}. {m[1]} ({m[2]})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Penanda Baca Terakhir */}
      <div className="card" style={{ marginBottom: "14px", padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--gold)" }}>
              PENANDA BACA TERAKHIR
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink)" }}>
              {metaOf(lastRead.surah)[1]} · Ayat {lastRead.ayah}
              {lastRead.page ? ` · Hal. ${lastRead.page}` : ""}
              {lastRead.updatedAt ? ` (${lastRead.updatedAt})` : ""}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              className="btn"
              style={{ padding: "8px 12px", fontSize: "12px" }}
              onClick={handleJumpLastRead}
            >
              🔖 Buka Terakhir
            </button>
            <button
              className="btn primary"
              style={{ padding: "8px 12px", fontSize: "12px" }}
              onClick={() => handleMarkLastRead(surahNo, activeAyah, pageNo)}
            >
              ✓ Tandai Ayat {activeAyah}
            </button>
          </div>
        </div>
        {savedNotice && (
          <div
            style={{
              marginTop: "8px",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--green)",
            }}
          >
            {savedNotice}
          </div>
        )}
      </div>

      {/* Panel Pengaturan Huruf & Rasm */}
      {showFontPanel && (
        <div className="card" style={{ marginBottom: "14px", padding: "14px 16px" }}>
          <div className="card-head">
            <div className="ayah-label">Pengaturan Huruf &amp; Rasm</div>
          </div>

          <div style={{ display: "grid", gap: "12px", marginTop: "8px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>Jenis Rasm</span>
              <div className="seg">
                <button
                  className={readerPrefs.rasm === "uthmani" ? "active" : ""}
                  onClick={() =>
                    setReaderPrefs((p) => ({ ...p, rasm: "uthmani" }))
                  }
                >
                  Utsmani
                </button>
                <button
                  className={readerPrefs.rasm === "imlai" ? "active" : ""}
                  onClick={() =>
                    setReaderPrefs((p) => ({ ...p, rasm: "imlai" }))
                  }
                >
                  Imla'i
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Ukuran Huruf Arab ({readerPrefs.arabicFontSize}px)
              </span>
              <input
                type="range"
                min={22}
                max={42}
                step={2}
                value={readerPrefs.arabicFontSize}
                onChange={(e) =>
                  setReaderPrefs((p) => ({
                    ...p,
                    arabicFontSize: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600 }}>
                Ukuran Terjemahan ({readerPrefs.translationFontSize}px)
              </span>
              <input
                type="range"
                min={12}
                max={20}
                step={1}
                value={readerPrefs.translationFontSize}
                onChange={(e) =>
                  setReaderPrefs((p) => ({
                    ...p,
                    translationFontSize: Number(e.target.value),
                  }))
                }
              />
            </div>
          </div>
        </div>
      )}

      {readerPrefs.showTajwid && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 14px",
            justifyContent: "center",
            fontSize: "11px",
            color: "var(--muted)",
            marginBottom: "12px",
          }}
        >
          <span>
            <i
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                background: "#0f8a5f",
                marginRight: "4px",
              }}
            />
            Ghunnah
          </span>
          <span>
            <i
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                background: "#b8892f",
                marginRight: "4px",
              }}
            />
            Qalqalah
          </span>
          <span>
            <i
              style={{
                display: "inline-block",
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                background: "#2563eb",
                marginRight: "4px",
              }}
            />
            Mad
          </span>
        </div>
      )}

      <div className="card">
        {loading && (
          <div className="state">
            <div className="spinner" />
            <span>
              {isPageMode
                ? `Memuat halaman ${pageNo}…`
                : `Memuat ${meta[1]}…`}
            </span>
          </div>
        )}

        {!loading && error && (
          <div className="state">
            <div style={{ fontSize: "28px" }}>📡</div>
            <div>Gagal memuat bacaan. Periksa koneksi internet Anda.</div>
            <button
              className="btn primary"
              onClick={() =>
                isPageMode ? goToPage(pageNo) : setSurahNo((s) => s)
              }
            >
              Coba Lagi
            </button>
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "grid", gap: "14px" }}>
            {rows.map((ayah, idxRow) => {
              const prevRow = idxRow > 0 ? rows[idxRow - 1] : null;
              const showSurahBanner =
                isPageMode &&
                ayah.numberInSurah === 1 &&
                (!prevRow || prevRow.surahNo !== ayah.surahNo);

              const isMarked =
                lastRead.surah === ayah.surahNo &&
                lastRead.ayah === ayah.numberInSurah;
              const isSelected =
                activeAyah === ayah.numberInSurah && surahNo === ayah.surahNo;

              return (
                <React.Fragment key={`${ayah.surahNo}-${ayah.numberInSurah}`}>
                  {showSurahBanner && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "8px 12px",
                        borderRadius: "14px",
                        border: "1.5px solid var(--gold)",
                        background: "var(--gold-soft)",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--arab)",
                          fontSize: "24px",
                          color: "var(--green)",
                        }}
                      >
                        سُورَةُ {metaOf(ayah.surahNo)[2]}
                      </div>
                      {ayah.surahNo !== 1 && ayah.surahNo !== 9 && (
                        <div
                          style={{
                            fontFamily: "var(--arab)",
                            fontSize: "22px",
                            color: "var(--gold)",
                          }}
                        >
                          {BASMALAH[readerPrefs.rasm]}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    onClick={() => {
                      setSurahNo(ayah.surahNo);
                      setActiveAyah(ayah.numberInSurah);
                      handleMarkLastRead(
                        ayah.surahNo,
                        ayah.numberInSurah,
                        pageNo
                      );
                    }}
                    style={{
                      padding: "14px",
                      borderRadius: "16px",
                      background: isMarked
                        ? "var(--green-soft)"
                        : isSelected
                        ? "var(--gold-soft)"
                        : "var(--bg)",
                      border: `1px solid ${
                        isMarked ? "var(--green)" : "var(--line)"
                      }`,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--green)",
                        }}
                      >
                        {isPageMode
                          ? `${metaOf(ayah.surahNo)[1]} · Ayat ${ayah.numberInSurah}`
                          : `Ayat ${ayah.numberInSurah}`}
                      </span>
                      {isMarked && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "var(--green)",
                            background: "var(--paper)",
                            padding: "2px 8px",
                            borderRadius: "99px",
                          }}
                        >
                          🔖 Bacaan Terakhir
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        direction: "rtl",
                        textAlign: "right",
                        fontFamily: "var(--arab)",
                        fontSize: `${readerPrefs.arabicFontSize}px`,
                        lineHeight: 2.15,
                        color: "var(--ink)",
                      }}
                    >
                      {renderArabicWithTajwid(
                        ayah.arabic,
                        readerPrefs.showTajwid
                      )}{" "}
                      <span className="m-num">
                        ﴿{toArabicNum(ayah.numberInSurah)}﴾
                      </span>
                    </div>

                    {readerPrefs.showTranslation && ayah.translation && (
                      <div
                        style={{
                          marginTop: "8px",
                          paddingTop: "8px",
                          borderTop: "1px dashed var(--line)",
                          fontSize: `${readerPrefs.translationFontSize}px`,
                          lineHeight: 1.65,
                          color: "var(--muted)",
                        }}
                      >
                        {ayah.translation}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <footer>
        Default tampilan <b>Per Halaman</b>. Ketuk ayat untuk memperbarui penanda baca terakhir.
      </footer>
    </div>
  );
};