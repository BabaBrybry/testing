// toolbar.js — Top bar: add text/image, project name

import { createTextLayer, createImageLayer } from './state.js';

export class Toolbar {
  constructor(state) {
    this.state = state;

    document.getElementById('project-name').value = state.project.name;
    document.getElementById('project-name').addEventListener('input', (e) => {
      state.project.name = e.target.value;
    });

    document.getElementById('btn-add-text')?.addEventListener('click', () => {
      const layer = createTextLayer();
      state.addLayer(layer);
    });

    document.getElementById('btn-add-image')?.addEventListener('click', () => {
      const input = document.getElementById('file-image');
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            // Scale to fit within canvas bounds while preserving aspect ratio
            let w = img.naturalWidth, h = img.naturalHeight;
            const maxW = 800, maxH = 800;
            if (w > maxW || h > maxH) {
              const scale = Math.min(maxW / w, maxH / h);
              w = Math.round(w * scale);
              h = Math.round(h * scale);
            }
            const layer = createImageLayer(ev.target.result, {
              x: (1080 - w) / 2,
              y: (1920 - h) / 2,
              width: w,
              height: h,
            });
            state.addLayer(layer);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        input.value = '';
      };
      input.click();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Delete/Backspace to remove selected layer
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedLayerId) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
        e.preventDefault();
        state.removeLayer(state.selectedLayerId);
      }

      // Ctrl+D to duplicate layer
      if (e.key === 'd' && (e.ctrlKey || e.metaKey) && state.selectedLayerId) {
        e.preventDefault();
        const layer = state.getSelectedLayer();
        if (layer && layer.type !== 'background') {
          const copy = JSON.parse(JSON.stringify(layer));
          copy.id = 'layer_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
          copy.x += 20;
          copy.y += 20;
          state.addLayer(copy);
        }
      }

      // Arrow keys to nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && state.selectedLayerId) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        const layer = state.getSelectedLayer();
        if (!layer || layer.locked) return;
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        state.updateLayer(layer.id, { x: layer.x + dx, y: layer.y + dy });
      }
    });
  }
}
