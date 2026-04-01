// export.js — Client-side canvas capture → WebM export

import { CanvasRenderer } from './canvas-renderer.js';

export class Exporter {
  constructor(state) {
    this.state = state;

    document.getElementById('btn-export')?.addEventListener('click', () => {
      this.exportVideo();
    });
  }

  async exportVideo() {
    const state = this.state;
    const cards = state.cards;
    const totalDuration = cards.reduce((s, c) => s + c.duration, 0);

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'export-overlay';
    overlay.innerHTML = `
      <div class="export-box">
        <h3>Exporting Video...</h3>
        <p id="export-status">Preparing...</p>
        <div class="export-progress">
          <div class="export-progress-bar" id="export-bar" style="width:0%"></div>
        </div>
        <button id="export-cancel" style="margin-top:16px">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let cancelled = false;
    document.getElementById('export-cancel').addEventListener('click', () => {
      cancelled = true;
    });

    try {
      // Create offscreen canvas
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 1080;
      offCanvas.height = 1920;
      const renderer = new CanvasRenderer(offCanvas);

      // Pre-load all images
      for (const card of cards) {
        for (const layer of card.layers) {
          if (layer.type === 'image' && layer.src) {
            renderer.getCachedImage(layer.src);
          }
          if (layer.type === 'background' && layer.background?.imageSrc) {
            renderer.getCachedImage(layer.background.imageSrc);
          }
        }
      }
      // Wait for images to load
      await new Promise(r => setTimeout(r, 500));

      const fps = 30;
      const stream = offCanvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType: this._getSupportedMimeType(),
        videoBitsPerSecond: 8000000,
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const done = new Promise((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();

      // Render each card for its duration
      let elapsed = 0;
      for (let ci = 0; ci < cards.length; ci++) {
        if (cancelled) break;
        const card = cards[ci];
        const frames = Math.round(card.duration * fps);

        for (let f = 0; f < frames; f++) {
          if (cancelled) break;
          renderer.render(card);
          elapsed += 1 / fps;

          const pct = Math.min(100, (elapsed / totalDuration) * 100);
          document.getElementById('export-bar').style.width = pct + '%';
          document.getElementById('export-status').textContent =
            `Card ${ci + 1}/${cards.length} — ${Math.round(pct)}%`;

          // Yield to let MediaRecorder capture the frame
          await new Promise(r => setTimeout(r, 1000 / fps));
        }
      }

      recorder.stop();
      await done;

      if (!cancelled && chunks.length > 0) {
        const blob = new Blob(chunks, { type: chunks[0].type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (state.project.name || 'reel') + '.webm';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed: ' + err.message);
    } finally {
      overlay.remove();
    }
  }

  _getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm';
  }
}
