export interface AyahItem {
  s: number;
  a: number;
  words: string[];
}

export interface TileItem {
  id: number;
  text: string;
  used: boolean;
}

export interface SeqItem {
  i: number;
  j: number;
  k: string;
  lenient: boolean;
}

export type WordMark = "ok" | "fixed" | "bad" | "skip" | "help";

export interface ReciteSummaryData {
  perfect: boolean;
  manual: boolean;
  read: number;
  total: number;
  counts: Record<WordMark, number>;
  problems: number[];
}

export const toArabicNum = (n: number) =>
  String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);