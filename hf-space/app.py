import asyncio
import tempfile
from pathlib import Path
from typing import Literal

import gradio as gr
import yt_dlp
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

QUALITY_FORMATS = {
    "1080p": "bestvideo[height<=1080][ext=mp4]+bestaudio/best[height<=1080]/best",
    "720p": "bestvideo[height<=720][ext=mp4]+bestaudio/best[height<=720]/best",
    "480p": "bestvideo[height<=480][ext=mp4]+bestaudio/best[height<=480]/best",
}

app = FastAPI(title="Snapdown yt-dlp downloader")
app.add_middleware(
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
    return {
        "format": QUALITY_FORMATS[request.quality],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        **({"outtmpl": output} if output else {}),
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "snapdown-gradio"}


@app.post("/download")
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
        raise HTTPException(502, f"Video tidak dapat diproses: {str(error)[:240]}")


def gradio_status(url: str, quality: str):
    if not url.strip():
        return "Masukkan URL video terlebih dahulu."
    try:
        request = DownloadRequest(url=url.strip(), quality=quality, mode="preview")
        with yt_dlp.YoutubeDL(ytdlp_options(request)) as downloader:
            info = downloader.extract_info(url.strip(), download=False)
        return f"Video siap diproses: {info.get('title', 'tanpa judul')}"
    except Exception as error:
        return f"Gagal: {str(error)[:180]}"


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
    )

app = gr.mount_gradio_app(app, demo, path="/")

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=7860,
    )
