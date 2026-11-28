import React from "react";
import { metaOf } from "../data/quranMeta";
import { AyahItem, ReciteSummaryData } from "../types";

interface RecitePanelProps {
  stopMode: boolean;
  listening: boolean;
  rcStatus: { msg: string; err: boolean };
  rcHeard: string;
  onToggleStopMode: (stop: boolean) => void;
  onHelp: () => void;
  onToggleMic: () => void;
  onDone: () => void;
  onExit: () => void;
  summary: ReciteSummaryData | null;
  items: AyahItem[];
  onRetryRecite: () => void;
  onSelectProblemAyah: (idx: number) => void;
}

export const RecitePanel: React.FC<RecitePanelProps> = ({
  stopMode,
  listening,
  rcStatus,
  rcHeard,
  onToggleStopMode,
  onHelp,
  onToggleMic,
  onDone,
  onExit,
  summary,
  items,
  onRetryRecite,
  onSelectProblemAyah,
}) => {
  return (
    <>
      <div className="recite-panel">
        <div className="rp-top">
          <div className="seg small">
            <button
              className={stopMode ? "active" : ""}
              onClick={() => onToggleStopMode(true)}
            >
              Berhenti saat salah
            </button>
            <button
              className={!stopMode ? "active" : ""}
              onClick={() => onToggleStopMode(false)}
            >
              Tandai di akhir
            </button>
          </div>
        </div>
        <div className="rp-main">
          <button className="btn" onClick={onHelp}>
            💡 Bantu
          </button>
          <button
            className={`mic ${listening ? "on" : ""}`}
            aria-label="Mulai / jeda"
            onClick={onToggleMic}
          >
            {listening ? "■" : "🎙"}
          </button>
          <button className="btn" onClick={onDone}>
            ✓ Selesai
          </button>
        </div>
        <div className={`rp-status ${rcStatus.err ? "err" : ""}`}>
          {rcStatus.msg}
        </div>
        <div className="rp-heard">{rcHeard}</div>
        <div className="rp-legend">
          <span>
            <i style={{ background: "var(--ink)" }} />
            benar
          </span>
          <span>
            <i style={{ background: "var(--gold)" }} />
            dikoreksi
          </span>
          <span>
            <i style={{ background: "var(--red)" }} />
            salah
          </span>
          <span>
            <i style={{ background: "var(--muted)" }} />
            terlewat
          </span>
          <span>
            <i style={{ background: "var(--blue)" }} />
            dibantu
          </span>
        </div>
        <button className="rp-exit" onClick={onExit}>
          ✕ Keluar dari Setor Suara
        </button>
      </div>

      {summary && (
        <div className="modal">
          <div className="box">
            <div className="big">
              {summary.perfect
                ? "مَا شَاءَ اللَّهُ"
                : summary.problems.length
                ? "بَارَكَ اللَّهُ فِيكَ"
                : "أَحْسَنْتَ"}
            </div>
            <h2>
              {summary.perfect
                ? "Setoran Lancar!"
                : summary.manual && summary.read < summary.total
                ? "Setoran Dihentikan"
                : "Setoran Selesai"}
            </h2>
            <div style={{ color: "var(--muted)", fontSize: "13px" }}>
              {summary.read} dari {summary.total} kata dibaca
            </div>
            <div className="summary five">
              <div>
                <b>{summary.counts.ok}</b>Benar
              </div>
              <div>
                <b>{summary.counts.fixed}</b>Dikoreksi
              </div>
              <div>
                <b>{summary.counts.bad}</b>Salah
              </div>
              <div>
                <b>{summary.counts.skip}</b>Terlewat
              </div>
              <div>
                <b>{summary.counts.help}</b>Dibantu
              </div>
            </div>
            {summary.problems.length > 0 && (
              <div className="rm-list">
                <div className="lbl">
                  Ayat yang perlu diulang (ketuk untuk latihan susun kata):
                </div>
                {summary.problems.map((i) => {
                  const it = items[i];
                  if (!it) return null;
                  return (
                    <button key={i} onClick={() => onSelectProblemAyah(i)}>
                      {metaOf(it.s)[1]} {it.a}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="btns">
              <button className="btn primary" onClick={onRetryRecite}>
                🎙 Ulangi Setoran
              </button>
              <button className="btn" onClick={onExit}>
                Kembali ke Latihan Susun Kata
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};