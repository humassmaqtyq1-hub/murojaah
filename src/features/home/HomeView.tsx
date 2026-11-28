import React, { useEffect, useMemo, useState } from "react";

export interface UserLocation {
  city: string;
  region: string;
  lat: number;
  lng: number;
}

export const DEFAULT_LOCATION: UserLocation = {
  city: "Pati",
  region: "Jawa Tengah, Indonesia",
  lat: -6.7559,
  lng: 111.038,
};

interface PrayerTimeItem {
  key: string;
  label: string;
  time: string;
  minutes: number;
}

interface HomeViewProps {
  location: UserLocation;
  onRequestGps: () => void;
  gpsLoading: boolean;
  onNavigate: (tab: "home" | "quran" | "murajaah" | "settings") => void;
}

function parseMinutes(hhmm: string): number {
  const clean = (hhmm || "").trim().split(" ")[0];
  const [hStr, mStr] = clean.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function formatClock(totalMins: number): string {
  const m = ((Math.round(totalMins) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDateParam(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildPrayerListFromTimings(timings: Record<string, string>): PrayerTimeItem[] {
  const defs = [
    { key: "Fajr", label: "Subuh", fallback: "04:20" },
    { key: "Sunrise", label: "Terbit", fallback: "05:40" },
    { key: "Dhuhr", label: "Dzuhur", fallback: "11:45" },
    { key: "Asr", label: "Ashar", fallback: "15:05" },
    { key: "Maghrib", label: "Maghrib", fallback: "17:50" },
    { key: "Isha", label: "Isya", fallback: "19:00" },
  ];

  return defs.map((item) => {
    const rawTime = timings[item.key] || item.fallback;
    const mins = parseMinutes(rawTime);
    return {
      key: item.key,
      label: item.label,
      time: formatClock(mins),
      minutes: mins,
    };
  });
}

export const HomeView: React.FC<HomeViewProps> = ({
  location,
  onRequestGps,
  gpsLoading,
  onNavigate,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [prayers, setPrayers] = useState<PrayerTimeItem[]>(() =>
    buildPrayerListFromTimings({})
  );
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dateKey = formatDateParam(now);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `prayer_v1_${dateKey}_${location.lat.toFixed(3)}_${location.lng.toFixed(3)}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as PrayerTimeItem[];
        if (Array.isArray(parsed) && parsed.length === 6) {
          setPrayers(parsed);
          setLoadingSchedule(false);
        }
      }
    } catch {
      // abaikan cache rusak
    }

    (async () => {
      try {
        setLoadingSchedule(true);
        const url = `https://api.aladhan.com/v1/timings/${dateKey}?latitude=${encodeURIComponent(
          location.lat
        )}&longitude=${encodeURIComponent(location.lng)}&method=20`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const timings = json?.data?.timings;
        if (!timings || cancelled) return;

        const list = buildPrayerListFromTimings(timings);
        if (cancelled) return;
        setPrayers(list);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(list));
        } catch {
          // abaikan error penyimpanan
        }
      } catch {
        // tetap tampilkan jadwal yang ada
      } finally {
        if (!cancelled) {
          setLoadingSchedule(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateKey, location.lat, location.lng]);

  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  const nextPrayer = useMemo(() => {
    const upcoming = prayers.find((p) => p.minutes > nowMinutes);
    if (upcoming) {
      const diff = Math.max(0, Math.round(upcoming.minutes - nowMinutes));
      return {
        label: upcoming.label,
        time: upcoming.time,
        remainingText:
          diff >= 60
            ? `${Math.floor(diff / 60)} jam ${diff % 60} menit lagi`
            : `${diff} menit lagi`,
      };
    }
    const tomorrowFirst = prayers[0];
    const diffTomorrow = Math.max(0, Math.round(1440 - nowMinutes + tomorrowFirst.minutes));
    return {
      label: `${tomorrowFirst.label} (besok)`,
      time: tomorrowFirst.time,
      remainingText: `${Math.floor(diffTomorrow / 60)} jam ${diffTomorrow % 60} menit lagi`,
    };
  }, [prayers, nowMinutes]);

  const timeString = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const dateString = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="wrap">
      <header>
        <div className="brand">Beranda Ibadah</div>
        <div className="surah-name" style={{ fontSize: "34px", lineHeight: 1.4 }}>
          أَهْلًا وَسَهْلًا
        </div>
        <div className="surah-sub">
          <span>
            📍 {location.city} · {location.region}
          </span>
        </div>
      </header>

      <div className="card" style={{ marginBottom: "16px" }}>
        <div className="card-head">
          <div className="ayah-label">
            Waktu &amp; Lokasi Saat Ini
            {loadingSchedule && <small>· Memuat jadwal…</small>}
          </div>
          <div className="stats">
            <button
              className="btn"
              style={{ padding: "6px 12px", fontSize: "12px" }}
              onClick={onRequestGps}
              disabled={gpsLoading}
            >
              {gpsLoading ? "Mendeteksi…" : "📡 Deteksi Lokasi"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 4px 10px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "34px",
                fontWeight: 800,
                color: "var(--green)",
                letterSpacing: "0.02em",
              }}
            >
              {timeString}
            </div>
            <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>
              {dateString}
            </div>
          </div>

          <div
            style={{
              background: "var(--gold-soft)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              padding: "10px 14px",
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--gold)" }}>
              MENUJU WAKTU SHOLAT
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>
              {nextPrayer.label} · {nextPrayer.time}
            </div>
            <div style={{ fontSize: "12px", color: "var(--muted)" }}>
              {nextPrayer.remainingText}
            </div>
          </div>
        </div>

        <div className="divider">jadwal waktu sholat</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))",
            gap: "8px",
          }}
        >
          {prayers.map((p) => {
            const isNext = nextPrayer.label.startsWith(p.label);
            return (
              <div
                key={p.key}
                style={{
                  background: isNext ? "var(--green-soft)" : "var(--bg)",
                  border: `1px solid ${isNext ? "var(--green)" : "var(--line)"}`,
                  borderRadius: "14px",
                  padding: "10px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: isNext ? "var(--green)" : "var(--muted)",
                  }}
                >
                  {p.label}
                </div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 800,
                    color: "var(--ink)",
                    marginTop: "2px",
                  }}
                >
                  {p.time}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="ayah-label">Pintasan Fitur Utama</div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            gap: "10px",
            marginTop: "8px",
          }}
        >
          <button className="btn primary" onClick={() => onNavigate("quran")}>
            📖 Al-Qur'an &amp; Tajwid
          </button>
          <button className="btn gold" onClick={() => onNavigate("murajaah")}>
            🎙 Murajaah &amp; Semaan
          </button>
          <button className="btn" onClick={() => onNavigate("settings")}>
            ⚙️ Pengaturan &amp; Lokasi
          </button>
        </div>
      </div>

      <footer>
        Jadwal sholat untuk wilayah {location.city}.
      </footer>
    </div>
  );
};