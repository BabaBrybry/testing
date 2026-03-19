/* ================================================================
   Reel Editor — Storyboard editor for SlopSort ranking reels
   ================================================================ */

const ReelEditor = (() => {
  // --- Brand defaults ---
  const DEFAULTS = {
    width: 1080,
    height: 1920,
    bgColor: "#0f172a",
    cardColor: "#1e293b",
    accentColor: "#a3e635",
    textColor: "#ffffff",
    mutedColor: "#94a3b8",
    brandName: "SLOPSORT",
    siteUrl: "slopsort.com",
  };

  let project = null;
  let selectedFrameIndex = 0;
  let isOpen = false;

  // --- DOM refs (lazy) ---
  const $ = (sel) => document.querySelector(sel);

  // --- Helpers ---
  const uid = () =>
    "f" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const resolve = (frame, prop) => {
    const v = frame.style && frame.style[prop];
    return v != null ? v : project.globals[prop];
  };

  // ================================================================
  // Frame template renderers (DOM-based preview)
  // ================================================================

  const renderers = {
    intro(content, style) {
      const bg = style.bgColor;
      const card = style.cardColor;
      const accent = style.accentColor;
      const text = style.textColor;
      const muted = style.mutedColor;
      return `
        <div class="rf rf-intro" style="background:${bg};color:${text};">
          <div class="rf-intro-badge" style="background:${accent};color:${bg};">
            ${esc(content.badge || "TOP 5 COUNTDOWN")}
          </div>
          <h1 class="rf-intro-title">${esc(content.title || "")}</h1>
          <p class="rf-intro-subtitle" style="color:${muted};">${esc(content.subtitle || "")}</p>
          <div class="rf-intro-bottom" style="background:${card};">
            <span style="color:${accent};">${esc(content.tagline || "AI consensus ranking")}</span>
          </div>
        </div>`;
    },

    rank_card(content, style) {
      const bg = style.bgColor;
      const card = style.cardColor;
      const accent = style.accentColor;
      const text = style.textColor;
      const muted = style.mutedColor;
      const rank = content.rank ?? 1;
      return `
        <div class="rf rf-rank" style="background:${bg};color:${text};">
          <div class="rf-rank-pos" style="color:${muted};">#${rank}</div>
          <div class="rf-rank-big" style="color:${accent};">#${rank}</div>
          <div class="rf-rank-card" style="background:${card};border-top:4px solid ${accent};">
            <div class="rf-rank-name">${esc(content.name || "Item name")}</div>
            ${content.note ? `<div class="rf-rank-note" style="color:${muted};">${esc(content.note)}</div>` : ""}
          </div>
          <div class="rf-rank-bottom" style="background:${card};">
            <span style="color:${accent};">${esc(style.brandName || "SLOPSORT")}</span>
          </div>
        </div>`;
    },

    outro(content, style) {
      const bg = style.bgColor;
      const card = style.cardColor;
      const accent = style.accentColor;
      const text = style.textColor;
      const muted = style.mutedColor;
      return `
        <div class="rf rf-outro" style="background:${bg};color:${text};">
          <h1 class="rf-outro-headline">${esc(content.headline || "See The Full Rankings")}</h1>
          <div class="rf-outro-url" style="background:${accent};color:${bg};">
            ${esc(content.url || style.siteUrl || "slopsort.com")}
          </div>
          <p class="rf-outro-tagline" style="color:${muted};">
            ${esc(content.tagline || "Free - No account needed")}
          </p>
          <div class="rf-outro-bottom" style="background:${card};">
            <span style="color:${accent};">${esc(style.brandName || "SLOPSORT")}</span>
          </div>
        </div>`;
    },
  };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ================================================================
  // Resolved style for a frame (globals + per-frame overrides)
  // ================================================================

  function resolvedStyle(frame) {
    const s = {};
    for (const key of Object.keys(DEFAULTS)) {
      s[key] = (frame.style && frame.style[key] != null) ? frame.style[key] : project.globals[key];
    }
    return s;
  }

  // ================================================================
  // Render a frame to HTML
  // ================================================================

  function renderFrame(frame) {
    const fn = renderers[frame.type];
    if (!fn) return `<div class="rf" style="background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;"><p>Unknown frame type: ${esc(frame.type)}</p></div>`;
    return fn(frame.content, resolvedStyle(frame));
  }

  // ================================================================
  // Properties panel field definitions per frame type
  // ================================================================

  const fieldDefs = {
    intro: [
      { key: "title", label: "Title", type: "text", placeholder: "MUST-TRY Restaurants" },
      { key: "subtitle", label: "Subtitle", type: "text", placeholder: "in Toronto, Canada" },
      { key: "badge", label: "Badge text", type: "text", placeholder: "TOP 5 COUNTDOWN" },
      { key: "tagline", label: "Tagline", type: "text", placeholder: "AI consensus ranking" },
    ],
    rank_card: [
      { key: "rank", label: "Rank #", type: "number", min: 1 },
      { key: "name", label: "Item name", type: "text", placeholder: "Restaurant name" },
      { key: "note", label: "Note (optional)", type: "text", placeholder: "French tasting menu" },
    ],
    outro: [
      { key: "headline", label: "Headline", type: "text", placeholder: "See The Full Rankings" },
      { key: "url", label: "URL", type: "text", placeholder: "slopsort.com" },
      { key: "tagline", label: "Tagline", type: "text", placeholder: "Free - No account needed" },
    ],
  };

  const styleFields = [
    { key: "bgColor", label: "Background" },
    { key: "cardColor", label: "Card" },
    { key: "accentColor", label: "Accent" },
    { key: "textColor", label: "Text" },
    { key: "mutedColor", label: "Muted text" },
  ];

  // ================================================================
  // Build properties panel HTML
  // ================================================================

  function buildPropsPanel(frame) {
    const fields = fieldDefs[frame.type] || [];
    let html = "";

    // Frame type selector
    html += `<div class="reel-field">
      <label>Frame type</label>
      <select id="rp-type">
        <option value="intro" ${frame.type === "intro" ? "selected" : ""}>Intro</option>
        <option value="rank_card" ${frame.type === "rank_card" ? "selected" : ""}>Rank Card</option>
        <option value="outro" ${frame.type === "outro" ? "selected" : ""}>Outro</option>
      </select>
    </div>`;

    // Duration
    html += `<div class="reel-field">
      <label>Duration: <span id="rp-dur-val">${frame.duration}s</span></label>
      <input type="range" id="rp-duration" min="1" max="10" step="0.5" value="${frame.duration}" />
    </div>`;

    // Content fields
    html += `<div class="reel-field-group"><h4>Content</h4>`;
    for (const f of fields) {
      const val = frame.content[f.key] ?? "";
      if (f.type === "number") {
        html += `<div class="reel-field">
          <label>${f.label}</label>
          <input type="number" data-content="${f.key}" value="${val}" min="${f.min || 0}" />
        </div>`;
      } else {
        html += `<div class="reel-field">
          <label>${f.label}</label>
          <input type="text" data-content="${f.key}" value="${esc(String(val))}" placeholder="${f.placeholder || ""}" />
        </div>`;
      }
    }
    html += `</div>`;

    // Style overrides
    html += `<div class="reel-field-group"><h4>Colors <span class="muted">(override globals)</span></h4>`;
    for (const sf of styleFields) {
      const override = frame.style && frame.style[sf.key];
      const effective = override != null ? override : project.globals[sf.key];
      const isOverridden = override != null;
      html += `<div class="reel-field reel-color-field">
        <label>${sf.label}</label>
        <div class="reel-color-row">
          <input type="color" data-style="${sf.key}" value="${effective}" />
          <span class="reel-color-hex">${effective}</span>
          ${isOverridden ? `<button class="reel-color-reset" data-reset="${sf.key}" title="Reset to global">&#x21ba;</button>` : ""}
        </div>
      </div>`;
    }
    html += `</div>`;

    return html;
  }

  // ================================================================
  // Build global settings modal body
  // ================================================================

  function buildGlobalSettings() {
    let html = "";
    for (const sf of styleFields) {
      html += `<div class="reel-field reel-color-field">
        <label>${sf.label}</label>
        <div class="reel-color-row">
          <input type="color" data-global="${sf.key}" value="${project.globals[sf.key]}" />
          <span class="reel-color-hex">${project.globals[sf.key]}</span>
        </div>
      </div>`;
    }
    html += `<div class="reel-field">
      <label>Brand name</label>
      <input type="text" id="rg-brand" value="${esc(project.globals.brandName)}" />
    </div>`;
    html += `<div class="reel-field">
      <label>Site URL</label>
      <input type="text" id="rg-url" value="${esc(project.globals.siteUrl)}" />
    </div>`;
    return html;
  }

  // ================================================================
  // Timeline rendering
  // ================================================================

  function renderTimeline() {
    const tl = $("#reel-timeline");
    if (!tl) return;
    tl.innerHTML = "";
    project.frames.forEach((frame, i) => {
      const thumb = document.createElement("button");
      thumb.className = "reel-thumb" + (i === selectedFrameIndex ? " active" : "");
      const label =
        frame.type === "intro" ? "Intro" :
        frame.type === "outro" ? "Outro" :
        frame.type === "rank_card" ? `#${frame.content.rank || "?"}` :
        frame.type;
      thumb.innerHTML = `<span class="reel-thumb-label">${label}</span><span class="reel-thumb-dur">${frame.duration}s</span>`;
      thumb.addEventListener("click", () => selectFrame(i));

      // Drag reorder
      thumb.draggable = true;
      thumb.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(i));
        thumb.classList.add("dragging");
      });
      thumb.addEventListener("dragend", () => thumb.classList.remove("dragging"));
      thumb.addEventListener("dragover", (e) => e.preventDefault());
      thumb.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (from !== i) {
          const [moved] = project.frames.splice(from, 1);
          project.frames.splice(i, 0, moved);
          selectedFrameIndex = i;
          refresh();
        }
      });

      tl.appendChild(thumb);
    });
  }

  // ================================================================
  // Select a frame
  // ================================================================

  function selectFrame(i) {
    selectedFrameIndex = Math.max(0, Math.min(i, project.frames.length - 1));
    refresh();
  }

  // ================================================================
  // Refresh all editor UI
  // ================================================================

  function refresh() {
    if (!project || !isOpen) return;
    const frame = project.frames[selectedFrameIndex];
    if (!frame) return;

    // Preview
    const render = $("#reel-frame-render");
    if (render) render.innerHTML = renderFrame(frame);

    // Timeline
    renderTimeline();

    // Properties
    const propsTitle = $("#reel-props-title");
    const propsBody = $("#reel-props-content");
    if (propsTitle) propsTitle.textContent = `${frame.type.replace("_", " ")} — Frame ${selectedFrameIndex + 1}`;
    if (propsBody) {
      propsBody.innerHTML = buildPropsPanel(frame);
      bindPropsEvents(frame);
    }

    // Title
    const titleInput = $("#reel-title");
    if (titleInput && titleInput !== document.activeElement) {
      titleInput.value = project.name || "";
    }
  }

  // ================================================================
  // Bind property panel events
  // ================================================================

  function bindPropsEvents(frame) {
    // Content fields
    document.querySelectorAll("#reel-props-content [data-content]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.content;
        let val = input.value;
        if (input.type === "number") val = parseInt(val, 10) || 1;
        frame.content[key] = val;
        refreshPreviewAndTimeline();
      });
    });

    // Duration
    const durSlider = $("#rp-duration");
    if (durSlider) {
      durSlider.addEventListener("input", () => {
        frame.duration = parseFloat(durSlider.value);
        const label = $("#rp-dur-val");
        if (label) label.textContent = frame.duration + "s";
        renderTimeline();
      });
    }

    // Frame type change
    const typeSelect = $("#rp-type");
    if (typeSelect) {
      typeSelect.addEventListener("change", () => {
        frame.type = typeSelect.value;
        // Reset content to defaults for new type
        if (frame.type === "intro") {
          frame.content = { title: "", subtitle: "", badge: "TOP 5 COUNTDOWN", tagline: "AI consensus ranking" };
          frame.duration = 3;
        } else if (frame.type === "rank_card") {
          frame.content = { rank: 1, name: "", note: "" };
          frame.duration = 4.5;
        } else if (frame.type === "outro") {
          frame.content = { headline: "See The Full Rankings", url: project.globals.siteUrl, tagline: "Free - No account needed" };
          frame.duration = 4;
        }
        refresh();
      });
    }

    // Color overrides
    document.querySelectorAll("#reel-props-content [data-style]").forEach((input) => {
      input.addEventListener("input", () => {
        if (!frame.style) frame.style = {};
        frame.style[input.dataset.style] = input.value;
        const hex = input.parentElement.querySelector(".reel-color-hex");
        if (hex) hex.textContent = input.value;
        refreshPreviewAndTimeline();
      });
    });

    // Color reset buttons
    document.querySelectorAll("#reel-props-content [data-reset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.reset;
        if (frame.style) delete frame.style[key];
        refresh();
      });
    });
  }

  function refreshPreviewAndTimeline() {
    const frame = project.frames[selectedFrameIndex];
    if (!frame) return;
    const render = $("#reel-frame-render");
    if (render) render.innerHTML = renderFrame(frame);
    renderTimeline();
  }

  // ================================================================
  // Create project from rankings
  // ================================================================

  function reelFromRankings(title, rankedItems, listCount) {
    const frames = [];
    const topN = Math.min(rankedItems.length, 10);

    // Intro
    frames.push({
      id: uid(),
      type: "intro",
      duration: 3,
      style: {},
      content: {
        title: title || "Top Picks",
        subtitle: `Consensus from ${listCount} ranked list${listCount === 1 ? "" : "s"}`,
        badge: `TOP ${topN} COUNTDOWN`,
        tagline: "AI consensus ranking",
      },
    });

    // Rank cards in countdown order (highest rank last)
    const items = rankedItems.slice(0, topN);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      frames.push({
        id: uid(),
        type: "rank_card",
        duration: 4.5,
        style: {},
        content: {
          rank: i + 1,
          name: item.name,
          note: `${item.points} points`,
        },
      });
    }

    // Outro
    frames.push({
      id: uid(),
      type: "outro",
      duration: 4,
      style: {},
      content: {
        headline: "See The Full Rankings",
        url: DEFAULTS.siteUrl,
        tagline: "Free - No account needed",
      },
    });

    project = {
      id: uid(),
      name: title || "Untitled Reel",
      createdAt: new Date().toISOString(),
      globals: { ...DEFAULTS },
      frames,
    };

    selectedFrameIndex = 0;
  }

  // ================================================================
  // Open / close editor
  // ================================================================

  function open(title, rankedItems, listCount) {
    reelFromRankings(title, rankedItems, listCount);
    isOpen = true;

    const editor = $("#reel-editor");
    if (editor) editor.style.display = "";

    refresh();
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function close() {
    isOpen = false;
    const editor = $("#reel-editor");
    if (editor) editor.style.display = "none";
  }

  // ================================================================
  // Export — serialize project as JSON for Python renderer
  // ================================================================

  function exportData() {
    if (!project) return null;
    return JSON.parse(JSON.stringify(project));
  }

  function downloadJSON() {
    const data = exportData();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (project.name || "reel").replace(/[^a-z0-9]/gi, "_") + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ================================================================
  // Init — bind toolbar/timeline action buttons
  // ================================================================

  function init() {
    // Title input
    const titleInput = $("#reel-title");
    if (titleInput) {
      titleInput.addEventListener("input", () => {
        if (project) project.name = titleInput.value;
      });
    }

    // Add frame
    const addBtn = $("#reel-add-frame");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        if (!project) return;
        const newFrame = {
          id: uid(),
          type: "rank_card",
          duration: 4.5,
          style: {},
          content: { rank: project.frames.filter((f) => f.type === "rank_card").length + 1, name: "New item", note: "" },
        };
        project.frames.splice(selectedFrameIndex + 1, 0, newFrame);
        selectedFrameIndex++;
        refresh();
      });
    }

    // Duplicate frame
    const dupBtn = $("#reel-dup-frame");
    if (dupBtn) {
      dupBtn.addEventListener("click", () => {
        if (!project) return;
        const src = project.frames[selectedFrameIndex];
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = uid();
        project.frames.splice(selectedFrameIndex + 1, 0, copy);
        selectedFrameIndex++;
        refresh();
      });
    }

    // Delete frame
    const delBtn = $("#reel-del-frame");
    if (delBtn) {
      delBtn.addEventListener("click", () => {
        if (!project || project.frames.length <= 1) return;
        project.frames.splice(selectedFrameIndex, 1);
        if (selectedFrameIndex >= project.frames.length) selectedFrameIndex = project.frames.length - 1;
        refresh();
      });
    }

    // Global settings modal
    const globalBtn = $("#reel-global-settings-btn");
    const globalModal = $("#reel-global-modal");
    const globalClose = $("#reel-global-close");
    if (globalBtn && globalModal) {
      globalBtn.addEventListener("click", () => {
        const body = $("#reel-global-body");
        if (body) {
          body.innerHTML = buildGlobalSettings();
          bindGlobalEvents();
        }
        globalModal.style.display = "flex";
      });
    }
    if (globalClose && globalModal) {
      globalClose.addEventListener("click", () => {
        globalModal.style.display = "none";
        refresh();
      });
    }
    if (globalModal) {
      globalModal.addEventListener("click", (e) => {
        if (e.target === globalModal) {
          globalModal.style.display = "none";
          refresh();
        }
      });
    }

    // Export
    const exportBtn = $("#reel-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", downloadJSON);
    }
  }

  function bindGlobalEvents() {
    document.querySelectorAll("#reel-global-body [data-global]").forEach((input) => {
      input.addEventListener("input", () => {
        project.globals[input.dataset.global] = input.value;
        const hex = input.parentElement.querySelector(".reel-color-hex");
        if (hex) hex.textContent = input.value;
        refreshPreviewAndTimeline();
      });
    });
    const brandInput = $("#rg-brand");
    if (brandInput) {
      brandInput.addEventListener("input", () => {
        project.globals.brandName = brandInput.value;
        refreshPreviewAndTimeline();
      });
    }
    const urlInput = $("#rg-url");
    if (urlInput) {
      urlInput.addEventListener("input", () => {
        project.globals.siteUrl = urlInput.value;
        refreshPreviewAndTimeline();
      });
    }
  }

  // Run init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public API
  return { open, close, exportData, refresh, renderFrame, resolvedStyle };
})();
