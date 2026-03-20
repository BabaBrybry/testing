// utils.js — Utility functions for the reel editor

let _idCounter = 0;

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function degToRad(deg) {
  return deg * Math.PI / 180;
}

export function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

export function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Simple EventEmitter
export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter(f => f !== fn);
  }

  emit(event, ...args) {
    const list = this._listeners[event];
    if (list) list.forEach(fn => fn(...args));
  }
}
