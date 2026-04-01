// canvas-interaction.js — Hit testing, drag, resize, rotate on the canvas

import { degToRad, radToDeg, clamp, EventEmitter } from './utils.js';
import { TransformHandles } from './transform-handles.js';

export class CanvasInteraction extends EventEmitter {
  constructor(canvas, state) {
    super();
    this.canvas = canvas;
    this.state = state;
    this.mode = 'idle'; // idle | dragging | resizing | rotating
    this.activeHandle = null;
    this.dragStart = null;
    this.layerStart = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }

  screenToCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / rect.width;
    return {
      x: (e.clientX - rect.left) * scale,
      y: (e.clientY - rect.top) * scale,
    };
  }

  _onMouseDown(e) {
    const p = this.screenToCanvas(e);
    const selectedLayer = this.state.getSelectedLayer();

    // Check if clicking on a handle of the already-selected layer
    if (selectedLayer && !selectedLayer.locked) {
      const handle = TransformHandles.hitTestHandle(p.x, p.y, selectedLayer);
      if (handle) {
        if (handle === 'rotate') {
          this.mode = 'rotating';
        } else {
          this.mode = 'resizing';
          this.activeHandle = handle;
        }
        this.dragStart = p;
        this.layerStart = {
          x: selectedLayer.x,
          y: selectedLayer.y,
          width: selectedLayer.width,
          height: selectedLayer.height,
          rotation: selectedLayer.rotation || 0,
        };
        e.preventDefault();
        return;
      }
    }

    // Hit test layers (top-to-bottom)
    const card = this.state.getSelectedCard();
    if (!card) return;

    let hitLayer = null;
    for (let i = card.layers.length - 1; i >= 0; i--) {
      const layer = card.layers[i];
      if (layer.type === 'background' || !layer.visible || layer.locked) continue;
      if (this._hitTestLayer(p.x, p.y, layer)) {
        hitLayer = layer;
        break;
      }
    }

    if (hitLayer) {
      this.state.selectLayer(hitLayer.id);
      this.mode = 'dragging';
      this.dragStart = p;
      this.layerStart = {
        x: hitLayer.x,
        y: hitLayer.y,
        width: hitLayer.width,
        height: hitLayer.height,
        rotation: hitLayer.rotation || 0,
      };
      e.preventDefault();
    } else {
      // Clicked on empty space → deselect
      this.state.selectLayer(null);
    }
  }

  _onMouseMove(e) {
    if (this.mode === 'idle') return;

    const p = this.screenToCanvas(e);
    const layer = this.state.getSelectedLayer();
    if (!layer) { this.mode = 'idle'; return; }

    if (this.mode === 'dragging') {
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      this.state.updateLayer(layer.id, {
        x: this.layerStart.x + dx,
        y: this.layerStart.y + dy,
      });
    } else if (this.mode === 'resizing') {
      this._handleResize(p, layer);
    } else if (this.mode === 'rotating') {
      this._handleRotate(p, layer);
    }
  }

  _onMouseUp(e) {
    if (this.mode !== 'idle') {
      this.emit('interaction-end');
    }
    this.mode = 'idle';
    this.activeHandle = null;
    this.dragStart = null;
    this.layerStart = null;
  }

  _hitTestLayer(cx, cy, layer) {
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    const dx = cx - centerX;
    const dy = cy - centerY;
    const angle = -degToRad(layer.rotation || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localX = dx * cos - dy * sin + layer.width / 2;
    const localY = dx * sin + dy * cos + layer.height / 2;
    return localX >= 0 && localX <= layer.width && localY >= 0 && localY <= layer.height;
  }

  _handleResize(p, layer) {
    const h = this.activeHandle;
    const ls = this.layerStart;
    const dx = p.x - this.dragStart.x;
    const dy = p.y - this.dragStart.y;

    // Project delta into layer-local axes (accounting for rotation)
    const angle = -degToRad(ls.rotation);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ldx = dx * cos - dy * sin;
    const ldy = dx * sin + dy * cos;

    let newX = ls.x, newY = ls.y, newW = ls.width, newH = ls.height;
    const MIN = 20;

    // Resize logic per handle
    if (h.includes('e')) { newW = Math.max(MIN, ls.width + ldx); }
    if (h.includes('w')) { newW = Math.max(MIN, ls.width - ldx); newX = ls.x + (ls.width - newW); }
    if (h.includes('s')) { newH = Math.max(MIN, ls.height + ldy); }
    if (h.includes('n')) { newH = Math.max(MIN, ls.height - ldy); newY = ls.y + (ls.height - newH); }

    // For corner handles on a non-rotated layer, directly set position
    // For rotated layers we need to adjust position to keep opposite corner fixed
    if (ls.rotation !== 0 && (h === 'nw' || h === 'ne' || h === 'sw' || h === 'se')) {
      // Recompute position so that the center adjusts correctly
      const oldCx = ls.x + ls.width / 2;
      const oldCy = ls.y + ls.height / 2;
      // Shift center by half the size delta in rotated direction
      const dwHalf = (newW - ls.width) / 2;
      const dhHalf = (newH - ls.height) / 2;
      const rAngle = degToRad(ls.rotation);
      const rcos = Math.cos(rAngle);
      const rsin = Math.sin(rAngle);

      let shiftX = 0, shiftY = 0;
      if (h.includes('e')) shiftX += dwHalf; else shiftX -= dwHalf;
      if (h.includes('s')) shiftY += dhHalf; else shiftY -= dhHalf;

      const worldShiftX = shiftX * rcos - shiftY * rsin;
      const worldShiftY = shiftX * rsin + shiftY * rcos;

      newX = oldCx + worldShiftX - newW / 2;
      newY = oldCy + worldShiftY - newH / 2;
    }

    this.state.updateLayer(layer.id, { x: newX, y: newY, width: newW, height: newH });
  }

  _handleRotate(p, layer) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    let angle = radToDeg(Math.atan2(p.x - cx, -(p.y - cy)));
    // Snap to 15deg increments if shift held
    // (shift detection would need the event passed through — simplified here)
    this.state.updateLayer(layer.id, { rotation: angle });
  }
}
