// layer-panel.js — Left sidebar: layer list, z-order, visibility, lock, delete

export class LayerPanel {
  constructor(listEl, state) {
    this.listEl = listEl;
    this.state = state;

    state.on('layers-changed', () => this.render());
    state.on('layer-selected', () => this.render());
    state.on('card-selected', () => this.render());

    // Button wiring
    document.getElementById('btn-layer-up')?.addEventListener('click', () => {
      if (state.selectedLayerId) state.moveLayerUp(state.selectedLayerId);
    });
    document.getElementById('btn-layer-down')?.addEventListener('click', () => {
      if (state.selectedLayerId) state.moveLayerDown(state.selectedLayerId);
    });
    document.getElementById('btn-layer-delete')?.addEventListener('click', () => {
      if (state.selectedLayerId) state.removeLayer(state.selectedLayerId);
    });
  }

  render() {
    const card = this.state.getSelectedCard();
    if (!card) { this.listEl.innerHTML = ''; return; }

    // Render layers in reverse order (top layer first in the list)
    const layers = [...card.layers].reverse();

    this.listEl.innerHTML = layers.map(layer => {
      const selected = layer.id === this.state.selectedLayerId;
      const icon = layer.type === 'background' ? '&#9632;' : layer.type === 'text' ? 'T' : '&#x1F5BC;';
      const name = layer.type === 'background' ? 'Background' :
                   layer.type === 'text' ? (layer.text || 'Text').slice(0, 20) :
                   'Image';
      return `
        <div class="layer-item ${selected ? 'selected' : ''} ${layer.locked ? 'locked' : ''}" data-id="${layer.id}">
          <span class="layer-icon">${icon}</span>
          <span class="layer-name">${this._esc(name)}</span>
          <span class="layer-actions-inline">
            <button data-action="toggle-visible" title="${layer.visible ? 'Hide' : 'Show'}">${layer.visible ? '&#128065;' : '&#8212;'}</button>
            <button data-action="toggle-lock" title="${layer.locked ? 'Unlock' : 'Lock'}">${layer.locked ? '&#128274;' : '&#128275;'}</button>
          </span>
        </div>
      `;
    }).join('');

    // Click to select
    this.listEl.querySelectorAll('.layer-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        this.state.selectLayer(el.dataset.id);
      });
    });

    // Toggle visibility
    this.listEl.querySelectorAll('[data-action="toggle-visible"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.closest('.layer-item').dataset.id;
        const layer = card.layers.find(l => l.id === id);
        if (layer) this.state.updateLayer(id, { visible: !layer.visible });
      });
    });

    // Toggle lock
    this.listEl.querySelectorAll('[data-action="toggle-lock"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.closest('.layer-item').dataset.id;
        const layer = card.layers.find(l => l.id === id);
        if (layer) this.state.updateLayer(id, { locked: !layer.locked });
      });
    });
  }

  _esc(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
