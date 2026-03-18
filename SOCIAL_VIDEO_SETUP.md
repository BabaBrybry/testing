# SlopSort Social Video Generator — Setup Guide

Generates short vertical MP4 videos (9:16, ~25s) from AI consensus rankings
for posting on **TikTok**, **Instagram Reels**, and **YouTube Shorts**.

---

## Files in This Patch

| File | Purpose |
|------|---------|
| `generate_video.py` | Python script: Pillow frames + ElevenLabs audio + FFmpeg encoding |
| `video_routes.js` | Express routes to add to `server.js` |
| `admin_social_tab_patch.html` | React component + integration instructions for `public/index.html` |

---

## Quick Setup (Replit)

### 1. Copy files into your Replit project
Upload or copy these 3 files into the root of your Replit project:
- `generate_video.py`
- `video_routes.js`

### 2. Install Python dependency
In the **Replit Shell**:
```bash
pip install Pillow
```

### 3. Add ffmpeg to replit.nix
Edit your `replit.nix` (or `.replit`) to include ffmpeg:
```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
    pkgs.ffmpeg        # <-- add this
    pkgs.python3       # <-- add this if not present
  ];
}
```
Then click **Stop** and **Run** to reload the Nix environment.

### 4. Add your ElevenLabs API key
In Replit **Secrets** (the padlock icon), add:
- **Key:** `ELEVENLABS_API_KEY`
- **Value:** your key from [elevenlabs.io](https://elevenlabs.io)

If you don't add a key, videos will generate without voiceover (silent).

### 5. Update server.js (2 lines)
At the **top** of `server.js`, after other `require` statements:
```js
const { registerVideoRoutes } = require('./video_routes');
```

Near the **bottom** of `server.js`, before `app.listen(...)`:
```js
registerVideoRoutes(app, pool, isAdminAuth, getSiteSettings);
```

### 6. Update public/index.html

**Add tab button** (in your tab navigation bar):
```jsx
<button
  onClick={() => setActiveTab('social')}
  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    activeTab === 'social'
      ? 'bg-lime-400 text-slate-900'
      : 'text-slate-300 hover:text-white'
  }`}
>
  📱 Social Media
</button>
```

**Add tab content** (near other `{activeTab === '...' && ...}` blocks):
```jsx
{activeTab === 'social' && (
  <SocialMediaTab projectId={selectedProject?.id} />
)}
```

**Add the React component** — copy the entire `<script type="text/babel">` block
from `admin_social_tab_patch.html` into your `public/index.html` admin script section.

**Remove the old Pinterest button** from its current location — it's now inside `SocialMediaTab`.

---

## How It Works

```
Admin clicks "Generate Video"
        │
        ▼
POST /api/admin/projects/:id/generate-video
        │
        ├─ Fetch top 5 products from DB
        ├─ Call ElevenLabs API → voiceover MP3
        │
        ├─ Spawn generate_video.py
        │     ├─ Pillow: draw intro frame
        │     ├─ Pillow: draw product frames (#5 → #1)
        │     ├─ Pillow: draw outro/CTA frame
        │     └─ FFmpeg: concat frames + audio → MP4
        │
        └─ Stream MP4 to browser as download
```

### Video structure
| Segment | Duration | Content |
|---------|----------|---------|
| Intro | 3s | Title + "⚡ SLOPSORT" badge |
| #5 reveal | 4.5s | Rank, product name, % AI agreement |
| #4 reveal | 4.5s | … |
| #3 reveal | 4.5s | … |
| #2 reveal | 4.5s | … |
| #1 reveal | 4.5s | … |
| Outro | 4s | "See full rankings at slopsort.com" CTA |
| **Total** | **~28s** | |

### Visual style
- **1080×1920** px (9:16 vertical)
- Dark slate background (`#0f172a`)
- Lime-green accents (`#a3e635`) matching SlopSort brand
- Bold rank numbers, product name card, AI agreement badge

---

## ElevenLabs Voice IDs

The default voice is **Rachel** (`21m00Tcm4TlvDq8ikWAM`).

Browse voices at [elevenlabs.io/voice-library](https://elevenlabs.io/voice-library) and paste the voice ID into the admin UI.

---

## Troubleshooting

**"ffmpeg not found"**
→ Add `pkgs.ffmpeg` to `replit.nix` and restart Replit.

**"Pillow not installed"**
→ Run `pip install Pillow` in the Shell.

**"ElevenLabs API error 401"**
→ Check your `ELEVENLABS_API_KEY` secret — make sure it's correct and active.

**"No top-5 ranked products found"**
→ Make sure the ranking has been published and has at least 1 product with `consensus_rank <= 5`.

**Video generates but is silent**
→ Either `ELEVENLABS_API_KEY` is not set, or the ElevenLabs call failed (check server logs).

**Video takes too long**
→ Normal on first run — Pillow frame generation + ElevenLabs + FFmpeg can take 30–60s.
   The admin UI shows a spinner. Subsequent runs are faster.
