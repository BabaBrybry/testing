const listContainer = document.querySelector("#lists");
const listTemplate = document.querySelector("#list-template");
const addButton = document.querySelector("#add-list");
const clearButton = document.querySelector("#clear-lists");
const calculateButton = document.querySelector("#calculate");
const resultsContainer = document.querySelector("#results");
const previewContainer = document.querySelector("#preview");

const MAX_LISTS = 20;
const MAX_RANK = 20;

const state = {
  lists: [],
};

const starterLists = [
  [
    "Nimbus Espresso Pro",
    "Aurora BrewStation",
    "Halo Drip Master",
    "Velvet Bean Studio",
    "Summit Roast Kit",
  ],
  [
    "Aurora BrewStation",
    "Nimbus Espresso Pro",
    "Cloudline Cold Brew",
    "Halo Drip Master",
    "Crescent Cafe Set",
  ],
  [
    "Halo Drip Master",
    "Nimbus Espresso Pro",
    "Summit Roast Kit",
    "Aurora BrewStation",
    "Velvet Bean Studio",
  ],
];

const ensureListCount = (count, values = []) => {
  while (state.lists.length < count) {
    const nextValue = values[state.lists.length] ?? "";
    addList(nextValue);
  }
};

const normalizeName = (value) => value.trim().replace(/^\d+[.)\s-]+/, "").trim();

const parseList = (text) => {
  if (!text.trim()) return [];
  return text
    .split(/\n|,/)
    .map((item) => normalizeName(item))
    .filter(Boolean)
    .slice(0, MAX_RANK);
};

const updateListNumbers = () => {
  state.lists.forEach((list, index) => {
    list.number.textContent = index + 1;
  });
};

const scheduleCalculate = (() => {
  let timeoutId = null;
  return () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      calculateResults();
      timeoutId = null;
    }, 150);
  };
})();

const addList = (value = "") => {
  if (state.lists.length >= MAX_LISTS) return;
  const fragment = listTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".list-card");
  const number = fragment.querySelector(".list-number");
  const textarea = fragment.querySelector("textarea");
  const removeButton = fragment.querySelector(".remove");

  textarea.value = value;
  textarea.addEventListener("input", scheduleCalculate);

  const listItem = { card, number, textarea };
  removeButton.addEventListener("click", () => {
    state.lists = state.lists.filter((item) => item !== listItem);
    card.remove();
    updateListNumbers();
    calculateResults();
  });

  listContainer.appendChild(fragment);
  state.lists.push(listItem);
  updateListNumbers();
};

const clearLists = () => {
  state.lists.forEach((list) => list.card.remove());
  state.lists = [];
  ensureListCount(3);
  calculateResults();
};

const calculateResults = () => {
  const totals = new Map();
  const displayNames = new Map();
  const listCount = state.lists.length;

  state.lists.forEach((list) => {
    const entries = parseList(list.textarea.value);
    entries.forEach((entry, index) => {
      const key = entry.toLowerCase();
      const points = MAX_RANK - index;
      totals.set(key, (totals.get(key) ?? 0) + points);
      if (!displayNames.has(key)) {
        displayNames.set(key, entry);
      }
    });
  });

  const ranked = Array.from(totals.entries())
    .map(([key, points]) => ({
      name: displayNames.get(key) ?? key,
      points,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    .slice(0, 10);

  resultsContainer.innerHTML = "";
  previewContainer.innerHTML = "";

  if (!ranked.length) {
    resultsContainer.innerHTML =
      '<p class="muted">Add at least one list to see results.</p>';
    previewContainer.innerHTML =
      '<p class="muted">Add lists to preview the consensus picks.</p>';
    return;
  }

  ranked.slice(0, 3).forEach((result, index) => {
    const card = document.createElement("div");
    card.className = "preview-card";
    card.innerHTML = `
      <strong>#${index + 1} ${result.name}</strong>
      <span>${result.points} points</span>
    `;
    previewContainer.appendChild(card);
  });

  ranked.forEach((result, index) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div>
        <strong>#${index + 1} ${result.name}</strong>
      </div>
      <div class="result-meta">
        <div>${result.points} points</div>
        <div>from ${listCount} list${listCount === 1 ? "" : "s"}</div>
      </div>
    `;
    resultsContainer.appendChild(card);
  });
};

addButton.addEventListener("click", () => addList());
clearButton.addEventListener("click", clearLists);
calculateButton.addEventListener("click", calculateResults);

const seedStarterLists = () => {
  const values = starterLists.map((list) => list.join("\n"));
  ensureListCount(values.length, values);
};

seedStarterLists();
calculateResults();
