// properties-panel.js — Right sidebar: dynamic form for the selected layer

export class PropertiesPanel {
  constructor(container, titleEl, state) {
    this.container = container;
    this.titleEl = titleEl;
    this.state = state;
    this._updating = false;

    state.on('layer-selected', () => this.render());
    state.on('layer-changed', () => {
      if (!this._updating) this.render();
    });
  }

  render() {
    const layer = this.state.getSelectedLayer();
    if (!layer) {
      this.titleEl.textContent = 'Properties';
      this.container.innerHTML = '<div class="no-selection">Select a layer to edit its properties</div>';
      return;
    }

    this.titleEl.textContent = layer.type.charAt(0).toUpperCase() + layer.type.slice(1) + ' Properties';

    if (layer.type === 'background') {
      this._renderBackgroundProps(layer);
    } else if (layer.type === 'text') {
      this._renderTextProps(layer);
    } else if (layer.type === 'image') {
      this._renderImageProps(layer);
    }
  }

  _renderBackgroundProps(layer) {
    const bg = layer.background;
    this.container.innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Background</div>
        <div class="prop-row">
          <label>Type</label>
          <select data-field="bg-kind">
            <option value="solid" ${bg.kind === 'solid' ? 'selected' : ''}>Solid</option>
            <option value="gradient" ${bg.kind === 'gradient' ? 'selected' : ''}>Gradient</option>
            <option value="image" ${bg.kind === 'image' ? 'selected' : ''}>Image</option>
          </select>
        </div>
        ${bg.kind === 'solid' ? `
          <div class="prop-row">
            <label>Color</label>
            <input type="color" data-field="bg-color" value="${bg.color || '#000000'}">
          </div>
        ` : ''}
        ${bg.kind === 'gradient' ? `
          <div class="prop-row">
            <label>From</label>
            <input type="color" data-field="bg-grad-from" value="${bg.gradient?.from || '#000000'}">
          </div>
          <div class="prop-row">
            <label>To</label>
            <input type="color" data-field="bg-grad-to" value="${bg.gradient?.to || '#333333'}">
          </div>
          <div class="prop-row">
            <label>Angle</label>
            <input type="number" data-field="bg-grad-angle" value="${bg.gradient?.angle || 180}" min="0" max="360">
          </div>
        ` : ''}
        ${bg.kind === 'image' ? `
          <div class="prop-row">
            <button data-action="bg-upload-image">Upload Image</button>
          </div>
        ` : ''}
      </div>
    `;
    this._bindBackgroundEvents(layer);
  }

  _renderTextProps(layer) {
    this.container.innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Text</div>
        <div class="prop-row">
          <textarea data-field="text" rows="3">${this._escHtml(layer.text)}</textarea>
        </div>
        <div class="prop-row">
          <label>Font</label>
          <select data-field="fontFamily">
            ${['sans-serif', 'serif', 'monospace', 'Georgia', 'Arial', 'Verdana', 'Courier New', 'Times New Roman']
              .map(f => `<option value="${f}" ${layer.fontFamily === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="prop-row">
          <label>Size</label>
          <input type="number" data-field="fontSize" value="${layer.fontSize}" min="8" max="400" step="1">
        </div>
        <div class="prop-row">
          <label>Color</label>
          <input type="color" data-field="color" value="${layer.color || '#ffffff'}">
        </div>
        <div class="prop-row">
          <label>Style</label>
          <div class="prop-toggle">
            <button data-field="fontWeight" data-val="bold" class="${layer.fontWeight === 'bold' ? 'active' : ''}"><b>B</b></button>
            <button data-field="fontStyle" data-val="italic" class="${layer.fontStyle === 'italic' ? 'active' : ''}"><i>I</i></button>
          </div>
        </div>
        <div class="prop-row">
          <label>Align</label>
          <div class="prop-toggle">
            <button data-field="textAlign" data-val="left" class="${layer.textAlign === 'left' ? 'active' : ''}">L</button>
            <button data-field="textAlign" data-val="center" class="${layer.textAlign === 'center' ? 'active' : ''}">C</button>
            <button data-field="textAlign" data-val="right" class="${layer.textAlign === 'right' ? 'active' : ''}">R</button>
          </div>
        </div>
        <div class="prop-row">
          <label>Line H</label>
          <input type="number" data-field="lineHeight" value="${layer.lineHeight || 1.2}" min="0.5" max="3" step="0.1">
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">Transform</div>
        <div class="prop-row">
          <label>X</label>
          <input type="number" data-field="x" value="${Math.round(layer.x)}">
          <label>Y</label>
          <input type="number" data-field="y" value="${Math.round(layer.y)}">
        </div>
        <div class="prop-row">
          <label>W</label>
          <input type="number" data-field="width" value="${Math.round(layer.width)}" min="20">
          <label>H</label>
          <input type="number" data-field="height" value="${Math.round(layer.height)}" min="20">
        </div>
        <div class="prop-row">
          <label>Rot</label>
          <input type="number" data-field="rotation" value="${Math.round(layer.rotation || 0)}" step="1">
          <span style="font-size:12px;color:var(--text-secondary)">deg</span>
        </div>
        <div class="prop-row">
          <label>Opacity</label>
          <input type="range" data-field="opacity" value="${layer.opacity ?? 1}" min="0" max="1" step="0.05">
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">Effects</div>
        <div class="prop-row">
          <label>Shadow</label>
          <button data-action="toggle-shadow">${layer.shadow ? 'Remove' : 'Add'}</button>
        </div>
        ${layer.shadow ? `
          <div class="prop-row">
            <label>Blur</label>
            <input type="number" data-field="shadow-blur" value="${layer.shadow.blur}" min="0" max="50">
            <label>Color</label>
            <input type="color" data-field="shadow-color" value="${layer.shadow.color || '#000000'}">
          </div>
        ` : ''}
        <div class="prop-row">
          <label>Outline</label>
          <button data-action="toggle-outline">${layer.outline ? 'Remove' : 'Add'}</button>
        </div>
        ${layer.outline ? `
          <div class="prop-row">
            <label>Width</label>
            <input type="number" data-field="outline-width" value="${layer.outline.width}" min="0" max="20">
            <label>Color</label>
            <input type="color" data-field="outline-color" value="${layer.outline.color || '#000000'}">
          </div>
        ` : ''}
        <div class="prop-row">
          <label>BG</label>
          <input type="color" data-field="backgroundColor" value="${layer.backgroundColor || '#000000'}">
          <button data-action="toggle-bgColor">${layer.backgroundColor ? 'Remove' : 'Add'}</button>
        </div>
      </div>
    `;
    this._bindTextEvents(layer);
  }

  _renderImageProps(layer) {
    this.container.innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Image</div>
        <div class="prop-row">
          <label>Fit</label>
          <select data-field="objectFit">
            <option value="cover" ${layer.objectFit === 'cover' ? 'selected' : ''}>Cover</option>
            <option value="contain" ${layer.objectFit === 'contain' ? 'selected' : ''}>Contain</option>
            <option value="fill" ${layer.objectFit === 'fill' ? 'selected' : ''}>Fill</option>
          </select>
        </div>
        <div class="prop-row">
          <button data-action="replace-image">Replace Image</button>
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">Transform</div>
        <div class="prop-row">
          <label>X</label>
          <input type="number" data-field="x" value="${Math.round(layer.x)}">
          <label>Y</label>
          <input type="number" data-field="y" value="${Math.round(layer.y)}">
        </div>
        <div class="prop-row">
          <label>W</label>
          <input type="number" data-field="width" value="${Math.round(layer.width)}" min="20">
          <label>H</label>
          <input type="number" data-field="height" value="${Math.round(layer.height)}" min="20">
        </div>
        <div class="prop-row">
          <label>Rot</label>
          <input type="number" data-field="rotation" value="${Math.round(layer.rotation || 0)}" step="1">
          <span style="font-size:12px;color:var(--text-secondary)">deg</span>
        </div>
        <div class="prop-row">
          <label>Opacity</label>
          <input type="range" data-field="opacity" value="${layer.opacity ?? 1}" min="0" max="1" step="0.05">
        </div>
      </div>
    `;
    this._bindImageEvents(layer);
  }

  _bindBackgroundEvents(layer) {
    this.container.querySelector('[data-field="bg-kind"]')?.addEventListener('change', (e) => {
      const kind = e.target.value;
      const bg = { ...layer.background, kind };
      if (kind === 'gradient' && !bg.gradient) bg.gradient = { from: '#1e293b', to: '#0f172a', angle: 180 };
      this._update(layer.id, { background: bg });
      this.render();
    });

    this.container.querySelector('[data-field="bg-color"]')?.addEventListener('input', (e) => {
      this._update(layer.id, { background: { ...layer.background, color: e.target.value } });
    });

    this.container.querySelector('[data-field="bg-grad-from"]')?.addEventListener('input', (e) => {
      const g = { ...layer.background.gradient, from: e.target.value };
      this._update(layer.id, { background: { ...layer.background, gradient: g } });
    });
    this.container.querySelector('[data-field="bg-grad-to"]')?.addEventListener('input', (e) => {
      const g = { ...layer.background.gradient, to: e.target.value };
      this._update(layer.id, { background: { ...layer.background, gradient: g } });
    });
    this.container.querySelector('[data-field="bg-grad-angle"]')?.addEventListener('input', (e) => {
      const g = { ...layer.background.gradient, angle: parseFloat(e.target.value) || 0 };
      this._update(layer.id, { background: { ...layer.background, gradient: g } });
    });

    this.container.querySelector('[data-action="bg-upload-image"]')?.addEventListener('click', () => {
      const input = document.getElementById('file-image');
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          this._update(layer.id, { background: { ...layer.background, imageSrc: ev.target.result } });
        };
        reader.readAsDataURL(file);
        input.value = '';
      };
      input.click();
    });
  }

  _bindTextEvents(layer) {
    // Simple field bindings
    const simpleFields = ['text', 'fontFamily', 'fontSize', 'color', 'lineHeight', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'objectFit'];
    for (const field of simpleFields) {
      const el = this.container.querySelector(`[data-field="${field}"]`);
      if (!el) continue;
      const event = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(event, (e) => {
        let val = e.target.value;
        if (['fontSize', 'x', 'y', 'width', 'height', 'rotation'].includes(field)) val = parseFloat(val) || 0;
        if (['lineHeight', 'opacity'].includes(field)) val = parseFloat(val) || 0;
        this._update(layer.id, { [field]: val });
      });
    }

    // Toggle buttons (fontWeight, fontStyle, textAlign)
    this.container.querySelectorAll('.prop-toggle button').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const val = btn.dataset.val;
        if (field === 'fontWeight') {
          this._update(layer.id, { fontWeight: layer.fontWeight === 'bold' ? 'normal' : 'bold' });
        } else if (field === 'fontStyle') {
          this._update(layer.id, { fontStyle: layer.fontStyle === 'italic' ? 'normal' : 'italic' });
        } else if (field === 'textAlign') {
          this._update(layer.id, { textAlign: val });
        }
        this.render();
      });
    });

    // Shadow toggle
    this.container.querySelector('[data-action="toggle-shadow"]')?.addEventListener('click', () => {
      this._update(layer.id, {
        shadow: layer.shadow ? null : { offsetX: 2, offsetY: 2, blur: 8, color: 'rgba(0,0,0,0.5)' }
      });
      this.render();
    });

    // Shadow fields
    this.container.querySelector('[data-field="shadow-blur"]')?.addEventListener('input', (e) => {
      this._update(layer.id, { shadow: { ...layer.shadow, blur: parseFloat(e.target.value) || 0 } });
    });
    this.container.querySelector('[data-field="shadow-color"]')?.addEventListener('input', (e) => {
      this._update(layer.id, { shadow: { ...layer.shadow, color: e.target.value } });
    });

    // Outline toggle
    this.container.querySelector('[data-action="toggle-outline"]')?.addEventListener('click', () => {
      this._update(layer.id, {
        outline: layer.outline ? null : { width: 3, color: '#000000' }
      });
      this.render();
    });

    this.container.querySelector('[data-field="outline-width"]')?.addEventListener('input', (e) => {
      this._update(layer.id, { outline: { ...layer.outline, width: parseFloat(e.target.value) || 0 } });
    });
    this.container.querySelector('[data-field="outline-color"]')?.addEventListener('input', (e) => {
      this._update(layer.id, { outline: { ...layer.outline, color: e.target.value } });
    });

    // BG color toggle
    this.container.querySelector('[data-action="toggle-bgColor"]')?.addEventListener('click', () => {
      const colorInput = this.container.querySelector('[data-field="backgroundColor"]');
      this._update(layer.id, {
        backgroundColor: layer.backgroundColor ? null : (colorInput?.value || '#000000')
      });
      this.render();
    });
    this.container.querySelector('[data-field="backgroundColor"]')?.addEventListener('input', (e) => {
      if (layer.backgroundColor) {
        this._update(layer.id, { backgroundColor: e.target.value });
      }
    });
  }

  _bindImageEvents(layer) {
    // Reuse transform field bindings
    const fields = ['objectFit', 'x', 'y', 'width', 'height', 'rotation', 'opacity'];
    for (const field of fields) {
      const el = this.container.querySelector(`[data-field="${field}"]`);
      if (!el) continue;
      const event = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(event, (e) => {
        let val = e.target.value;
        if (['x', 'y', 'width', 'height', 'rotation'].includes(field)) val = parseFloat(val) || 0;
        if (field === 'opacity') val = parseFloat(val) || 0;
        this._update(layer.id, { [field]: val });
      });
    }

    this.container.querySelector('[data-action="replace-image"]')?.addEventListener('click', () => {
      const input = document.getElementById('file-image');
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          this._update(layer.id, { src: ev.target.result });
        };
        reader.readAsDataURL(file);
        input.value = '';
      };
      input.click();
    });
  }

  _update(layerId, props) {
    this._updating = true;
    this.state.updateLayer(layerId, props);
    this._updating = false;
  }

  _escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
