import { useEffect, useState } from "react";
import "./murajaah.css";
import { DEFAULT_LOCATION, HomeView, UserLocation } from "./features/home/HomeView";
import { MurajaahView } from "./features/murajaah/MurajaahView";
import { LastReadBookmark, QuranReaderView } from "./features/quran/QuranReaderView";

type MainMenu = "home" | "quran" | "murajaah" | "settings";

const LOC_STORAGE_KEY = "ibadah_user_location_v1";
const LAST_READ_KEY = "ibadah_quran_last_read_v1";

const DEFAULT_LAST_READ: LastReadBookmark = {
  surah: 1,
  ayah: 1,
  updatedAt: "",
};

export default function App() {
  const [menu, setMenu] = useState<MainMenu>("home");
  const [location, setLocation] = useState<UserLocation>(() => {
    try {
      const saved = localStorage.getItem(LOC_STORAGE_KEY);
      if (saved) return { ...DEFAULT_LOCATION, ...JSON.parse(saved) };
    } catch {
      // abaikan error storage
    }
    return DEFAULT_LOCATION;
  });
  const [lastRead, setLastRead] = useState<LastReadBookmark>(() => {
    try {
      const saved = localStorage.getItem(LAST_READ_KEY);
      if (saved) return { ...DEFAULT_LAST_READ, ...JSON.parse(saved) };
    } catch {
      // abaikan error storage
    }
    return DEFAULT_LAST_READ;
  });
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(location));
    } catch {
      // abaikan error storage
    }
  }, [location]);

  const handleUpdateLastRead = (bookmark: LastReadBookmark) => {
    setLastRead(bookmark);
    try {
      localStorage.setItem(LAST_READ_KEY, JSON.stringify(bookmark));
    } catch {
      // abaikan error storage
    }
  };

  const handleRequestGps = () => {
    if (!navigator.geolocation) {
      setMenu("settings");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation((prev) => ({
          ...prev,
          city: "Lokasi Terdeteksi",
          region: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        setGpsLoading(false);
      },
      () => {
        setGpsLoading(false);
        setMenu("settings");
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        {menu === "home" && (
          <HomeView
            location={location}
            onRequestGps={handleRequestGps}
            gpsLoading={gpsLoading}
            onNavigate={(target) => setMenu(target)}
          />
        )}

        {menu === "quran" && (
          <QuranReaderView
            lastRead={lastRead}
            onUpdateLastRead={handleUpdateLastRead}
          />
        )}

        {menu === "murajaah" && <MurajaahView />}

        {menu === "settings" && (
          <div className="wrap">
            <div className="card">
              <div className="card-head">
                <div className="ayah-label">Pengaturan Lokasi &amp; Profil</div>
              </div>
              <div style={{ display: "grid", gap: "12px", marginTop: "10px" }}>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                    Nama Kota / Wilayah
                  </div>
                  <input
                    className="search"
                    style={{ width: "100%" }}
                    value={location.city}
                    onChange={(e) =>
                      setLocation((prev) => ({ ...prev, city: e.target.value }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                      Lintang (Latitude)
                    </div>
                    <input
                      type="number"
                      step="any"
                      className="search"
                      style={{ width: "100%" }}
                      value={location.lat}
                      onChange={(e) =>
                        setLocation((prev) => ({
                          ...prev,
                          lat: Number(e.target.value) || prev.lat,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                      Bujur (Longitude)
                    </div>
                    <input
                      type="number"
                      step="any"
                      className="search"
                      style={{ width: "100%" }}
                      value={location.lng}
                      onChange={(e) =>
                        setLocation((prev) => ({
                          ...prev,
                          lng: Number(e.target.value) || prev.lng,
                        }))
                      }
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  <button
                    className="btn"
                    onClick={() => setLocation(DEFAULT_LOCATION)}
                  >
                    Reset ke Pati
                  </button>
                  <button
                    className="btn primary"
                    onClick={() => setMenu("home")}
                  >
                    Simpan &amp; Lihat Jadwal Sholat
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigasi utama">
        <button
          className={`nav-item ${menu === "home" ? "active" : ""}`}
          onClick={() => setMenu("home")}
        >
          <span className="nav-ico">🏠</span>
          <span className="nav-lbl">Home</span>
        </button>
        <button
          className={`nav-item ${menu === "quran" ? "active" : ""}`}
          onClick={() => setMenu("quran")}
        >
          <span className="nav-ico">📖</span>
          <span className="nav-lbl">Al-Qur'an</span>
        </button>
        <button
          className={`nav-item ${menu === "murajaah" ? "active" : ""}`}
          onClick={() => setMenu("murajaah")}
        >
          <span className="nav-ico">🎙</span>
          <span className="nav-lbl">Murajaah</span>
        </button>
        <button
          className={`nav-item ${menu === "settings" ? "active" : ""}`}
          onClick={() => setMenu("settings")}
        >
          <span className="nav-ico">⚙️</span>
          <span className="nav-lbl">Setting</span>
        </button>
      </nav>
    </div>
  );
}