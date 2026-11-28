import React from "react";
import { BASMALAH, metaOf } from "../data/quranMeta";
import { AyahItem, SeqItem, TileItem, WordMark, toArabicNum } from "../types";

interface MushafPageViewProps {
  items: AyahItem[];
  idx: number;
  rasm: "uthmani" | "imlai";
  solved: boolean;
  pStart: number;
  pEnd: number;
  curWords: string[];
  placed: number[];
  tiles: TileItem[];
  checkedMarks: ("ok" | "bad" | null)[];
  isDone: (s: number, a: number) => boolean;
  onSelectAyah: (i: number) => void;
  onRemovePlacedAt: (slotIdx: number) => void;
  reciteOn: boolean;
  reciteState: {
    startIdx: number;
    seq: SeqItem[];
    pos: number;
    marks: (WordMark | undefined)[];
    hinted: Set<number>;
    halt: number | null;
    tent: { pos: number; marks: Record<number, WordMark> } | null;
  };
  mushafRef: React.RefObject<HTMLDivElement>;
}

export const MushafPageView: React.FC<MushafPageViewProps> = ({
  items,
  idx,
  rasm,
  solved,
  pStart,
  pEnd,
  curWords,
  placed,
  tiles,
  checkedMarks,
  isDone,
  onSelectAyah,
  onRemovePlacedAt,
  reciteOn,
  reciteState,
  mushafRef,
}) => {
  if (reciteOn) {
    const cursor = reciteState.halt ?? reciteState.pos;
    let globalWordIdx = 0;

    return (
      <div id="mushaf" ref={mushafRef} className="mushaf">
        {items.map((it, i) => {
          if (i < reciteState.startIdx) return null;
          return (
            <React.Fragment key={`${it.s}-${it.a}`}>
              {it.a === 1 && (
                <>
                  <div className="m-surah">سُورَةُ {metaOf(it.s)[2]}</div>
                  {it.s !== 1 && it.s !== 9 && (
                    <div className="m-basmalah">{BASMALAH[rasm]}</div>
                  )}
                </>
              )}
              <span className="m-ayah m-cur">
                {it.words.map((w, wi) => {
                  const g = globalWordIdx++;
                  const st = reciteState.marks[g];
                  let cls = "w";
                  if (g === reciteState.halt) cls += " w-bad w-halt";
                  else if (st) cls += " w-" + st;
                  else if (
                    reciteState.tent &&
                    g < reciteState.tent.pos &&
                    reciteState.tent.marks[g] &&
                    reciteState.tent.marks[g] !== "bad" &&
                    reciteState.tent.marks[g] !== "skip"
                  ) {
                    cls += " w-tent";
                  } else if (reciteState.hinted.has(g)) cls += " w-hint";
                  else if (g === cursor) cls += " w-next";
                  else cls += " w-veil";

                  return (
                    <React.Fragment key={wi}>
                      <span className={cls}>{w}</span>{" "}
                    </React.Fragment>
                  );
                })}
                <span
                  className={`m-num ${
                    !reciteState.marks[globalWordIdx - 1] &&
                    !(
                      reciteState.tent &&
                      reciteState.tent.marks[globalWordIdx - 1]
                    )
                      ? "nv"
                      : ""
                  }`}
                >
                  ﴿{toArabicNum(it.a)}﴾
                </span>
              </span>{" "}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div id="mushaf" ref={mushafRef} className="mushaf">
      {items.map((it, i) => {
        const num = `﴿${toArabicNum(it.a)}﴾`;
        return (
          <React.Fragment key={`${it.s}-${it.a}`}>
            {it.a === 1 && (
              <>
                <div className="m-surah">سُورَةُ {metaOf(it.s)[2]}</div>
                {it.s !== 1 && it.s !== 9 && (
                  <div className="m-basmalah">{BASMALAH[rasm]}</div>
                )}
              </>
            )}
            {i === idx ? (
              <span className={`m-ayah m-cur ${solved ? "m-justdone" : ""}`}>
                {solved ? (
                  <>{it.words.join(" ")} </>
                ) : (
                  <>
                    {pStart > 0 && (
                      <>
                        <span className="m-okw">
                          {it.words.slice(0, pStart).join(" ")}
                        </span>{" "}
                      </>
                    )}
                    {curWords.map((_, k) => {
                      const tid = placed[k];
                      const tile =
                        tid !== undefined
                          ? tiles.find((t) => t.id === tid)
                          : undefined;
                      const mark = checkedMarks[k];
                      return (
                        <React.Fragment key={k}>
                          <span
                            className={`m-slot ${
                              tile
                                ? "filled"
                                : k === placed.length
                                ? "next"
                                : ""
                            } ${mark ?? ""}`}
                            onClick={() => tile && onRemovePlacedAt(k)}
                          >
                            {tile?.text ?? ""}
                          </span>{" "}
                        </React.Fragment>
                      );
                    })}
                    {pEnd < it.words.length && (
                      <>
                        <span className="m-later">
                          {it.words.slice(pEnd).join(" ")}
                        </span>{" "}
                      </>
                    )}
                  </>
                )}
                <span className="m-num">{num}</span>
              </span>
            ) : (
              <span
                className={`m-ayah ${
                  i < idx
                    ? `m-past ${isDone(it.s, it.a) ? "" : "undone"}`
                    : "m-veil"
                }`}
                title={i < idx ? "Latih ayat ini lagi" : "Latih ayat ini"}
                onClick={() => onSelectAyah(i)}
              >
                {it.words.join(" ")} <span className="m-num">{num}</span>
              </span>
            )}{" "}
          </React.Fragment>
        );
      })}
    </div>
  );
};