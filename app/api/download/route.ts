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
): Promise<Response> {
  if (payload.mode === "preview") {
    const callResponse = await fetch(`${endpoint}/gradio_api/call/preview_video`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(process.env.HF_SPACE_TOKEN
          ? { Authorization: "Bearer " + process.env.HF_SPACE_TOKEN }
          : {}),
      },
      body: JSON.stringify({
        data: [payload.url, payload.quality],
      }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });
    if (!callResponse.ok) {
      throw new Error(`Gradio preview gagal (${callResponse.status}).`);
    }
    const { event_id: eventId } = (await callResponse.json()) as {
      event_id?: string;
    };
    if (!eventId) throw new Error("Gradio tidak mengembalikan event preview.");

    const resultResponse = await fetch(
      `${endpoint}/gradio_api/call/preview_video/${eventId}`,
      {
        headers: {
          Accept: "text/event-stream",
          ...(process.env.HF_SPACE_TOKEN
            ? { Authorization: "Bearer " + process.env.HF_SPACE_TOKEN }
            : {}),
        },
        signal: AbortSignal.timeout(55_000),
        cache: "no-store",
      },
    );
    const eventText = await resultResponse.text();
    const dataLine = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .reverse()
      .find((line) => {
        try {
          const value = JSON.parse(line.slice(5).trim()) as unknown;
          return Array.isArray(value) || Boolean(value && typeof value === "object");
        } catch {
          return false;
        }
      });
    if (!dataLine) throw new Error("Gradio tidak mengembalikan hasil preview.");
    const result = JSON.parse(dataLine.slice(5).trim()) as
      | Array<unknown>
      | { data?: unknown[] };
    const rawPreview = Array.isArray(result)
      ? result[0]
      : (result.data?.[0] ?? {});
    const preview = (
      typeof rawPreview === "string" ? JSON.parse(rawPreview) : rawPreview
    ) as {
      previewUrl?: string;
      previewHeaders?: Record<string, string>;
      filename?: string;
      type?: "video" | "audio";
      error?: string;
    };
    if (preview.error) throw new Error(preview.error);
    if (!preview.previewUrl) throw new Error("URL preview tidak tersedia.");
    return NextResponse.json(preview);
  }

  const callResponse = await fetch(`${endpoint}/gradio_api/call/download_video`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(process.env.HF_SPACE_TOKEN
        ? { Authorization: "Bearer " + process.env.HF_SPACE_TOKEN }
        : {}),
    },
    body: JSON.stringify({ data: [payload.url, payload.quality] }),
    signal: AbortSignal.timeout(55_000),
    cache: "no-store",
  });
  if (!callResponse.ok) {
    throw new Error(`Gradio download gagal (${callResponse.status}).`);
  }
  const { event_id: eventId } = (await callResponse.json()) as {
    event_id?: string;
  };
  if (!eventId) throw new Error("Gradio tidak mengembalikan event download.");
  const resultResponse = await fetch(
    `${endpoint}/gradio_api/call/download_video/${eventId}`,
    {
      headers: {
        Accept: "text/event-stream",
        ...(process.env.HF_SPACE_TOKEN
          ? { Authorization: "Bearer " + process.env.HF_SPACE_TOKEN }
          : {}),
      },
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    },
  );
  const eventText = await resultResponse.text();
  const dataLine = eventText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .reverse()
    .find((line) => line.includes("[") || line.includes("{"));
  if (!dataLine) throw new Error("Gradio tidak mengembalikan file download.");
  const result = JSON.parse(dataLine.slice(5).trim()) as unknown;
  const output = Array.isArray(result) ? result[0] : result;
  const fileUrl =
    typeof output === "string"
      ? output
      : output && typeof output === "object"
        ? ((output as { url?: string; path?: string }).url ??
          (output as { path?: string }).path)
        : undefined;
  if (!fileUrl || typeof fileUrl !== "string") {
    throw new Error("URL file download tidak tersedia.");
  }
  const mediaResponse = await fetch(
    fileUrl.startsWith("http") ? fileUrl : `${endpoint}/file=${fileUrl}`,
    {
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    },
  );
  if (!mediaResponse.ok || !mediaResponse.body) {
    throw new Error("File video gagal diambil dari backend.");
  }
  return mediaResponse;
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
      const response = await requestHuggingFaceSpace(
        spaceUrl,
        {
          url: body.url,
          quality,
          mode: body.mode === "preview" ? "preview" : "download",
        },
      );
      if (body.mode === "preview") return response;
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
