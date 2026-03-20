// canvas-renderer.js — Draws all layers of a card to a Canvas 2D context

import { degToRad, hexToRgba } from './utils.js';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageCache = new Map(); // src → HTMLImageElement
  }

  render(card) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!card || !card.layers) return;

    for (const layer of card.layers) {
      if (!layer.visible) continue;
      switch (layer.type) {
        case 'background':
          this.drawBackground(ctx, layer, w, h);
          break;
        case 'text':
          this.drawText(ctx, layer);
          break;
        case 'image':
          this.drawImage(ctx, layer);
          break;
      }
    }
  }

  drawBackground(ctx, layer, w, h) {
    const bg = layer.background;
    if (!bg) return;

    switch (bg.kind) {
      case 'solid':
        ctx.fillStyle = bg.color || '#000000';
        ctx.fillRect(0, 0, w, h);
        break;
      case 'gradient': {
        const g = bg.gradient || { from: '#000', to: '#333', angle: 180 };
        const angle = degToRad(g.angle || 180);
        const cx = w / 2, cy = h / 2;
        const len = Math.max(w, h);
        const x0 = cx - Math.cos(angle) * len / 2;
        const y0 = cy - Math.sin(angle) * len / 2;
        const x1 = cx + Math.cos(angle) * len / 2;
        const y1 = cy + Math.sin(angle) * len / 2;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, g.from);
        grad.addColorStop(1, g.to);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'image': {
        if (bg.imageSrc) {
          const img = this.getCachedImage(bg.imageSrc);
          if (img && img.complete && img.naturalWidth) {
            this.drawCover(ctx, img, 0, 0, w, h);
          }
        }
        break;
      }
    }
  }

  drawText(ctx, layer) {
    ctx.save();

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate(degToRad(layer.rotation || 0));
    ctx.globalAlpha = layer.opacity != null ? layer.opacity : 1;

    // Background fill
    if (layer.backgroundColor) {
      ctx.fillStyle = layer.backgroundColor;
      ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
    }

    // Font setup
    const style = layer.fontStyle === 'italic' ? 'italic' : '';
    const weight = layer.fontWeight === 'bold' ? 'bold' : '';
    ctx.font = `${style} ${weight} ${layer.fontSize}px ${layer.fontFamily || 'sans-serif'}`.trim();
    ctx.fillStyle = layer.color || '#ffffff';
    ctx.textAlign = layer.textAlign || 'center';
    ctx.textBaseline = 'top';

    // Word-wrap text
    const lines = this.wrapText(ctx, layer.text || '', layer.width);
    const lineH = layer.fontSize * (layer.lineHeight || 1.2);
    const totalH = lines.length * lineH;
    let startY = -totalH / 2;

    // Determine x anchor based on alignment
    let anchorX = 0;
    if (layer.textAlign === 'left') anchorX = -layer.width / 2;
    else if (layer.textAlign === 'right') anchorX = layer.width / 2;

    for (const line of lines) {
      // Outline
      if (layer.outline && layer.outline.width > 0) {
        ctx.strokeStyle = layer.outline.color || '#000000';
        ctx.lineWidth = layer.outline.width;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, anchorX, startY);
      }
      // Shadow
      if (layer.shadow) {
        ctx.save();
        ctx.shadowOffsetX = layer.shadow.offsetX || 0;
        ctx.shadowOffsetY = layer.shadow.offsetY || 0;
        ctx.shadowBlur = layer.shadow.blur || 0;
        ctx.shadowColor = layer.shadow.color || 'rgba(0,0,0,0.5)';
        ctx.fillText(line, anchorX, startY);
        ctx.restore();
      } else {
        ctx.fillText(line, anchorX, startY);
      }
      startY += lineH;
    }

    ctx.restore();
  }

  drawImage(ctx, layer) {
    const img = this.getCachedImage(layer.src);
    if (!img || !img.complete || !img.naturalWidth) return;

    ctx.save();

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    ctx.translate(cx, cy);
    ctx.rotate(degToRad(layer.rotation || 0));
    ctx.globalAlpha = layer.opacity != null ? layer.opacity : 1;

    if (layer.objectFit === 'contain') {
      this.drawContain(ctx, img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    } else if (layer.objectFit === 'fill') {
      ctx.drawImage(img, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    } else {
      // cover (default)
      this.drawCoverCentered(ctx, img, layer.width, layer.height);
    }

    ctx.restore();
  }

  // --- Helpers ---

  wrapText(ctx, text, maxWidth) {
    const paragraphs = text.split('\n');
    const lines = [];
    for (const para of paragraphs) {
      const words = para.split(' ');
      let currentLine = '';
      for (const word of words) {
        const test = currentLine ? currentLine + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      }
      lines.push(currentLine);
    }
    return lines;
  }

  drawCover(ctx, img, x, y, w, h) {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = w / h;
    let sw, sh, sx, sy;
    if (imgRatio > boxRatio) {
      sh = img.naturalHeight;
      sw = sh * boxRatio;
      sx = (img.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw / boxRatio;
      sx = 0;
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  drawCoverCentered(ctx, img, w, h) {
    this.drawCover(ctx, img, -w / 2, -h / 2, w, h);
  }

  drawContain(ctx, img, x, y, w, h) {
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const boxRatio = w / h;
    let dw, dh;
    if (imgRatio > boxRatio) {
      dw = w;
      dh = w / imgRatio;
    } else {
      dh = h;
      dw = h * imgRatio;
    }
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  getCachedImage(src) {
    if (!src) return null;
    if (this.imageCache.has(src)) return this.imageCache.get(src);
    const img = new Image();
    img.src = src;
    this.imageCache.set(src, img);
    img.onload = () => this.onImageLoaded && this.onImageLoaded();
    return img;
  }
}
