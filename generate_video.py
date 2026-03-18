#!/usr/bin/env python3
"""
SlopSort Social Video Generator
Generates short vertical MP4 videos (9:16, 1080x1920) from AI consensus rankings.

Usage:
  python3 generate_video.py --data '{"title":"...","products":[...],"elevenlabs_key":"..."}' --output /tmp/output.mp4

Dependencies:
  pip install Pillow requests
  apt/nix: ffmpeg
"""

import argparse
import json
import os
import sys
import tempfile
import textwrap
import subprocess
import struct
import zlib
import math
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Config / brand colours
# ---------------------------------------------------------------------------
BG_COLOR       = (15, 23, 42)       # #0f172a  slate-900
CARD_COLOR     = (30, 41, 59)       # #1e293b  slate-800
CARD2_COLOR    = (51, 65, 85)       # #334155  slate-700
LIME_COLOR     = (163, 230, 53)     # #a3e635  lime-400
AMBER_COLOR    = (245, 158, 11)     # #f59e0b  amber-500
WHITE_COLOR    = (255, 255, 255)
GRAY_COLOR     = (148, 163, 184)    # slate-400
DARK_LIME      = (77, 124, 15)      # lime-700

WIDTH, HEIGHT  = 1080, 1920
FPS            = 30

# ---------------------------------------------------------------------------
# Minimal PNG writer (no Pillow needed for simple cases, but we use Pillow)
# ---------------------------------------------------------------------------

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False
    print("WARNING: Pillow not installed. Install with: pip install Pillow", file=sys.stderr)

# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------

def _find_font(size: int, bold: bool = False) -> "ImageFont.FreeTypeFont | ImageFont.ImageFont":
    """Try to load a TrueType font; fall back to the PIL default."""
    candidates = []
    if bold:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
            "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
            "/nix/store/*/share/fonts/truetype/DejaVuSans-Bold.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/nix/store/*/share/fonts/truetype/DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf",
        ]
    import glob
    for pattern in candidates:
        if "*" in pattern:
            matches = glob.glob(pattern)
            if matches:
                try:
                    return ImageFont.truetype(matches[0], size)
                except Exception:
                    pass
        elif os.path.exists(pattern):
            try:
                return ImageFont.truetype(pattern, size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_text_wrapped(draw, text, x, y, max_width, font, fill, align="left"):
    """Draw text with word-wrapping; return the final y position."""
    words = text.split()
    lines = []
    current = []
    for word in words:
        test = " ".join(current + [word])
        bbox = draw.textbbox((0, 0), test, font=font)
        w = bbox[2] - bbox[0]
        if w <= max_width:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
            current = [word]
    if current:
        lines.append(" ".join(current))

    line_h = draw.textbbox((0, 0), "Ay", font=font)[3] + 6
    cy = y
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        if align == "center":
            cx = x + (max_width - lw) // 2
        elif align == "right":
            cx = x + max_width - lw
        else:
            cx = x
        draw.text((cx, cy), line, font=font, fill=fill)
        cy += line_h
    return cy


def draw_rounded_rect(draw, x1, y1, x2, y2, radius, fill):
    """Draw a filled rounded rectangle."""
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    draw.ellipse([x1, y1, x1 + 2*radius, y1 + 2*radius], fill=fill)
    draw.ellipse([x2 - 2*radius, y1, x2, y1 + 2*radius], fill=fill)
    draw.ellipse([x1, y2 - 2*radius, x1 + 2*radius, y2], fill=fill)
    draw.ellipse([x2 - 2*radius, y2 - 2*radius, x2, y2], fill=fill)


# ---------------------------------------------------------------------------
# Frame generators
# ---------------------------------------------------------------------------

def make_intro_frame(title: str, ai_count: int) -> "Image.Image":
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Gradient-ish background bands
    for i in range(HEIGHT):
        t = i / HEIGHT
        r = int(BG_COLOR[0] + (CARD_COLOR[0] - BG_COLOR[0]) * t * 0.4)
        g = int(BG_COLOR[1] + (CARD_COLOR[1] - BG_COLOR[1]) * t * 0.4)
        b = int(BG_COLOR[2] + (CARD_COLOR[2] - BG_COLOR[2]) * t * 0.4)
        draw.line([(0, i), (WIDTH, i)], fill=(r, g, b))

    # Logo badge
    badge_w, badge_h = 360, 72
    bx = (WIDTH - badge_w) // 2
    by = 180
    draw_rounded_rect(draw, bx, by, bx + badge_w, by + badge_h, 36, LIME_COLOR)
    font_badge = _find_font(32, bold=True)
    draw.text((bx + badge_w//2 - 70, by + 18), "⚡ SLOPSORT", font=font_badge, fill=BG_COLOR)

    # Title
    font_title = _find_font(72, bold=True)
    font_sub = _find_font(42)
    pad = 80
    ty = by + badge_h + 80
    ty = draw_text_wrapped(draw, title, pad, ty, WIDTH - 2*pad, font_title, WHITE_COLOR, align="center")

    # Subtitle
    ty += 40
    subtitle = f"AI consensus from {ai_count}+ models"
    draw_text_wrapped(draw, subtitle, pad, ty, WIDTH - 2*pad, font_sub, GRAY_COLOR, align="center")

    # Bottom bar
    bar_y = HEIGHT - 200
    draw.rectangle([0, bar_y, WIDTH, HEIGHT], fill=CARD_COLOR)
    font_cta = _find_font(40, bold=True)
    draw_text_wrapped(draw, "TOP 5 COUNTDOWN", pad, bar_y + 50, WIDTH - 2*pad, font_cta, LIME_COLOR, align="center")
    font_small = _find_font(32)
    draw_text_wrapped(draw, "No paid placements. No single AI bias.", pad, bar_y + 110, WIDTH - 2*pad, font_small, GRAY_COLOR, align="center")

    return img


def make_product_frame(rank: int, product_name: str, agreement_pct: float, ai_count: int, total: int) -> "Image.Image":
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Subtle background pattern lines
    for i in range(0, WIDTH, 60):
        draw.line([(i, 0), (i + HEIGHT, HEIGHT)], fill=(30, 40, 60), width=1)

    pad = 60
    cx = WIDTH // 2

    # Position indicator (e.g. "#5 of 5")
    font_pos = _find_font(38)
    pos_text = f"#{rank} of {total}"
    draw.text((cx - 60, 100), pos_text, font=font_pos, fill=GRAY_COLOR)

    # Big rank number
    font_rank = _find_font(200, bold=True)
    rank_str = f"#{rank}"
    bbox = draw.textbbox((0, 0), rank_str, font=font_rank)
    rw = bbox[2] - bbox[0]
    rank_y = 160
    # Lime shadow
    draw.text((cx - rw//2 + 4, rank_y + 4), rank_str, font=font_rank, fill=DARK_LIME)
    draw.text((cx - rw//2, rank_y), rank_str, font=font_rank, fill=LIME_COLOR)

    # Product card
    card_y = rank_y + (bbox[3] - bbox[1]) + 40
    card_h = 340
    draw_rounded_rect(draw, pad, card_y, WIDTH - pad, card_y + card_h, 28, CARD_COLOR)

    # Thin lime top border on card
    draw.rectangle([pad, card_y, WIDTH - pad, card_y + 6], fill=LIME_COLOR)

    # Product name
    font_name = _find_font(64, bold=True)
    name_y = card_y + 50
    name_y = draw_text_wrapped(draw, product_name, pad + 30, name_y, WIDTH - 2*pad - 60, font_name, WHITE_COLOR, align="center")

    # Agreement badge
    name_y += 30
    agree_text = f"{agreement_pct:.0f}% AI agreement"
    badge_pad = 24
    font_agree = _find_font(38, bold=True)
    bbox_a = draw.textbbox((0, 0), agree_text, font=font_agree)
    bw = bbox_a[2] - bbox_a[0] + badge_pad * 2
    bh = bbox_a[3] - bbox_a[1] + badge_pad
    bx = cx - bw // 2
    draw_rounded_rect(draw, bx, name_y, bx + bw, name_y + bh, bh // 2, LIME_COLOR)
    draw.text((bx + badge_pad, name_y + badge_pad // 2), agree_text, font=font_agree, fill=BG_COLOR)

    # AI count note
    note_y = name_y + bh + 24
    font_note = _find_font(32)
    draw_text_wrapped(draw, f"Ranked by {ai_count}+ independent AI models", pad + 30, note_y, WIDTH - 2*pad - 60, font_note, GRAY_COLOR, align="center")

    # Bottom "Why this?" bar
    why_y = HEIGHT - 260
    draw.rectangle([0, why_y, WIDTH, HEIGHT], fill=CARD_COLOR)
    font_why_label = _find_font(30)
    font_why = _find_font(34, bold=True)
    draw.text((cx - 80, why_y + 30), "AI CONSENSUS PICK", font=font_why_label, fill=GRAY_COLOR)
    draw_text_wrapped(draw, "slopsort.com", pad, why_y + 80, WIDTH - 2*pad, font_why, LIME_COLOR, align="center")
    font_disc = _find_font(28)
    draw_text_wrapped(draw, "No paid placements • No single AI bias", pad, why_y + 150, WIDTH - 2*pad, font_disc, GRAY_COLOR, align="center")

    return img


def make_outro_frame(site_url: str = "slopsort.com") -> "Image.Image":
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Gradient
    for i in range(HEIGHT):
        t = i / HEIGHT
        r = int(BG_COLOR[0] * (1 - t * 0.3))
        g = int(BG_COLOR[1] * (1 - t * 0.1))
        b = int(min(255, BG_COLOR[2] + 30 * t))
        draw.line([(0, i), (WIDTH, i)], fill=(r, g, b))

    pad = 80
    cx = WIDTH // 2

    # Big CTA
    font_big = _find_font(88, bold=True)
    font_med = _find_font(56, bold=True)
    font_sm  = _find_font(40)

    y = 260
    y = draw_text_wrapped(draw, "See The Full", pad, y, WIDTH - 2*pad, font_big, WHITE_COLOR, align="center")
    y += 10
    y = draw_text_wrapped(draw, "AI Consensus", pad, y, WIDTH - 2*pad, font_big, LIME_COLOR, align="center")
    y += 10
    y = draw_text_wrapped(draw, "Rankings", pad, y, WIDTH - 2*pad, font_big, WHITE_COLOR, align="center")

    y += 80
    # URL pill
    url_text = site_url
    font_url = _find_font(52, bold=True)
    bbox_u = draw.textbbox((0, 0), url_text, font=font_url)
    uw = bbox_u[2] - bbox_u[0] + 80
    uh = bbox_u[3] - bbox_u[1] + 40
    ux = cx - uw // 2
    draw_rounded_rect(draw, ux, y, ux + uw, y + uh, uh // 2, LIME_COLOR)
    draw.text((ux + 40, y + 20), url_text, font=font_url, fill=BG_COLOR)

    y += uh + 60
    draw_text_wrapped(draw, "Free • No account needed", pad, y, WIDTH - 2*pad, font_sm, GRAY_COLOR, align="center")

    # Bottom badge strip
    strip_y = HEIGHT - 300
    draw.rectangle([0, strip_y, WIDTH, HEIGHT], fill=CARD_COLOR)
    font_badge = _find_font(36, bold=True)
    y2 = strip_y + 40
    draw_text_wrapped(draw, "⚡ SLOPSORT", pad, y2, WIDTH - 2*pad, font_badge, LIME_COLOR, align="center")
    y2 += 60
    font_tagline = _find_font(32)
    draw_text_wrapped(draw, "Sorting through the AI slop so you don't have to", pad, y2, WIDTH - 2*pad, font_tagline, GRAY_COLOR, align="center")

    # Social icons row hint
    y2 += 60
    font_social = _find_font(30)
    draw_text_wrapped(draw, "TikTok • Instagram • YouTube Shorts", pad, y2, WIDTH - 2*pad, font_social, GRAY_COLOR, align="center")

    return img


# ---------------------------------------------------------------------------
# ElevenLabs TTS
# ---------------------------------------------------------------------------

def generate_voiceover(script: str, api_key: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM") -> bytes:
    """Call ElevenLabs API and return MP3 bytes."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = json.dumps({
        "text": script,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.3,
            "use_speaker_boost": True
        }
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": api_key,
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ElevenLabs API error {e.code}: {body}")


def build_voiceover_script(title: str, products: list) -> str:
    """Build the TTS narration script for the full video."""
    lines = [
        f"Here are the top {len(products)} picks for {title}, according to AI consensus on SlopSort.",
        "",
    ]
    for i, p in enumerate(reversed(products)):  # #5 → #1
        rank = len(products) - i
        pct = p.get("agreement_pct", 0)
        lines.append(
            f"Number {rank}: {p['name']}. "
            f"{pct:.0f} percent of AI models agree on this pick."
        )
    lines += [
        "",
        "See the full rankings, with no paid placements and no single AI bias, at slopsort dot com.",
    ]
    return " ".join(l for l in lines if l)


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def frames_to_video(frame_paths: list, audio_path: str | None, output_path: str, fps: int = FPS):
    """Use ffmpeg to combine image frames + optional audio into an MP4."""
    import shutil
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found. Install it via: nix-env -iA nixpkgs.ffmpeg or apt install ffmpeg")

    # Write a concat list
    tmp_dir = os.path.dirname(frame_paths[0])
    list_path = os.path.join(tmp_dir, "frames.txt")
    with open(list_path, "w") as f:
        for path in frame_paths:
            f.write(f"file '{path}'\n")

    if audio_path:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-i", audio_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            "-movflags", "+faststart",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path
        ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr}")


def save_frame_sequence(img: "Image.Image", duration_sec: float, tmp_dir: str, prefix: str) -> list:
    """Save a static image as N frames for the given duration at FPS."""
    frame_count = max(1, int(round(duration_sec * FPS)))
    paths = []
    path = os.path.join(tmp_dir, f"{prefix}_000.jpg")
    img.save(path, "JPEG", quality=92)
    # For concat demuxer we can use duration directive instead of repeating files
    # We write one file and use the concat duration approach
    return [(path, duration_sec)]


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate(data: dict, output_path: str):
    title    = data.get("title", "Top Picks")
    products = data.get("products", [])   # [{name, agreement_pct}, ...]
    el_key   = data.get("elevenlabs_key", "")
    el_voice = data.get("elevenlabs_voice_id", "21m00Tcm4TlvDq8ikWAM")
    ai_count = data.get("ai_count", 5)
    site_url = data.get("site_url", "slopsort.com")

    if not products:
        raise ValueError("No products provided")

    # Durations (seconds)
    INTRO_DUR   = 3.0
    PRODUCT_DUR = 4.5
    OUTRO_DUR   = 4.0

    with tempfile.TemporaryDirectory() as tmp:
        # ---- Generate frames ----
        print("Generating intro frame...", file=sys.stderr)
        intro_img = make_intro_frame(title, ai_count)

        print("Generating product frames...", file=sys.stderr)
        product_imgs = []
        # Show from #5 down to #1 (reversed order: last product = #1)
        displayed = products[:5]  # top 5
        for idx, p in enumerate(reversed(displayed)):
            rank = len(displayed) - idx
            pct  = p.get("agreement_pct", 0)
            img  = make_product_frame(rank, p["name"], pct, ai_count, len(displayed))
            product_imgs.append(img)

        print("Generating outro frame...", file=sys.stderr)
        outro_img = make_outro_frame(site_url)

        # ---- Save frames with durations ----
        frame_entries = []  # list of (path, duration)

        def save_img(img, prefix, dur):
            path = os.path.join(tmp, f"{prefix}.jpg")
            img.save(path, "JPEG", quality=92)
            frame_entries.append((path, dur))

        save_img(intro_img, "00_intro", INTRO_DUR)
        for i, img in enumerate(product_imgs):
            save_img(img, f"{i+1:02d}_product", PRODUCT_DUR)
        save_img(outro_img, "99_outro", OUTRO_DUR)

        # ---- Build ffmpeg concat list ----
        list_path = os.path.join(tmp, "frames.txt")
        with open(list_path, "w") as f:
            for (path, dur) in frame_entries:
                f.write(f"file '{path}'\n")
                f.write(f"duration {dur:.2f}\n")
            # repeat last frame (ffmpeg concat quirk)
            f.write(f"file '{frame_entries[-1][0]}'\n")

        # ---- Generate voiceover ----
        audio_path = None
        if el_key and el_key.strip():
            print("Generating voiceover via ElevenLabs...", file=sys.stderr)
            try:
                script = build_voiceover_script(title, list(reversed(displayed)))
                audio_bytes = generate_voiceover(script, el_key, el_voice)
                audio_path = os.path.join(tmp, "voiceover.mp3")
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)
                print(f"Voiceover saved ({len(audio_bytes)} bytes)", file=sys.stderr)
            except Exception as e:
                print(f"WARNING: Voiceover generation failed: {e}", file=sys.stderr)
                audio_path = None
        else:
            print("No ElevenLabs key provided — skipping voiceover", file=sys.stderr)

        # ---- Encode video ----
        print("Encoding video with ffmpeg...", file=sys.stderr)
        import shutil
        if not shutil.which("ffmpeg"):
            raise RuntimeError(
                "ffmpeg not found. Install it:\n"
                "  Replit: add 'ffmpeg' to replit.nix pkgs\n"
                "  Ubuntu: sudo apt install ffmpeg"
            )

        if audio_path:
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", list_path,
                "-i", audio_path,
                "-c:v", "libx264", "-preset", "fast", "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-vf", f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                "-movflags", "+faststart",
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0", "-i", list_path,
                "-c:v", "libx264", "-preset", "fast", "-crf", "22",
                "-pix_fmt", "yuv420p",
                "-vf", f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2",
                "-movflags", "+faststart",
                output_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg encoding failed:\n{result.stderr[-2000:]}")

        print(f"Video saved to: {output_path}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SlopSort Social Video Generator")
    parser.add_argument("--data", required=True, help="JSON string with video data")
    parser.add_argument("--output", required=True, help="Output MP4 file path")
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON data: {e}", file=sys.stderr)
        sys.exit(1)

    if not HAS_PILLOW:
        print("ERROR: Pillow is required. Run: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    try:
        generate(data, args.output)
        print(json.dumps({"success": True, "output": args.output}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
