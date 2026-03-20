// preview-player.js — Sequential card playback with timing

export class PreviewPlayer {
  constructor(renderer, state) {
    this.renderer = renderer;
    this.state = state;
    this.playing = false;
    this.timer = null;
    this.cardIndex = 0;
    this.startTime = 0;

    const btn = document.getElementById('btn-play');
    btn?.addEventListener('click', () => {
      if (this.playing) this.stop(); else this.play();
    });
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.cardIndex = 0;
    this._playCard(0);
    document.getElementById('btn-play').textContent = 'Stop';
  }

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    document.getElementById('btn-play').textContent = 'Play';
    // Restore to selected card
    this.state.selectCard(this.state.selectedCardIndex);
    this.renderer.render(this.state.getSelectedCard());
  }

  _playCard(index) {
    if (!this.playing || index >= this.state.cards.length) {
      this.stop();
      return;
    }

    const card = this.state.cards[index];
    this.cardIndex = index;
    this.renderer.render(card);

    // Highlight in timeline
    document.querySelectorAll('.timeline-card').forEach((el, i) => {
      el.classList.toggle('selected', i === index);
    });

    // Update time display
    const elapsed = this.state.cards.slice(0, index).reduce((s, c) => s + c.duration, 0);
    const total = this.state.cards.reduce((s, c) => s + c.duration, 0);
    const timeEl = document.getElementById('timeline-time');
    if (timeEl) {
      const m = Math.floor(elapsed / 60);
      const s = Math.floor(elapsed % 60);
      const tm = Math.floor(total / 60);
      const ts = Math.floor(total % 60);
      timeEl.textContent = `${m}:${s.toString().padStart(2, '0')} / ${tm}:${ts.toString().padStart(2, '0')}`;
    }

    this.timer = setTimeout(() => {
      this._playCard(index + 1);
    }, card.duration * 1000);
  }
}
