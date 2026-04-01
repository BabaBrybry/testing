// timeline.js — Card thumbnail strip, reorder, duration, add/dup/delete

import { CanvasRenderer } from './canvas-renderer.js';

export class Timeline {
  constructor(stripEl, state) {
    this.stripEl = stripEl;
    this.state = state;
    this.thumbRenderer = null; // lazy-init

    state.on('cards-changed', () => this.render());
    state.on('card-selected', () => this.render());
    state.on('layer-changed', () => this._updateCurrentThumb());
    state.on('layers-changed', () => this._updateCurrentThumb());

    // Card actions
    document.getElementById('btn-add-card')?.addEventListener('click', () => {
      state.addCard(state.selectedCardIndex);
    });
    document.getElementById('btn-dup-card')?.addEventListener('click', () => {
      state.duplicateCard(state.selectedCardIndex);
    });
    document.getElementById('btn-del-card')?.addEventListener('click', () => {
      state.removeCard(state.selectedCardIndex);
    });

    // Duration slider
    const durationSlider = document.getElementById('card-duration');
    const durationVal = document.getElementById('card-duration-val');
    durationSlider?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      durationVal.textContent = v.toFixed(1) + 's';
      state.setCardDuration(state.selectedCardIndex, v);
    });

    // Update duration display on card select
    state.on('card-selected', (idx) => {
      const card = state.getCard(idx);
      if (card && durationSlider) {
        durationSlider.value = card.duration;
        durationVal.textContent = card.duration.toFixed(1) + 's';
      }
    });

    // Update total time display
    state.on('cards-changed', () => this._updateTimeDisplay());
    state.on('card-selected', () => this._updateTimeDisplay());
  }

  render() {
    const cards = this.state.cards;

    this.stripEl.innerHTML = cards.map((card, i) => {
      const selected = i === this.state.selectedCardIndex;
      return `
        <div class="timeline-card ${selected ? 'selected' : ''}" data-index="${i}" draggable="true">
          <canvas width="108" height="192"></canvas>
          <span class="card-duration-label">${card.duration.toFixed(1)}s</span>
        </div>
      `;
    }).join('');

    // Render thumbnails
    this.stripEl.querySelectorAll('.timeline-card').forEach((el, i) => {
      const thumbCanvas = el.querySelector('canvas');
      this._renderThumb(thumbCanvas, cards[i]);

      // Click to select
      el.addEventListener('click', () => {
        this.state.selectCard(i);
      });

      // Drag to reorder
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (!isNaN(from) && from !== to) {
          this.state.reorderCards(from, to);
        }
      });
    });
  }

  _renderThumb(canvas, card) {
    if (!this.thumbRenderer) {
      this.thumbRenderer = new CanvasRenderer(canvas);
    } else {
      this.thumbRenderer.canvas = canvas;
      this.thumbRenderer.ctx = canvas.getContext('2d');
    }
    // Scale down: 108x192 thumbnail for 1080x1920 canvas
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(108 / 1080, 192 / 1920);
    this.thumbRenderer.render(card);
    ctx.restore();
  }

  _updateCurrentThumb() {
    const idx = this.state.selectedCardIndex;
    const el = this.stripEl.querySelector(`[data-index="${idx}"] canvas`);
    if (el) {
      const card = this.state.getCard(idx);
      if (card) this._renderThumb(el, card);
    }
  }

  _updateTimeDisplay() {
    const timeEl = document.getElementById('timeline-time');
    if (!timeEl) return;
    const total = this.state.cards.reduce((sum, c) => sum + c.duration, 0);
    const current = this.state.cards.slice(0, this.state.selectedCardIndex).reduce((sum, c) => sum + c.duration, 0);
    timeEl.textContent = `${this._fmt(current)} / ${this._fmt(total)}`;
  }

  _fmt(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
