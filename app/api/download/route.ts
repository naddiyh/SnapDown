import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "fb.watch",
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
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

function isSupportedUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [...SUPPORTED_HOSTS].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

function cleanMediaUrl(value: string) {
  return value
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"');
}

function findMediaUrl(html: string) {
  const patterns = [
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)/i,
    /<meta[^>]+content=["']([^"']+)[^"']*["'][^>]+property=["']og:video(?::secure_url)?["']/i,
    /"downloadAddr":"([^"]+)/,
    /"playAddr":"([^"]+)/,
    /"contentUrl":"([^"]+\.mp4[^"]*)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const candidate = cleanMediaUrl(match[1]);
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "https:") return candidate;
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function resolvePublicMediaUrl(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (compatible; Snapdown/1.0; +https://vercel.com)",
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("SOURCE_UNAVAILABLE");
  const html = await response.text();
  const mediaUrl = findMediaUrl(html);
  if (!mediaUrl) throw new Error("MEDIA_NOT_PUBLIC");
  return mediaUrl;
}

async function requestHuggingFaceSpace(
  endpoint: string,
  payload: { url: string; quality: string; mode: "preview" | "download" },
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: payload.mode === "preview" ? "application/json" : "video/mp4",
      "Content-Type": "application/json",
      ...(process.env.HF_SPACE_TOKEN
        ? { Authorization: "Bearer " + process.env.HF_SPACE_TOKEN }
        : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(55_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      stringifyError(result) ??
        "Hugging Face downloader gagal memproses video.",
    );
  }
  return response;
}

export async function POST(request: NextRequest) {
  let body: { url?: unknown; quality?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Permintaan tidak valid.", 400);
  }

  if (!isSupportedUrl(body.url)) {
    return errorResponse(
      "Gunakan tautan HTTPS dari Facebook, Instagram, atau TikTok.",
      400,
    );
  }

  const quality = typeof body.quality === "string" ? body.quality : "";
  if (!["1080p", "720p", "480p", "MP3"].includes(quality)) {
    return errorResponse("Kualitas video tidak tersedia.", 400);
  }
  if (quality === "MP3") {
    return errorResponse(
      "MP3 membutuhkan konversi ffmpeg. Pilih kualitas video MP4 untuk deployment Vercel gratis.",
      422,
    );
  }

  const spaceUrl = process.env.HF_SPACE_URL?.replace(/\/$/, "");
  if (spaceUrl) {
    try {
      const response = await requestHuggingFaceSpace(`${spaceUrl}/download`, {
        url: body.url,
        quality,
        mode: body.mode === "preview" ? "preview" : "download",
      });
      if (body.mode === "preview") {
        return NextResponse.json(await response.json());
      }
      if (!response.body) return errorResponse("File video kosong.", 502);
      return new NextResponse(response.body, {
        headers: {
          "Content-Type": response.headers.get("content-type") ?? "video/mp4",
          "Content-Disposition": `attachment; filename="snapdown-${quality}.mp4"`,
        },
      });
    } catch (error) {
      console.error("Hugging Face Space request failed", error);
      return errorResponse(
        error instanceof Error ? error.message : "Hugging Face Space tidak tersedia.",
        502,
      );
    }
  }

  try {
    const mediaUrl = await resolvePublicMediaUrl(body.url);
    const filename = `snapdown-${quality}.mp4`;

    if (body.mode === "preview") {
      return NextResponse.json({
        previewUrl: mediaUrl,
        filename,
        type: "video",
      });
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Snapdown/1.0)" },
      signal: AbortSignal.timeout(50_000),
      cache: "no-store",
    });
    if (!mediaResponse.ok || !mediaResponse.body) {
      return errorResponse("File video gagal diambil dari sumber.", 502);
    }

    return new NextResponse(mediaResponse.body, {
      headers: {
        "Content-Type": mediaResponse.headers.get("content-type") ?? "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "MEDIA_NOT_PUBLIC") {
      return errorResponse(
        "Video ini tidak menyediakan URL media publik. Video privat atau yang diproteksi platform tidak dapat diunduh tanpa layanan khusus.",
        422,
      );
    }
    console.error("Public media resolver failed", error);
    return errorResponse(
      "Video tidak dapat diproses. Pastikan tautannya publik dan masih tersedia.",
      502,
    );
  }
}
