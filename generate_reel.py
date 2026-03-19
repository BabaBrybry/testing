#!/usr/bin/env python3
"""
SlopSort Reel Generator — Parameterized MP4 renderer for ReelProject JSON.

Reads a ReelProject JSON file produced by the reel editor and renders
each frame with Pillow, then encodes to MP4 via FFmpeg.

Usage:
  python3 generate_reel.py --project project.json --output output.mp4

Dependencies:
  pip install Pillow
  System: ffmpeg
"""

import argparse
import glob as glob_mod
import json
import os
import shutil
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------------------
# Pillow
# ---------------------------------------------------------------------------

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

# ---------------------------------------------------------------------------
# Font helpers (from generate_video.py)
# ---------------------------------------------------------------------------

def _find_font(size, bold=False):
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
    for pattern in candidates:
        if "*" in pattern:
            matches = glob_mod.glob(pattern)
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


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def draw_text_wrapped(draw, text, x, y, max_width, font, fill, align="left"):
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
    draw.rectangle([x1 + radius, y1, x2 - radius, y2], fill=fill)
    draw.rectangle([x1, y1 + radius, x2, y2 - radius], fill=fill)
    draw.ellipse([x1, y1, x1 + 2*radius, y1 + 2*radius], fill=fill)
    draw.ellipse([x2 - 2*radius, y1, x2, y1 + 2*radius], fill=fill)
    draw.ellipse([x1, y2 - 2*radius, x1 + 2*radius, y2], fill=fill)
    draw.ellipse([x2 - 2*radius, y2 - 2*radius, x2, y2], fill=fill)


# ---------------------------------------------------------------------------
# Resolve style: merge per-frame overrides with globals
# ---------------------------------------------------------------------------

STYLE_KEYS = ["bgColor", "cardColor", "accentColor", "textColor", "mutedColor", "brandName", "siteUrl"]

GLOBAL_DEFAULTS = {
    "bgColor": "#0f172a",
    "cardColor": "#1e293b",
    "accentColor": "#a3e635",
    "textColor": "#ffffff",
    "mutedColor": "#94a3b8",
    "brandName": "SLOPSORT",
    "siteUrl": "slopsort.com",
}


def resolve_style(frame, globals_dict):
    style = {}
    for key in STYLE_KEYS:
        frame_val = frame.get("style", {}).get(key)
        style[key] = frame_val if frame_val is not None else globals_dict.get(key, GLOBAL_DEFAULTS.get(key))
    return style


# ---------------------------------------------------------------------------
# Frame renderers
# ---------------------------------------------------------------------------

def render_intro(content, style, w, h):
    bg = hex_to_rgb(style["bgColor"])
    card = hex_to_rgb(style["cardColor"])
    accent = hex_to_rgb(style["accentColor"])
    text = hex_to_rgb(style["textColor"])
    muted = hex_to_rgb(style["mutedColor"])

    img = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(img)

    # Gradient background
    for i in range(h):
        t = i / h
        r = int(bg[0] + (card[0] - bg[0]) * t * 0.4)
        g = int(bg[1] + (card[1] - bg[1]) * t * 0.4)
        b = int(bg[2] + (card[2] - bg[2]) * t * 0.4)
        draw.line([(0, i), (w, i)], fill=(r, g, b))

    pad = 80

    # Badge
    badge_text = content.get("badge", "TOP 5 COUNTDOWN")
    badge_w, badge_h = 500, 72
    bx = (w - badge_w) // 2
    by = 180
    draw_rounded_rect(draw, bx, by, bx + badge_w, by + badge_h, 36, accent)
    font_badge = _find_font(32, bold=True)
    bbox = draw.textbbox((0, 0), badge_text, font=font_badge)
    tw = bbox[2] - bbox[0]
    draw.text((bx + (badge_w - tw) // 2, by + 18), badge_text, font=font_badge, fill=bg)

    # Title
    title = content.get("title", "")
    font_title = _find_font(72, bold=True)
    ty = by + badge_h + 80
    ty = draw_text_wrapped(draw, title, pad, ty, w - 2*pad, font_title, text, align="center")

    # Subtitle
    subtitle = content.get("subtitle", "")
    if subtitle:
        font_sub = _find_font(42)
        ty += 40
        draw_text_wrapped(draw, subtitle, pad, ty, w - 2*pad, font_sub, muted, align="center")

    # Bottom bar
    bar_y = h - 200
    draw.rectangle([0, bar_y, w, h], fill=card)
    tagline = content.get("tagline", "AI consensus ranking")
    font_cta = _find_font(40, bold=True)
    draw_text_wrapped(draw, tagline, pad, bar_y + 50, w - 2*pad, font_cta, accent, align="center")

    return img


def render_rank_card(content, style, w, h):
    bg = hex_to_rgb(style["bgColor"])
    card_color = hex_to_rgb(style["cardColor"])
    accent = hex_to_rgb(style["accentColor"])
    text = hex_to_rgb(style["textColor"])
    muted = hex_to_rgb(style["mutedColor"])
    dark_accent = tuple(max(0, int(c * 0.5)) for c in accent)

    img = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(img)

    # Subtle diagonal lines
    for i in range(0, w, 60):
        draw.line([(i, 0), (i + h, h)], fill=(bg[0]+15, bg[1]+17, bg[2]+18), width=1)

    pad = 60
    cx = w // 2

    rank = content.get("rank", 1)
    name = content.get("name", "Item")
    note = content.get("note", "")

    # Position text
    font_pos = _find_font(38)
    draw.text((cx - 40, 100), f"#{rank}", font=font_pos, fill=muted)

    # Big rank number
    font_rank = _find_font(200, bold=True)
    rank_str = f"#{rank}"
    bbox = draw.textbbox((0, 0), rank_str, font=font_rank)
    rw = bbox[2] - bbox[0]
    rank_y = 160
    draw.text((cx - rw//2 + 4, rank_y + 4), rank_str, font=font_rank, fill=dark_accent)
    draw.text((cx - rw//2, rank_y), rank_str, font=font_rank, fill=accent)

    # Product card
    card_y = rank_y + (bbox[3] - bbox[1]) + 40
    card_h = 340
    draw_rounded_rect(draw, pad, card_y, w - pad, card_y + card_h, 28, card_color)
    draw.rectangle([pad, card_y, w - pad, card_y + 6], fill=accent)

    # Name
    font_name = _find_font(64, bold=True)
    name_y = card_y + 50
    name_y = draw_text_wrapped(draw, name, pad + 30, name_y, w - 2*pad - 60, font_name, text, align="center")

    # Note
    if note:
        font_note = _find_font(36)
        name_y += 20
        draw_text_wrapped(draw, note, pad + 30, name_y, w - 2*pad - 60, font_note, muted, align="center")

    # Bottom bar
    why_y = h - 200
    draw.rectangle([0, why_y, w, h], fill=card_color)
    brand = style.get("brandName", "SLOPSORT")
    font_brand = _find_font(34, bold=True)
    draw_text_wrapped(draw, brand, pad, why_y + 50, w - 2*pad, font_brand, accent, align="center")
    font_disc = _find_font(28)
    draw_text_wrapped(draw, style.get("siteUrl", "slopsort.com"), pad, why_y + 110, w - 2*pad, font_disc, muted, align="center")

    return img


def render_outro(content, style, w, h):
    bg = hex_to_rgb(style["bgColor"])
    card = hex_to_rgb(style["cardColor"])
    accent = hex_to_rgb(style["accentColor"])
    text = hex_to_rgb(style["textColor"])
    muted = hex_to_rgb(style["mutedColor"])

    img = Image.new("RGB", (w, h), bg)
    draw = ImageDraw.Draw(img)

    # Gradient
    for i in range(h):
        t = i / h
        r = int(bg[0] * (1 - t * 0.3))
        g = int(bg[1] * (1 - t * 0.1))
        b = int(min(255, bg[2] + 30 * t))
        draw.line([(0, i), (w, i)], fill=(r, g, b))

    pad = 80
    cx = w // 2

    font_big = _find_font(88, bold=True)
    font_sm = _find_font(40)

    headline = content.get("headline", "See The Full Rankings")
    y = 350
    y = draw_text_wrapped(draw, headline, pad, y, w - 2*pad, font_big, text, align="center")

    y += 80
    url_text = content.get("url", style.get("siteUrl", "slopsort.com"))
    font_url = _find_font(52, bold=True)
    bbox_u = draw.textbbox((0, 0), url_text, font=font_url)
    uw = bbox_u[2] - bbox_u[0] + 80
    uh = bbox_u[3] - bbox_u[1] + 40
    ux = cx - uw // 2
    draw_rounded_rect(draw, ux, y, ux + uw, y + uh, uh // 2, accent)
    draw.text((ux + 40, y + 20), url_text, font=font_url, fill=bg)

    y += uh + 60
    tagline = content.get("tagline", "Free - No account needed")
    draw_text_wrapped(draw, tagline, pad, y, w - 2*pad, font_sm, muted, align="center")

    # Bottom strip
    strip_y = h - 260
    draw.rectangle([0, strip_y, w, h], fill=card)
    brand = style.get("brandName", "SLOPSORT")
    font_badge = _find_font(36, bold=True)
    y2 = strip_y + 40
    draw_text_wrapped(draw, brand, pad, y2, w - 2*pad, font_badge, accent, align="center")
    y2 += 60
    font_tagline = _find_font(32)
    site_url = style.get("siteUrl", "slopsort.com")
    draw_text_wrapped(draw, site_url, pad, y2, w - 2*pad, font_tagline, muted, align="center")

    return img


RENDERERS = {
    "intro": render_intro,
    "rank_card": render_rank_card,
    "outro": render_outro,
}


# ---------------------------------------------------------------------------
# Main generation pipeline
# ---------------------------------------------------------------------------

def generate(project, output_path):
    globals_dict = {**GLOBAL_DEFAULTS, **project.get("globals", {})}
    frames = project.get("frames", [])
    width = globals_dict.get("width", 1080)
    height = globals_dict.get("height", 1920)

    if not frames:
        raise ValueError("No frames in project")

    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found. Install it: apt install ffmpeg")

    with tempfile.TemporaryDirectory() as tmp:
        frame_entries = []  # (path, duration)

        for i, frame in enumerate(frames):
            ftype = frame.get("type", "rank_card")
            renderer = RENDERERS.get(ftype)
            if not renderer:
                print(f"WARNING: Unknown frame type '{ftype}', skipping", file=sys.stderr)
                continue

            style = resolve_style(frame, globals_dict)
            content = frame.get("content", {})
            duration = frame.get("duration", 4.0)

            print(f"Rendering frame {i+1}/{len(frames)}: {ftype}", file=sys.stderr)
            img = renderer(content, style, width, height)

            path = os.path.join(tmp, f"{i:03d}_{ftype}.jpg")
            img.save(path, "JPEG", quality=92)
            frame_entries.append((path, duration))

        if not frame_entries:
            raise ValueError("No frames were rendered")

        # Build ffmpeg concat list
        list_path = os.path.join(tmp, "frames.txt")
        with open(list_path, "w") as f:
            for path, dur in frame_entries:
                f.write(f"file '{path}'\n")
                f.write(f"duration {dur:.2f}\n")
            f.write(f"file '{frame_entries[-1][0]}'\n")

        # Encode
        print("Encoding video with ffmpeg...", file=sys.stderr)
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
            "-movflags", "+faststart",
            output_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg encoding failed:\n{result.stderr[-2000:]}")

        total_dur = sum(d for _, d in frame_entries)
        print(f"Video saved: {output_path} ({len(frame_entries)} frames, {total_dur:.1f}s)", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SlopSort Reel Generator")
    parser.add_argument("--project", required=True, help="Path to ReelProject JSON file")
    parser.add_argument("--output", required=True, help="Output MP4 file path")
    args = parser.parse_args()

    if not HAS_PILLOW:
        print("ERROR: Pillow is required. Run: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    try:
        with open(args.project) as f:
            project = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"ERROR: Could not read project file: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        generate(project, args.output)
        print(json.dumps({"success": True, "output": args.output}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
