import React, { useState } from "react";
import { JUZ, META, juzOf, metaOf, surahsInJuz } from "../data/quranMeta";
import { toArabicNum } from "../types";

interface SurahPickerSheetProps {
  open: boolean;
  surahNo: number;
  activeSurah: number;
  doneMap: Record<number, number[]>;
  onClose: () => void;
  onSelectSurah: (no: number, startAyah: number, fromJuz: boolean) => void;
}

export const SurahPickerSheet: React.FC<SurahPickerSheetProps> = ({
  open,
  surahNo,
  activeSurah,
  doneMap,
  onClose,
  onSelectSurah,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [juzFilter, setJuzFilter] = useState(0);

  if (!open) return null;

  const normalizedQ = searchQuery
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f'’ʿ\-\s]/g, "");

  const entries = juzFilter
    ? surahsInJuz(juzFilter)
    : META.map((m) => ({ no: m[0], start: 1 }));

  const filtered = entries.filter(({ no }) => {
    const [, lat, ar] = metaOf(no);
    const key = (no + lat)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f'’ʿ\-\s]/g, "");
    return !normalizedQ || key.includes(normalizedQ) || ar.includes(searchQuery.trim());
  });

  const currentNo = activeSurah || surahNo;

  return (
    <div
      className="sheet"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel">
        <div className="top">
          <div className="top-row">
            <h3>Pilih Surah</h3>
            <button className="close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="filters">
            <input
              className="search"
              placeholder="Cari nama / nomor surah…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="juz-select"
              value={juzFilter}
              onChange={(e) => setJuzFilter(Number(e.target.value))}
            >
              <option value={0}>Semua Juz</option>
              {JUZ.map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  Juz {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="list">
          {filtered.length === 0 ? (
            <div className="empty">Surah tidak ditemukan.</div>
          ) : (
            filtered.map(({ no, start }) => {
              const [, lat, ar, n] = metaOf(no);
              const doneCount = (doneMap[no] ?? []).length;
              const j1 = juzOf(no, 1);
              const j2 = juzOf(no, n);
              return (
                <button
                  key={`${no}-${start}`}
                  className={`item ${no === currentNo ? "active" : ""} ${
                    doneCount >= n ? "complete" : ""
                  }`}
                  onClick={() => {
                    onClose();
                    onSelectSurah(no, start, Boolean(juzFilter));
                  }}
                >
                  <div className="num">
                    <span>{no}</span>
                  </div>
                  <div className="info">
                    <div className="lat">{lat}</div>
                    <div className="meta">
                      {n} ayat · Juz {j1 === j2 ? j1 : `${j1}–${j2}`} ·{" "}
                      {doneCount}/{n} hafal
                    </div>
                    {start > 1 && (
                      <div className="from">
                        Juz {juzFilter} mulai ayat {toArabicNum(start) ? start : 1}
                      </div>
                    )}
                    <div className="mini">
                      <div
                        style={{
                          width: `${Math.min(100, (doneCount / n) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="ar">{ar}</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};