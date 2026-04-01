// transform-handles.js — Selection bounding box + resize/rotate handles

import { degToRad } from './utils.js';

const HANDLE_SIZE = 10; // in canvas units
const ROTATION_HANDLE_OFFSET = 40;

export class TransformHandles {
  // Get the 4 rotated corners of a layer's bounding box
  static getCorners(layer) {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const hw = layer.width / 2;
    const hh = layer.height / 2;
    const angle = degToRad(layer.rotation || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    function rotate(lx, ly) {
      return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
    }

    return {
      tl: rotate(-hw, -hh),
      tr: rotate(hw, -hh),
      br: rotate(hw, hh),
      bl: rotate(-hw, hh),
    };
  }

  // Get positions of all 8 resize handles + rotation handle
  static getHandlePositions(layer) {
    const c = this.getCorners(layer);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const topMid = mid(c.tl, c.tr);
    const angle = degToRad(layer.rotation || 0);

    return {
      nw: c.tl,
      n: topMid,
      ne: c.tr,
      e: mid(c.tr, c.br),
      se: c.br,
      s: mid(c.bl, c.br),
      sw: c.bl,
      w: mid(c.tl, c.bl),
      rotate: {
        x: topMid.x - Math.sin(angle) * ROTATION_HANDLE_OFFSET,
        y: topMid.y + Math.cos(angle) * ROTATION_HANDLE_OFFSET * -1,
      },
    };
  }

  // Draw selection overlay on the canvas
  static draw(ctx, layer) {
    const c = this.getCorners(layer);
    const handles = this.getHandlePositions(layer);

    ctx.save();

    // Bounding box
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(c.tl.x, c.tl.y);
    ctx.lineTo(c.tr.x, c.tr.y);
    ctx.lineTo(c.br.x, c.br.y);
    ctx.lineTo(c.bl.x, c.bl.y);
    ctx.closePath();
    ctx.stroke();

    // Dashed line to rotation handle
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(handles.n.x, handles.n.y);
    ctx.lineTo(handles.rotate.x, handles.rotate.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Resize handles (white squares)
    const hs = HANDLE_SIZE;
    for (const key of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const p = handles[key];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      ctx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
    }

    // Rotation handle (circle)
    ctx.beginPath();
    ctx.arc(handles.rotate.x, handles.rotate.y, hs / 2 + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // Hit-test handles. Returns handle name or null.
  static hitTestHandle(canvasX, canvasY, layer) {
    const handles = this.getHandlePositions(layer);
    const threshold = HANDLE_SIZE + 4; // generous hit area

    // Check rotation handle first (priority)
    if (this._near(canvasX, canvasY, handles.rotate, threshold)) return 'rotate';

    for (const key of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      if (this._near(canvasX, canvasY, handles[key], threshold)) return key;
    }
    return null;
  }

  static _near(x, y, p, threshold) {
    return Math.abs(x - p.x) < threshold && Math.abs(y - p.y) < threshold;
  }
}
