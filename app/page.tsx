"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  Clipboard,
  Download,
  Facebook,
  HelpCircle,
  Instagram,
  Link2,
  Menu,
  ShieldCheck,
  Sparkles,
  Ticket,
  X,
} from "lucide-react";

type Platform = "Semua" | "Facebook" | "Instagram" | "TikTok";

const platforms = [
  {
    name: "Facebook" as const,
    icon: Facebook,
    tone: "bg-[#eaf2ff] text-[#287be8]",
    count: "1.2k",
  },
  {
    name: "Instagram" as const,
    icon: Instagram,
    tone: "bg-[#fff0f4] text-[#e44479]",
    count: "980",
  },
  {
    name: "TikTok" as const,
    icon: Ticket,
    tone: "bg-[#edfafa] text-[#1c8d8e]",
    count: "760",
  },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [filter, setFilter] = useState<Platform>("Semua");
  const [showMenu, setShowMenu] = useState(false);
  const [message, setMessage] = useState("");
  const [showQuality, setShowQuality] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState("720p");
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewFilename, setPreviewFilename] = useState("");
  const [previewType, setPreviewType] = useState<"video" | "audio">("video");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const filteredPlatforms = useMemo(
    () =>
      filter === "Semua"
        ? platforms
        : platforms.filter((platform) => platform.name === filter),
    [filter],
  );

  function pasteFromClipboard() {
    navigator.clipboard?.readText().then((text) => {
      if (text) setUrl(text);
    });
  }

  function handleDownload() {
    if (!url.trim()) {
      setMessage("Silakan tempel tautan video terlebih dahulu.");
      setShowQuality(false);
      return;
    }
    setMessage("");
    setShowQuality(true);
    void preparePreview("720p");
  }

  function stringifyError(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const messages = value
        .map((item) => stringifyError(item))
        .filter((item): item is string => Boolean(item));
      return messages.length ? messages.join(". ") : null;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const key of ["message", "detail", "error", "msg"]) {
        const message = stringifyError(record[key]);
        if (message) return message;
      }
    }
    return null;
  }

  async function readErrorMessage(response: Response, fallback: string) {
    const payload = await response.json().catch(() => null);
    return stringifyError(payload) ?? fallback;
  }

  async function preparePreview(label: string) {
    setSelectedQuality(label);
    if (isDownloading) return;

    setIsDownloading(true);
    setIsPreviewLoading(true);
    setMessage("");
    setPreviewUrl("");
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), quality: label, mode: "preview" }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Preview video gagal dibuat."));
      }

      const result = (await response.json()) as {
        previewUrl?: unknown;
        filename?: unknown;
        type?: "video" | "audio";
      };
      if (typeof result.previewUrl !== "string" || !result.previewUrl) {
        throw new Error("Server tidak mengembalikan URL preview video.");
      }
      setPreviewUrl(result.previewUrl);
      setPreviewFilename(
        typeof result.filename === "string" ? result.filename : "",
      );
      setPreviewType(result.type === "audio" ? "audio" : "video");
      setMessage("Preview siap. Periksa videonya, lalu klik tombol unduh.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Preview gagal dibuat. Coba lagi.",
      );
    } finally {
      setIsPreviewLoading(false);
      setIsDownloading(false);
    }
  }

  async function downloadVideo() {
    if (!previewUrl || isDownloading) return;

    setIsDownloading(true);
    setMessage("");
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), quality: selectedQuality, mode: "download" }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Video gagal diunduh."));
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = previewFilename || `snapdown-${selectedQuality}.${selectedQuality === "MP3" ? "mp3" : "mp4"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage(`Video ${selectedQuality} berhasil diunduh.`);
      setShowSuccess(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Video gagal diunduh. Coba lagi.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
        <a
          href="#"
          className="flex items-center gap-3"
          aria-label="Snapdown beranda"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white shadow-sm">
            <Download size={19} strokeWidth={2.5} />
          </span>
          <span className="text-[20px] font-extrabold tracking-[-0.04em] text-ink">
            snapdown
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-[14px] font-semibold text-muted md:flex">
          <a className="transition hover:text-ink" href="#cara-kerja">
            Cara kerja
          </a>
          <a className="transition hover:text-ink" href="#platform">
            Platform
          </a>
          <a className="transition hover:text-ink" href="#bantuan">
            Bantuan
          </a>
          <a
            className="rounded-full border border-line px-5 py-2.5 text-ink transition hover:border-ink"
            href="#mulai"
          >
            Mulai sekarang
          </a>
        </nav>
        <button
          className="rounded-xl p-2 text-ink md:hidden"
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Buka menu"
        >
          {showMenu ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      {showMenu && (
        <nav className="mx-5 mb-4 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 text-sm font-semibold shadow-card md:hidden">
          <a href="#cara-kerja" onClick={() => setShowMenu(false)}>
            Cara kerja
          </a>
          <a href="#platform" onClick={() => setShowMenu(false)}>
            Platform
          </a>
          <a href="#bantuan" onClick={() => setShowMenu(false)}>
            Bantuan
          </a>
        </nav>
      )}

      <section
        className="relative mx-auto max-w-[1240px] px-5 pb-14 pt-12 sm:px-8 sm:pt-16 lg:px-10 lg:pb-24 lg:pt-20"
        id="mulai"
      >
        <div className="pointer-events-none absolute -right-28 top-[-80px] h-[390px] w-[390px] rounded-full bg-[#f2f7ff] blur-[2px]" />
        <div className="relative max-w-[800px]">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffd8d4] bg-[#fff4f2] px-3.5 py-2 text-[12px] font-bold text-coral-dark">
            GRATIS BUAT MAMA :3
          </div>
          <h1 className="max-w-[730px] text-[42px] font-extrabold leading-[1.08] tracking-[-0.055em] text-ink sm:text-[60px]">
            Simpan video favoritmu,{" "}
            <span className="text-coral">kapan saja.</span>
          </h1>
          <p className="mt-6 max-w-[570px] text-[17px] leading-8 text-muted sm:text-[19px]">
            Unduh video dari Facebook, Instagram, dan TikTok dengan cepat. Tanpa
            Iklan, Tanpa aplikasi tambahan dan Tanpa ribet.
          </p>
        </div>

        <div className="relative mt-10 max-w-[900px] rounded-[24px] border border-line bg-white p-3 shadow-card sm:mt-12 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex min-h-[58px] flex-1 items-center gap-3 rounded-2xl border border-line bg-cream px-4 focus-within:border-coral focus-within:ring-4 focus-within:ring-[#fff0ee]">
              <Link2 className="shrink-0 text-muted" size={20} />
              <input
                aria-label="Tautan video"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setMessage("");
                  setShowQuality(false);
                  setPreviewUrl("");
                }}
                placeholder="Tempel tautan video di sini..."
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-[#9aa3b3]"
              />
              {url && (
                <button
                  onClick={() => {
                    setUrl("");
                    setShowQuality(false);
                    setMessage("");
                    setPreviewUrl("");
                  }}
                  className="text-muted hover:text-ink"
                  aria-label="Hapus tautan"
                >
                  <X size={18} />
                </button>
              )}
              <button
                onClick={pasteFromClipboard}
                className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-coral hover:text-coral-dark"
                aria-label="Tempel dari clipboard"
              >
                <Clipboard size={15} />{" "}
                <span className="hidden xs:inline">Tempel</span>
              </button>
            </div>
            <button
              onClick={handleDownload}
              className="flex min-h-[58px] items-center justify-center gap-2 rounded-2xl bg-coral px-7 text-[15px] font-extrabold text-white shadow-[0_8px_18px_rgba(255,97,87,0.23)] transition hover:bg-coral-dark active:scale-[.98]"
            >
              <ArrowDownToLine size={19} /> Unduh video
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 pb-1 pt-3 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#43a67e]" /> Aman & privat
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-[#43a67e]" /> Tanpa watermark
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-[#43a67e]" /> Gratis selamanya
            </span>
          </div>
          {showQuality && (
            <div
              className="mt-3 border-t border-line px-2 pb-1 pt-4"
              aria-label="Pilihan kualitas video"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-extrabold text-ink">
                    Pilih kualitas video
                  </h2>
                  <p className="mt-1 text-[12px] text-muted">
                    Kualitas lebih tinggi memiliki ukuran file lebih besar.
                  </p>
                </div>
                <button
                  onClick={() => setShowQuality(false)}
                  className="rounded-lg p-1.5 text-muted hover:bg-cream hover:text-ink"
                  aria-label="Tutup pilihan kualitas"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {                [
                  ["1080p", "Full HD", "± 18 MB"],
                  ["720p", "HD", "± 10 MB"],
                  ["480p", "SD", "± 6 MB"],
                ].map(([quality, detail, size]) => (
                  <button
                    key={quality}
                    onClick={() => preparePreview(quality)}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition hover:border-coral hover:bg-[#fff8f7] ${selectedQuality === quality ? "border-coral bg-[#fff8f7] ring-2 ring-[#fff0ee]" : "border-line bg-white"}`}
                  >
                    <span>
                      <span className="block text-[14px] font-extrabold text-ink">
                        {quality}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {detail} · {size}
                      </span>
                    </span>
                    {selectedQuality === quality && (
                      <Check size={16} className="shrink-0 text-coral" />
                    )}
                  </button>
                ))}
              </div>
              <button
                disabled={isDownloading || !previewUrl}
                onClick={downloadVideo}
                className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[14px] font-extrabold text-white transition hover:bg-[#29334a] disabled:cursor-wait disabled:opacity-60"
              >
                <ArrowDownToLine size={17} />{" "}
                {isDownloading
                  ? "Menyiapkan file..."
                  : `Unduh ${selectedQuality}`}
              </button>
              {isPreviewLoading && (
                <div
                  className="mt-4 rounded-2xl border border-line bg-[#f8fafc] px-4 py-5 text-center text-[13px] font-semibold text-muted"
                  role="status"
                >
                  Menyiapkan preview video...
                </div>
              )}
              {previewUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-[#101827] p-2">
                  <p className="px-2 pb-2 pt-1 text-[12px] font-bold text-white">
                    Preview · {selectedQuality}
                  </p>
                  {previewType === "video" ? (
                    <video
                      className="max-h-[420px] w-full rounded-xl bg-black"
                      src={previewUrl}
                      controls
                      playsInline
                    />
                  ) : (
                    <audio className="w-full" src={previewUrl} controls />
                  )}
                </div>
              )}
            </div>
          )}
          {message && (
            <p
              role="status"
              className="px-2 pb-1 pt-2 text-[13px] font-semibold text-coral-dark"
            >
              {message}
            </p>
          )}
        </div>
      </section>

      {showSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Unduhan berhasil"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e9f8f0] text-[#36a674]">
              <Check size={28} strokeWidth={3} />
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-ink">
              Unduhan berhasil!
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {previewFilename || `snapdown-${selectedQuality}`} sudah tersimpan
              di perangkatmu.
            </p>
            <button
              onClick={() => setShowSuccess(false)}
              className="mt-6 min-h-[48px] w-full rounded-xl bg-ink px-5 text-sm font-extrabold text-white transition hover:bg-[#29334a]"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      <section id="platform" className="border-y border-line bg-white">
        <div className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-[12px] font-extrabold uppercase tracking-[.16em] text-coral">
                Didukung snapdown
              </p>
              <h2 className="text-[28px] font-extrabold tracking-[-0.04em] text-ink sm:text-[34px]">
                Satu tempat, semua video.
              </h2>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-line bg-cream p-1">
              {(["Semua", "Facebook", "Instagram", "TikTok"] as Platform[]).map(
                (item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`rounded-lg px-3 py-2 text-[12px] font-bold transition sm:px-3.5 ${filter === item ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {filteredPlatforms.map(({ name, icon: Icon, tone, count }) => (
              <article
                key={name}
                className="group flex items-center justify-between rounded-2xl border border-line p-5 transition hover:-translate-y-1 hover:border-[#d6dae2] hover:shadow-card"
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}
                  >
                    <Icon size={23} />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-ink">{name}</h3>
                    <p className="mt-1 text-[12px] text-muted">Video & Reels</p>
                  </div>
                </div>
                <span className="text-[12px] font-bold text-muted">
                  {count}k+ <span className="font-normal">unduhan</span>
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="cara-kerja"
        className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:px-10 lg:py-20"
      >
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="mb-2 text-[12px] font-extrabold uppercase tracking-[.16em] text-coral">
              Tiga langkah mudah
            </p>
            <h2 className="max-w-[380px] text-[30px] font-extrabold leading-tight tracking-[-0.04em] text-ink sm:text-[38px]">
              Dari tautan jadi video dalam hitungan detik.
            </h2>
            <p className="mt-4 max-w-[370px] text-[15px] leading-7 text-muted">
              Kami membuat proses unduh sesederhana mungkin, bahkan untuk
              pertama kali.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [
                "01",
                "Salin tautan",
                "Salin URL video dari aplikasi favoritmu.",
              ],
              ["02", "Tempel di sini", "Tempel tautan di kolom yang tersedia."],
              ["03", "Klik unduh", "Pilih kualitas, lalu simpan videonya."],
            ].map(([number, title, text]) => (
              <div
                key={number}
                className="rounded-2xl border border-line bg-white p-5"
              >
                <span className="text-[13px] font-extrabold text-coral">
                  {number}
                </span>
                <h3 className="mt-7 font-extrabold text-ink">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer id="bantuan" className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-5 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div className="flex items-center gap-2 font-extrabold text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-white">
              <Download size={14} />
            </span>{" "}
            snapdown
          </div>
          <p className="flex items-center gap-1.5">
            <HelpCircle size={14} /> Gunakan hanya untuk konten yang kamu miliki
            izinnya.
          </p>
          <p>© 2024 Snapdown</p>
        </div>
      </footer>
    </main>
  );
}
