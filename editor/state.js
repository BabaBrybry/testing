// state.js — ProjectState: single source of truth for the reel project

import { uid, deepClone, EventEmitter } from './utils.js';

export function createDefaultProject(name = 'Untitled Reel') {
  return {
    id: uid('proj'),
    name,
    canvasWidth: 1080,
    canvasHeight: 1920,
    globals: {
      bgColor: '#0f172a',
      accentColor: '#a3e635',
      textColor: '#ffffff',
      defaultFont: 'sans-serif',
    },
    backgroundMusic: null,
    cards: [createDefaultCard('#0f172a')],
  };
}

export function createDefaultCard(bgColor = '#0f172a') {
  return {
    id: uid('card'),
    duration: 3.0,
    audio: null,
    layers: [
      {
        id: uid('layer'),
        type: 'background',
        locked: true,
        visible: true,
        background: { kind: 'solid', color: bgColor },
      },
    ],
  };
}

export function createTextLayer(overrides = {}) {
  return {
    id: uid('layer'),
    type: 'text',
    visible: true,
    locked: false,
    x: 140,
    y: 800,
    width: 800,
    height: 120,
    rotation: 0,
    opacity: 1,
    text: 'Your text here',
    fontFamily: 'sans-serif',
    fontSize: 64,
    fontWeight: 'bold',
    fontStyle: 'normal',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 1.2,
    shadow: null,
    outline: null,
    backgroundColor: null,
    ...overrides,
  };
}

export function createImageLayer(src, overrides = {}) {
  return {
    id: uid('layer'),
    type: 'image',
    visible: true,
    locked: false,
    x: 190,
    y: 560,
    width: 700,
    height: 700,
    rotation: 0,
    opacity: 1,
    src,
    objectFit: 'cover',
    ...overrides,
  };
}

export class ProjectState extends EventEmitter {
  constructor(projectData) {
    super();
    this.project = projectData || createDefaultProject();
    this.selectedCardIndex = 0;
    this.selectedLayerId = null;
  }

  // --- Project ---

  get cards() {
    return this.project.cards;
  }

  get globals() {
    return this.project.globals;
  }

  // --- Card CRUD ---

  getCard(index) {
    return this.project.cards[index] || null;
  }

  getSelectedCard() {
    return this.project.cards[this.selectedCardIndex] || null;
  }

  selectCard(index) {
    if (index < 0 || index >= this.cards.length) return;
    this.selectedCardIndex = index;
    this.selectedLayerId = null;
    this.emit('card-selected', index);
  }

  addCard(afterIndex) {
    const card = createDefaultCard(this.globals.bgColor);
    const idx = afterIndex != null ? afterIndex + 1 : this.cards.length;
    this.cards.splice(idx, 0, card);
    this.selectCard(idx);
    this.emit('cards-changed');
    return card;
  }

  duplicateCard(index) {
    const src = this.cards[index];
    if (!src) return null;
    const card = deepClone(src);
    card.id = uid('card');
    card.layers.forEach(l => (l.id = uid('layer')));
    this.cards.splice(index + 1, 0, card);
    this.selectCard(index + 1);
    this.emit('cards-changed');
    return card;
  }

  removeCard(index) {
    if (this.cards.length <= 1) return; // keep at least 1
    this.cards.splice(index, 1);
    if (this.selectedCardIndex >= this.cards.length) {
      this.selectedCardIndex = this.cards.length - 1;
    }
    this.selectedLayerId = null;
    this.emit('cards-changed');
    this.emit('card-selected', this.selectedCardIndex);
  }

  reorderCards(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [card] = this.cards.splice(fromIndex, 1);
    this.cards.splice(toIndex, 0, card);
    this.selectedCardIndex = toIndex;
    this.emit('cards-changed');
  }

  setCardDuration(index, duration) {
    const card = this.cards[index];
    if (card) {
      card.duration = duration;
      this.emit('cards-changed');
    }
  }

  // --- Layer CRUD ---

  getSelectedLayer() {
    const card = this.getSelectedCard();
    if (!card || !this.selectedLayerId) return null;
    return card.layers.find(l => l.id === this.selectedLayerId) || null;
  }

  selectLayer(layerId) {
    this.selectedLayerId = layerId;
    this.emit('layer-selected', layerId);
  }

  addLayer(layer) {
    const card = this.getSelectedCard();
    if (!card) return;
    card.layers.push(layer);
    this.selectedLayerId = layer.id;
    this.emit('layers-changed');
    this.emit('layer-selected', layer.id);
  }

  removeLayer(layerId) {
    const card = this.getSelectedCard();
    if (!card) return;
    const idx = card.layers.findIndex(l => l.id === layerId);
    if (idx <= 0) return; // don't remove background (index 0)
    card.layers.splice(idx, 1);
    if (this.selectedLayerId === layerId) {
      this.selectedLayerId = null;
      this.emit('layer-selected', null);
    }
    this.emit('layers-changed');
  }

  updateLayer(layerId, props) {
    const card = this.getSelectedCard();
    if (!card) return;
    const layer = card.layers.find(l => l.id === layerId);
    if (!layer) return;
    Object.assign(layer, props);
    this.emit('layer-changed', layerId, props);
  }

  moveLayerUp(layerId) {
    const card = this.getSelectedCard();
    if (!card) return;
    const idx = card.layers.findIndex(l => l.id === layerId);
    if (idx <= 1 || idx >= card.layers.length) return; // can't move bg or already at top
    if (idx === card.layers.length - 1) return;
    [card.layers[idx], card.layers[idx + 1]] = [card.layers[idx + 1], card.layers[idx]];
    this.emit('layers-changed');
  }

  moveLayerDown(layerId) {
    const card = this.getSelectedCard();
    if (!card) return;
    const idx = card.layers.findIndex(l => l.id === layerId);
    if (idx <= 1) return; // can't move bg or first real layer below bg
    [card.layers[idx], card.layers[idx - 1]] = [card.layers[idx - 1], card.layers[idx]];
    this.emit('layers-changed');
  }

  // --- Serialization ---

  toJSON() {
    return deepClone(this.project);
  }

  loadProject(data) {
    this.project = data;
    this.selectedCardIndex = 0;
    this.selectedLayerId = null;
    this.emit('project-loaded');
  }
}
