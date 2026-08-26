import { EYE_STYLES, mountEyes, createEyeMotion, bindEyePointer, drawEyes } from "./eyes.js";
import { DECKS, createDeck } from "./cassettes.js";
import { VU_UNITS, createVuUnit } from "./vu.js";
import { HDR_IMAGES, NEON_IMAGES, FX_STYLES, LIVE_SCENES, createHdrItem } from "./hdr.js";
import { TANKS, createTank } from "./tanks.js";
import { exportCassetteHTML, exportVuHTML, exportHdrHTML, exportTankHTML, exportEyeHTML, exportPNGFromDeck, recordDeckWebM, recordEyesWebM } from "./export.js";
import {
  listCats,
  saveCat,
  deleteCat,
  itemsWithUrls,
  saveItem,
  updateItem,
  deleteItem,
  allPrefs,
  setPref,
  inspectImage,
  prettyName,
  newId,
  slugify,
  migrateBrowserLibrary,
} from "./library.js";

const BUILTIN = [
  { id: "eyes", label: "Robot Eyes", kind: "eyes", seed: EYE_STYLES },
  { id: "cassettes", label: "Cassette Players", kind: "cassettes", seed: DECKS },
  { id: "vu", label: "VU Meters", kind: "vu", seed: VU_UNITS },
  { id: "hdr", label: "HDR Images", kind: "images", seed: HDR_IMAGES },
  { id: "neon", label: "Neon Images", kind: "images", seed: NEON_IMAGES },
  { id: "tanks", label: "Fish Tanks", kind: "tanks", seed: TANKS },
];

const els = {
  title: document.getElementById("title"),
  hint: document.getElementById("hint"),
  styleNum: document.getElementById("styleNum"),
  styleName: document.getElementById("styleName"),
  housing: document.getElementById("housing"),
  deckMount: document.getElementById("deckMount"),
  extras: document.getElementById("extras"),
  fxBar: document.getElementById("fxBar"),
  fxSelect: document.getElementById("fxSelect"),
  sceneBar: document.getElementById("sceneBar"),
  sceneSelect: document.getElementById("sceneSelect"),
  speedBar: document.getElementById("speedBar"),
  speedSlider: document.getElementById("speedSlider"),
  speedVal: document.getElementById("speedVal"),
  intensityBar: document.getElementById("intensityBar"),
  intensitySlider: document.getElementById("intensitySlider"),
  intensityVal: document.getElementById("intensityVal"),
  dots: document.getElementById("dots"),
  gallery: document.getElementById("gallery"),
  stage: document.getElementById("stage"),
  empty: document.getElementById("empty"),
  cats: document.getElementById("cats"),
  exportDlg: document.getElementById("exportDlg"),
  exportStatus: document.getElementById("exportStatus"),
  sizeSeg: document.getElementById("sizeSeg"),
  uploadDlg: document.getElementById("uploadDlg"),
  uploadForm: document.getElementById("uploadForm"),
  uploadCat: document.getElementById("uploadCat"),
  uploadFx: document.getElementById("uploadFx"),
  uploadStatus: document.getElementById("uploadStatus"),
  filePick: document.getElementById("filePick"),
  fileList: document.getElementById("fileList"),
  dropZone: document.getElementById("dropZone"),
  newCatName: document.getElementById("newCatName"),
  catDlg: document.getElementById("catDlg"),
  catForm: document.getElementById("catForm"),
  catName: document.getElementById("catName"),
  catFx: document.getElementById("catFx"),
  deleteBtn: document.getElementById("deleteBtn"),
};

const state = {
  cat: localStorage.getItem("studio-cat") || "hdr",
  index: 0,
  eyeCount: 2,
  showAll: false,
  eyes: [],
  motion: createEyeMotion(),
  unbind: null,
  decks: [],
  activeDeck: null,
  size: "standard",
  userCats: [],
  userItems: [],
  prefs: {},
  cached: [],
  pendingFiles: [],
};

function catList() {
  return [...BUILTIN, ...state.userCats];
}

function getCat(id = state.cat) {
  return catList().find((c) => c.id === id) || BUILTIN[3];
}

function isImageCat(cat = getCat()) {
  return cat?.kind === "images";
}

function isPhotoItem(item = current()) {
  return Boolean(item?.user);
}

function usesEyeWidget(item = current(), cat = getCat()) {
  return cat?.kind === "eyes" && item && !item.user;
}

function defaultFxForCat(cat = getCat()) {
  if (cat?.kind === "tanks") return "living";
  if (cat?.kind === "cassettes") return "cassette";
  return cat?.defaultFx || "kenburns";
}

function prefKey(item, catId = state.cat) {
  return `${catId}:${item.id}`;
}

function decorate(item, catId) {
  const pref = state.prefs[prefKey(item, catId)];
  if (!pref) return { ...item };
  return {
    ...item,
    fx: pref.fx ?? item.fx,
    scene: pref.scene ?? item.scene,
    speed: pref.speed ?? item.speed ?? 1,
    intensity: pref.intensity ?? item.intensity,
    pace: pref.pace ?? item.pace,
  };
}

function rebuildItems() {
  const cat = getCat();
  const seed = (cat.seed || []).map((item) => decorate(item, cat.id));
  const extras = state.userItems.map((item) => ({ ...item }));
  state.cached = [...seed, ...extras].map((item, i) => ({
    ...item,
    num: String(i + 1).padStart(2, "0"),
  }));
}

function items() {
  return state.cached;
}

function current() {
  return items()[state.index];
}

function widgetOpts(item = current()) {
  return {
    fit: state.size,
    speed: item?.speed ?? 1,
  };
}

function createWidget(item, opts) {
  const kind = getCat().kind;
  if (item?.user || kind === "images") return createHdrItem(item, opts);
  if (kind === "cassettes") return createDeck(item, opts);
  if (kind === "vu") return createVuUnit(item, opts);
  if (kind === "tanks") return createTank(item, opts);
  return createHdrItem(item, opts);
}

function applyToItemDecks(item, fn) {
  state.decks.forEach((deck) => {
    if (deck.deck?.id === item.id) fn(deck);
  });
}

function applySizeChrome() {
  document.body.classList.toggle("size-pi", state.size === "pi");
}

function fillFxSelect(select, value = "kenburns") {
  select.replaceChildren();
  FX_STYLES.forEach((fx) => {
    const opt = document.createElement("option");
    opt.value = fx.id;
    opt.textContent = fx.name;
    select.appendChild(opt);
  });
  select.value = FX_STYLES.some((fx) => fx.id === value) ? value : "kenburns";
}

function fillSceneSelect(select, value = "auto") {
  select.replaceChildren();
  LIVE_SCENES.forEach((scene) => {
    const opt = document.createElement("option");
    opt.value = scene.id;
    opt.textContent = scene.name;
    select.appendChild(opt);
  });
  select.value = LIVE_SCENES.some((scene) => scene.id === value) ? value : "auto";
}

function fillUploadCats() {
  els.uploadCat.replaceChildren();
  catList().forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.label;
    els.uploadCat.appendChild(opt);
  });
  if ([...els.uploadCat.options].some((o) => o.value === state.cat)) {
    els.uploadCat.value = state.cat;
  }
}

function renderCatBar() {
  els.cats.replaceChildren();
  catList().forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.cat = cat.id;
    btn.textContent = cat.label;
    if (cat.id === state.cat) btn.classList.add("on");
    btn.addEventListener("click", () => selectCat(cat.id));
    els.cats.appendChild(btn);
    if (cat.custom) {
      const x = document.createElement("button");
      x.type = "button";
      x.className = "cat-x";
      x.title = `Delete ${cat.label}`;
      x.textContent = "×";
      x.addEventListener("click", (event) => {
        event.stopPropagation();
        removeCategory(cat.id);
      });
      els.cats.appendChild(x);
    }
  });
}

async function loadUserItems(catId = state.cat) {
  try {
    state.userItems = await itemsWithUrls(catId);
  } catch (err) {
    console.warn(err);
    state.userItems = [];
  }
}

async function selectCat(id) {
  state.cat = id;
  state.index = 0;
  localStorage.setItem("studio-cat", id);
  await loadUserItems(id);
  rebuildItems();
  renderCatBar();
  refresh();
}

function setHint() {
  const item = current();
  if (!items().length) {
    els.hint.textContent = "Upload a still to animate — originals stay full resolution";
  } else if (isPhotoItem(item) || isImageCat()) {
    if (item?.fx === "living") {
      els.hint.textContent = "Reads objects inside the still and moves them — pick Swim for a fish tank";
    } else if (item?.fx === "cassette") {
      els.hint.textContent = "Spins the tape reels in the still and bounces any graphic EQ / VU bars";
    } else {
      els.hint.textContent = "Swipe the still to change images. Motion and speed stay below.";
    }
  } else if (state.cat === "eyes") {
    els.hint.textContent = "Looks around and blinks — hover to take control";
  } else if (state.cat === "vu") {
    els.hint.textContent = "Needles bounce with the signal — sliders stay put";
  } else if (state.cat === "tanks") {
    els.hint.textContent = "Fish, jellies and bubbles move inside the glass";
  } else {
    els.hint.textContent = "Reels, counter and VU animate — click transport buttons";
  }
}

function syncItemControls() {
  const item = current();
  const photo = isPhotoItem(item) || (isImageCat() && item);
  const living = photo && (item.fx || "kenburns") === "living";
  els.fxBar.hidden = !photo;
  els.sceneBar.hidden = !living;
  els.speedBar.hidden = !photo;
  els.intensityBar.hidden = !photo;
  els.extras.hidden = getCat().kind !== "eyes" || isPhotoItem(item);
  els.deleteBtn.hidden = !(item?.user || (getCat().custom && !items().length));
  if (photo && item) {
    els.fxSelect.value = item.fx || "kenburns";
    els.sceneSelect.value = LIVE_SCENES.some((scene) => scene.id === (item.scene || "auto"))
      ? (item.scene || "auto")
      : "auto";
    const speed = item.speed ?? 1;
    els.speedSlider.value = String(speed);
    els.speedVal.textContent = `${Number(speed).toFixed(1)}×`;
    const intensity = item.intensity ?? 0.4;
    els.intensitySlider.value = String(intensity);
    els.intensityVal.textContent = Number(intensity).toFixed(2);
  }
}

function syncChrome() {
  syncItemControls();
  applySizeChrome();
}

async function persistMotion(item) {
  if (!item) return;
  if (item.user) {
    await updateItem({
      id: item.id,
      fx: item.fx,
      scene: item.scene,
      speed: item.speed,
      intensity: item.intensity,
      pace: item.pace,
    });
    return;
  }
  const pref = {
    key: prefKey(item),
    fx: item.fx,
    scene: item.scene,
    speed: item.speed ?? 1,
    intensity: item.intensity,
    pace: item.pace,
  };
  state.prefs[pref.key] = pref;
  await setPref(pref);
}

function rebuildDots() {
  els.dots.replaceChildren();
  items().forEach((item, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = item.name;
    if (i === state.index) btn.classList.add("on");
    btn.addEventListener("click", () => goTo(i));
    els.dots.appendChild(btn);
  });
}

function clearLive() {
  if (state.unbind) {
    state.unbind();
    state.unbind = null;
  }
  state.eyes = [];
  state.decks.forEach((d) => d.destroy());
  state.decks = [];
  state.activeDeck = null;
  els.housing.replaceChildren();
  els.deckMount.replaceChildren();
  els.gallery.replaceChildren();
}

function mountSingle() {
  clearLive();
  const list = items();
  const cat = getCat();
  const empty = list.length === 0;
  els.title.textContent = cat.label;
  document.body.classList.remove("show-all");
  document.documentElement.classList.remove("show-all");
  els.stage.hidden = false;
  els.gallery.hidden = true;
  els.empty.hidden = !empty;
  els.housing.hidden = true;
  els.deckMount.hidden = true;
  document.querySelector(".nav-prev").hidden = empty;
  document.querySelector(".nav-next").hidden = empty;

  if (empty) {
    els.styleNum.textContent = "—";
    els.styleName.textContent = "Empty";
    syncChrome();
    rebuildDots();
    setHint();
    return;
  }

  const item = current();
  els.styleNum.textContent = item.num;
  els.styleName.textContent = item.name;
  const photo = isPhotoItem(item);
  els.deckMount.classList.toggle("is-hdr", isImageCat(cat) || photo);
  els.deckMount.classList.toggle("is-tank", cat.kind === "tanks" && !photo);

  if (usesEyeWidget(item, cat)) {
    els.housing.hidden = false;
    els.housing.classList.remove("eye-swap");
    void els.housing.offsetWidth;
    els.housing.classList.add("eye-swap");
    state.eyes = mountEyes(els.housing, item.id, state.eyeCount);
    state.unbind = bindEyePointer(els.housing, state.motion);
  } else {
    els.deckMount.hidden = false;
    const inst = createWidget(item, widgetOpts(item));
    els.deckMount.appendChild(inst.el);
    state.decks = [inst];
    state.activeDeck = inst;
  }
  syncChrome();
  rebuildDots();
  setHint();
}

function mountGallery() {
  clearLive();
  document.body.classList.add("show-all");
  document.documentElement.classList.add("show-all");
  window.scrollTo(0, 0);
  els.stage.hidden = true;
  els.gallery.hidden = false;
  els.empty.hidden = true;
  els.title.textContent = getCat().label;
  syncChrome();

  items().forEach((item, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<span class="card-meta"><b>${item.num}</b> ${item.name}</span>`;
    const stage = document.createElement("div");
    stage.className = "card-stage";
    card.appendChild(stage);

    if (usesEyeWidget(item, getCat())) {
      const housing = document.createElement("div");
      housing.className = "housing";
      housing.dataset.count = String(state.eyeCount);
      housing.addEventListener("click", () => {
        state.showAll = false;
        document.getElementById("showAll").classList.remove("on");
        goTo(i);
      });
      stage.appendChild(housing);
      const eyes = mountEyes(housing, item.id, state.eyeCount);
      const motion = createEyeMotion();
      motion.until = performance.now() + 400 * i;
      state.decks.push({
        kind: "eyes",
        destroy() {},
        update() {},
        draw(now) {
          motion.tick(now);
          drawEyes(eyes, motion, housing);
        },
      });
    } else {
      const inst = createWidget(item, widgetOpts(item));
      stage.appendChild(inst.el);
      state.decks.push(inst);
    }

    card.querySelector(".card-meta").addEventListener("click", () => {
      state.showAll = false;
      document.getElementById("showAll").classList.remove("on");
      goTo(i);
    });
    els.gallery.appendChild(card);
  });
  setHint();
}

function refresh() {
  applySizeChrome();
  if (state.showAll) mountGallery();
  else mountSingle();
}

function goTo(index, dir = 1) {
  const list = items();
  if (!list.length) return;
  state.index = ((index % list.length) + list.length) % list.length;
  if (!state.showAll) {
    els.housing.style.setProperty("--slide", dir > 0 ? "28px" : "-28px");
    els.deckMount.style.setProperty("--slide", dir > 0 ? "28px" : "-28px");
  }
  refresh();
}

function step(dir) {
  if (state.showAll) return;
  goTo(state.index + dir, dir);
}

function renderPending() {
  els.fileList.replaceChildren();
  state.pendingFiles.forEach((file) => {
    const li = document.createElement("li");
    li.textContent = file.label || file.file.name;
    els.fileList.appendChild(li);
  });
}

function isImageFile(file) {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(file.name);
}

async function addPending(fileList) {
  const files = [...fileList].filter(isImageFile);
  for (const file of files) {
    let label = `${prettyName(file.name)} · original file`;
    try {
      const info = await inspectImage(file);
      label = `${prettyName(file.name)} · ${info.w}×${info.h}`;
      state.pendingFiles.push({ file, info, label });
    } catch {
      state.pendingFiles.push({ file, info: null, label });
    }
  }
  renderPending();
}

async function createUserCategory(label, defaultFx = "kenburns") {
  const name = label.trim();
  if (!name) return null;
  const cat = {
    id: `cat_${slugify(name)}_${Date.now().toString(36)}`,
    label: name,
    kind: "images",
    custom: true,
    defaultFx,
  };
  await saveCat(cat);
  state.userCats.push(cat);
  fillUploadCats();
  renderCatBar();
  return cat;
}

function openUpload() {
  state.pendingFiles = [];
  renderPending();
  els.uploadStatus.textContent = "";
  fillUploadCats();
  fillFxSelect(els.uploadFx, defaultFxForCat(getCat(els.uploadCat.value)));
  els.uploadDlg.showModal();
}

async function removeCategory(id) {
  const cat = getCat(id);
  if (!cat?.custom) return;
  if (!confirm(`Delete category “${cat.label}” and its uploads?`)) return;
  await deleteCat(id);
  state.userCats = state.userCats.filter((c) => c.id !== id);
  if (state.cat === id) state.cat = "hdr";
  localStorage.setItem("studio-cat", state.cat);
  await loadUserItems(state.cat);
  rebuildItems();
  renderCatBar();
  fillUploadCats();
  refresh();
}

document.getElementById("showAll").addEventListener("click", (event) => {
  if (!items().length) return;
  state.showAll = !state.showAll;
  event.currentTarget.classList.toggle("on", state.showAll);
  refresh();
});

document.querySelector(".nav-prev").addEventListener("click", () => step(-1));
document.querySelector(".nav-next").addEventListener("click", () => step(1));

els.extras.querySelectorAll("[data-count]").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.extras.querySelectorAll("[data-count]").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    state.eyeCount = Number(btn.dataset.count);
    refresh();
  });
});

els.sizeSeg.querySelectorAll("[data-size]").forEach((btn) => {
  btn.addEventListener("click", () => {
    els.sizeSeg.querySelectorAll("[data-size]").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    state.size = btn.dataset.size;
    refresh();
  });
});

els.fxSelect.addEventListener("change", async () => {
  const item = current();
  if (!item) return;
  item.fx = els.fxSelect.value;
  applyToItemDecks(item, (deck) => deck.setFx?.(item.fx));
  syncItemControls();
  setHint();
  await persistMotion(item);
});

els.sceneSelect.addEventListener("change", async () => {
  const item = current();
  if (!item) return;
  item.scene = els.sceneSelect.value;
  applyToItemDecks(item, (deck) => deck.setScene?.(item.scene));
  await persistMotion(item);
});

els.speedSlider.addEventListener("input", () => {
  const item = current();
  if (!item) return;
  const mul = Number(els.speedSlider.value);
  item.speed = mul;
  els.speedVal.textContent = `${mul.toFixed(1)}×`;
  applyToItemDecks(item, (deck) => deck.setSpeed?.(mul));
});
els.speedSlider.addEventListener("change", async () => {
  await persistMotion(current());
});

els.intensitySlider.addEventListener("input", () => {
  const item = current();
  if (!item) return;
  const value = Number(els.intensitySlider.value);
  item.intensity = value;
  els.intensityVal.textContent = value.toFixed(2);
  applyToItemDecks(item, (deck) => deck.setIntensity?.(value));
});
els.intensitySlider.addEventListener("change", async () => {
  await persistMotion(current());
});

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, select, textarea")) return;
  if (event.key === "ArrowLeft") step(-1);
  if (event.key === "ArrowRight") step(1);
  if (state.cat === "eyes") {
    if (event.key === "1") els.extras.querySelector('[data-count="1"]').click();
    if (event.key === "2") els.extras.querySelector('[data-count="2"]').click();
    if (event.key === "3") els.extras.querySelector('[data-count="3"]').click();
  }
  if (event.key === "g") document.getElementById("showAll").click();
});

let wheelAcc = 0;
window.addEventListener(
  "wheel",
  (event) => {
    if (state.showAll) return;
    if (event.target.closest(".dock, .topbar, dialog, input, select, textarea")) return;
    const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
    if (!dx) return;
    wheelAcc += dx;
    if (Math.abs(wheelAcc) > 70) {
      step(Math.sign(wheelAcc));
      wheelAcc = 0;
    }
  },
  { passive: true }
);

function swipeBlocked(target) {
  return Boolean(target?.closest?.(".dock, .topbar, dialog, input, select, textarea, button, .cats, .tools"));
}

let touchStart = null;
els.stage.addEventListener("touchstart", (event) => {
  if (swipeBlocked(event.target)) {
    touchStart = null;
    return;
  }
  const touch = event.changedTouches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });
els.stage.addEventListener("touchend", (event) => {
  if (!touchStart || state.showAll) {
    touchStart = null;
    return;
  }
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart.x;
  const dy = touch.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
  step(dx < 0 ? 1 : -1);
}, { passive: true });

document.getElementById("exportBtn").addEventListener("click", () => {
  if (!current()) return;
  els.exportStatus.textContent = "";
  els.exportDlg.showModal();
});

async function runExport(kind) {
  const item = current();
  if (!item) return;
  els.exportStatus.textContent = "Exporting…";
  const cat = getCat();
  try {
    if (isPhotoItem(item) || cat.kind !== "eyes") {
      const inst = state.activeDeck || state.decks[0];
      if (kind === "html") {
        const fitOpts = { fit: state.size, speed: item.speed ?? 1 };
        if (isPhotoItem(item) || cat.kind === "images") await exportHdrHTML(item, fitOpts);
        else if (cat.kind === "vu") await exportVuHTML(item, fitOpts);
        else if (cat.kind === "tanks") await exportTankHTML(item, fitOpts);
        else await exportCassetteHTML(item, fitOpts);
      }
      if (kind === "png") await exportPNGFromDeck(inst);
      if (kind === "webm") await recordDeckWebM(inst, 4);
    } else {
      if (kind === "html") await exportEyeHTML(item, state.eyeCount, { fit: state.size });
      if (kind === "png") {
        els.exportStatus.textContent = "PNG snapshot works best for stills and decks. Use HTML or WebM for eyes.";
        return;
      }
      if (kind === "webm") await recordEyesWebM(els.housing, 4, state.size === "pi" ? { w: 1920, h: 480 } : null);
    }
    els.exportStatus.textContent = "Saved to your downloads folder.";
  } catch (err) {
    els.exportStatus.textContent = err.message || "Export failed.";
  }
}

els.exportDlg.querySelectorAll("[data-export]").forEach((btn) => {
  btn.addEventListener("click", () => runExport(btn.dataset.export));
});

document.getElementById("uploadBtn").addEventListener("click", openUpload);
document.getElementById("emptyUpload").addEventListener("click", openUpload);
document.getElementById("uploadCancel").addEventListener("click", () => els.uploadDlg.close());
document.getElementById("newCatBtn").addEventListener("click", () => {
  els.catName.value = "";
  fillFxSelect(els.catFx, "kenburns");
  els.catDlg.showModal();
});
document.getElementById("catCancel").addEventListener("click", () => els.catDlg.close());

els.dropZone.addEventListener("click", () => els.filePick.click());
els.uploadCat.addEventListener("change", () => {
  fillFxSelect(els.uploadFx, defaultFxForCat(getCat(els.uploadCat.value)));
});
els.filePick.addEventListener("change", async () => {
  await addPending(els.filePick.files);
  els.filePick.value = "";
});
["dragenter", "dragover"].forEach((name) => {
  els.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("over");
  });
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("over"));
els.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("over");
  await addPending(event.dataTransfer.files);
});

document.getElementById("makeCat").addEventListener("click", async () => {
  const cat = await createUserCategory(els.newCatName.value, els.uploadFx.value);
  if (!cat) return;
  els.newCatName.value = "";
  els.uploadCat.value = cat.id;
});

els.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.pendingFiles.length) {
    els.uploadStatus.textContent = "Choose at least one image.";
    return;
  }
  let catId = els.uploadCat.value;
  if (els.newCatName.value.trim()) {
    const cat = await createUserCategory(els.newCatName.value, els.uploadFx.value);
    if (cat) catId = cat.id;
  }
  const fx = els.uploadFx.value || "kenburns";
  els.uploadStatus.textContent = "Saving originals…";
  try {
    for (const pending of state.pendingFiles) {
      const info = pending.info || (await inspectImage(pending.file));
      const item = {
        id: newId("img"),
        catId,
        name: prettyName(pending.file.name),
        fx,
        scene: fx === "living" ? "auto" : undefined,
        speed: 1,
        intensity: fx === "cassette" ? 0.7 : 0.4,
        pace: fx === "cassette" ? 1 : 0.4,
        w: info.w,
        h: info.h,
        mime: pending.file.type,
        created: Date.now(),
      };
      await saveItem(item, pending.file);
    }
    els.uploadDlg.close();
    state.pendingFiles = [];
    await selectCat(catId);
    state.index = Math.max(0, items().length - 1);
    refresh();
  } catch (err) {
    els.uploadStatus.textContent = err.message || "Could not save the image to studio storage.";
  }
});

els.catForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const cat = await createUserCategory(els.catName.value, els.catFx.value);
  if (!cat) return;
  els.catDlg.close();
  await selectCat(cat.id);
});

els.deleteBtn.addEventListener("click", async () => {
  const item = current();
  const cat = getCat();
  if (item?.user) {
    if (!confirm(`Remove “${item.name}” from the studio? The original file in this library will be deleted.`)) return;
    await deleteItem(item.id);
    await loadUserItems();
    rebuildItems();
    state.index = Math.min(state.index, Math.max(0, items().length - 1));
    refresh();
    return;
  }
  if (cat.custom && !items().length) await removeCategory(cat.id);
});

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (usesEyeWidget() && !state.showAll && items().length) {
    state.motion.tick(now);
    drawEyes(state.eyes, state.motion, els.housing);
  }
  state.decks.forEach((d) => {
    d.update?.(dt);
    d.draw?.(now);
  });
  requestAnimationFrame(frame);
}

async function boot() {
  fillFxSelect(els.fxSelect);
  fillFxSelect(els.uploadFx);
  fillFxSelect(els.catFx);
  fillSceneSelect(els.sceneSelect);
  try {
    await migrateBrowserLibrary();
    state.prefs = await allPrefs();
    state.userCats = (await listCats()).map((cat) => ({ ...cat, custom: true, kind: "images" }));
  } catch (err) {
    console.warn(err);
  }
  if (!catList().some((c) => c.id === state.cat)) state.cat = "hdr";
  await loadUserItems(state.cat);
  rebuildItems();
  if (state.index >= items().length) state.index = 0;
  renderCatBar();
  fillUploadCats();
  refresh();
  requestAnimationFrame(frame);
}

boot();
