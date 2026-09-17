import asyncio
import base64
import os
import tempfile
from pathlib import Path
from typing import Literal

import gradio as gr
import spaces
import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

QUALITY_FORMATS = {
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio/best[height<=1080]/best",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]/best",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best",
}

api = FastAPI(title="Snapdown yt-dlp downloader")
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class DownloadRequest(BaseModel):
    url: HttpUrl
    quality: Literal["1080p", "720p", "480p"]
    mode: Literal["preview", "download"] = "preview"


def ytdlp_options(request: DownloadRequest, output: str | None = None) -> dict:
    options = {
        "format": QUALITY_FORMATS[request.quality],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
        "retries": 3,
        "fragment_retries": 3,
        "sleep_interval_requests": 1,
        "extractor_args": {"instagram": {"skip": ["dash"]}},
    }

    cookies = os.environ.get("INSTAGRAM_COOKIES_B64")
    if cookies:
        cookie_path = Path(tempfile.gettempdir()) / "snapdown-instagram-cookies.txt"
        try:
            cookie_path.write_bytes(base64.b64decode(cookies))
            options["cookiefile"] = str(cookie_path)
        except (ValueError, base64.binascii.Error):
            raise RuntimeError("INSTAGRAM_COOKIES_B64 tidak valid.")

    if output:
        options["outtmpl"] = output
    return options


def friendly_error(error: Exception) -> str:
    message = str(error)
    lowered = message.lower()
    if "rate-limit" in lowered or "login required" in lowered or "requested content is not available" in lowered:
        return (
            "Instagram menolak permintaan karena pembatasan akses atau video membutuhkan login. "
            "Tambahkan cookie Instagram terbaru melalui Secret INSTAGRAM_COOKIES_B64 "
            "atau coba lagi nanti."
        )
    if "private" in lowered:
        return "Video Instagram ini bersifat privat dan tidak dapat diakses oleh server."
    return f"Video tidak dapat diproses: {message[:240]}"


def health():
    return {"status": "ok", "service": "snapdown-gradio"}


async def download(request: DownloadRequest):
    try:
        if request.mode == "preview":
            def extract():
                with yt_dlp.YoutubeDL(ytdlp_options(request)) as downloader:
                    info = downloader.extract_info(str(request.url), download=False)
                    return info.get("url")

            preview_url = await asyncio.to_thread(extract)
            if not preview_url:
                raise HTTPException(422, "URL preview tidak tersedia untuk video ini.")
            return {
                "previewUrl": preview_url,
                "filename": f"snapdown-{request.quality}.mp4",
                "type": "video",
            }

        directory = tempfile.mkdtemp(prefix="snapdown-")
        output = str(Path(directory) / "video.%(ext)s")

        def fetch_file():
            with yt_dlp.YoutubeDL(ytdlp_options(request, output)) as downloader:
                downloader.download([str(request.url)])

        await asyncio.to_thread(fetch_file)
        files = list(Path(directory).glob("video.*"))
        if not files:
            raise HTTPException(502, "yt-dlp tidak menghasilkan file.")
        return FileResponse(
            files[0],
            media_type="video/mp4",
            filename=f"snapdown-{request.quality}.mp4",
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(502, friendly_error(error))


@spaces.GPU
def gradio_status(url: str, quality: str):
    if not url.strip():
        return "Masukkan URL video terlebih dahulu."
    try:
        request = DownloadRequest(url=url.strip(), quality=quality, mode="preview")
        with yt_dlp.YoutubeDL(ytdlp_options(request)) as downloader:
            info = downloader.extract_info(url.strip(), download=False)
        return f"Video siap diproses: {info.get('title', 'tanpa judul')}"
    except Exception as error:
        return f"Gagal: {friendly_error(error)}"


with gr.Blocks(title="Snapdown yt-dlp") as demo:
    gr.Markdown("# Snapdown downloader\nBackend yt-dlp untuk Facebook, Instagram, dan TikTok.")
    with gr.Row():
        url_input = gr.Textbox(label="URL video", placeholder="https://...")
        quality_input = gr.Dropdown(
            choices=["1080p", "720p", "480p"],
            value="720p",
            label="Kualitas",
        )
    check_button = gr.Button("Cek video")
    status_output = gr.Textbox(label="Status", interactive=False)
    check_button.click(
        gradio_status,
        inputs=[url_input, quality_input],
        outputs=status_output,
        api_name="check_video",
        concurrency_limit=1,
    )

demo.app.add_api_route("/health", health, methods=["GET"])
demo.app.add_api_route("/download", download, methods=["POST"])

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        show_error=True,
    )
