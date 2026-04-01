// main.js — Bootstrap: wires all modules together

import { ProjectState, createDefaultProject, createTextLayer } from './state.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { CanvasInteraction } from './canvas-interaction.js';
import { TransformHandles } from './transform-handles.js';
import { PropertiesPanel } from './properties-panel.js';
import { LayerPanel } from './layer-panel.js';
import { Toolbar } from './toolbar.js';
import { Timeline } from './timeline.js';
import { PreviewPlayer } from './preview-player.js';
import { Exporter } from './export.js';

// --- Initialize state with a starter project ---
const project = createDefaultProject('My First Reel');

// Add a welcome text layer to the first card
project.cards[0].layers.push(createTextLayer({
  text: 'Welcome to Reel Creator',
  fontSize: 72,
  fontWeight: 'bold',
  color: '#ffffff',
  x: 90,
  y: 820,
  width: 900,
  height: 200,
  textAlign: 'center',
}));

const state = new ProjectState(project);

// --- Canvas setup ---
const canvas = document.getElementById('editor-canvas');
const renderer = new CanvasRenderer(canvas);

// Fit canvas to viewport
function fitCanvas() {
  const wrap = document.querySelector('.editor-canvas-wrap');
  const maxH = wrap.clientHeight - 32;
  const maxW = wrap.clientWidth - 32;
  const aspectRatio = 1080 / 1920;

  let displayH = maxH;
  let displayW = displayH * aspectRatio;

  if (displayW > maxW) {
    displayW = maxW;
    displayH = displayW / aspectRatio;
  }

  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// --- Render loop ---
function renderFrame() {
  const card = state.getSelectedCard();
  renderer.render(card);

  // Draw selection handles
  const selectedLayer = state.getSelectedLayer();
  if (selectedLayer && selectedLayer.type !== 'background') {
    TransformHandles.draw(renderer.ctx, selectedLayer);
  }
}

// Re-render on any state change
state.on('layer-changed', renderFrame);
state.on('layer-selected', renderFrame);
state.on('layers-changed', renderFrame);
state.on('card-selected', renderFrame);

// Also set up image load callback
renderer.onImageLoaded = renderFrame;

// --- Initialize all modules ---
const interaction = new CanvasInteraction(canvas, state);
const propsPanel = new PropertiesPanel(
  document.getElementById('props-content'),
  document.getElementById('props-title'),
  state
);
const layerPanel = new LayerPanel(document.getElementById('layer-list'), state);
const toolbar = new Toolbar(state);
const timeline = new Timeline(document.getElementById('timeline-strip'), state);
const previewPlayer = new PreviewPlayer(renderer, state);
const exporter = new Exporter(state);

// --- Initial render ---
renderFrame();
layerPanel.render();
timeline.render();

// Select the text layer by default
if (state.cards[0].layers.length > 1) {
  state.selectLayer(state.cards[0].layers[1].id);
}

console.log('Reel Creator initialized');
