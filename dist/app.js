const app = document.querySelector("#app"),
  dialog = document.querySelector("#crop-dialog"),
  fileInput = document.querySelector("#file-input");
const initial = {
  name: "Your name",
  bio: "Books, films, and everything in between.\nA few of my favorite things.",
  avatar: "",
  columns: 2,
  groups: [],
  collections: [
    { id: "books", title: "Books", slots: Array(9).fill(null) },
    { id: "films", title: "Films", slots: Array(9).fill(null) },
  ],
};
const ratios = { square: 1, portrait: 788 / 1196, landscape: 1090 / 570 };
let state,
  db,
  draft,
  profileDraft,
  dirty = false,
  crop,
  uploadTarget,
  drag,
  descriptionIndex = null;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const ratio = (c) => ratios[c?.shape] || 1;
function safeLink(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
function notify(message) {
  const n = document.querySelector("#notice");
  n.textContent = message;
  n.style.display = "block";
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (n.style.display = "none"), 3500);
}
async function init() {
  try {
    db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("three-by-three", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("profile");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    state = await new Promise((resolve, reject) => {
      const r = db.transaction("profile").objectStore("profile").get("main");
      r.onsuccess = () => resolve(r.result || structuredClone(initial));
      r.onerror = () => reject(r.error);
    });
    await initializeAccounts();
    render();
  } catch (error) {
    currentAccount = null;
    state = structuredClone(initial);
    render();
    notify(error.message || "Unable to initialize accounts.");
  }
}
async function persist(next) {
  if (typeof cloud !== "undefined" && cloud) return saveCloudProfile(next);
  if (!db) throw Error("Storage unavailable");
  if (!currentAccount) throw Error("Sign in to save");
  const profileKey = accountProfileKey(currentAccount.id);
  await new Promise((resolve, reject) => {
    const tx = db.transaction("profile", "readwrite");
    tx.objectStore("profile").put(next, profileKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  state = next;
}
// CSS crops the original source, so GIFs continue to animate in every view.
function imageMarkup(slot, r = 1) {
  if (!slot?.source && !slot?.preview) return "";
  const src =
    slot.width && slot.height ? slot.source : slot.preview || slot.source;
  let style = "";
  if (slot.width && slot.height) {
    const relative = slot.width / slot.height;
    const z = slot.zoom || 1;
    const width = 100 * Math.max(1, relative / r) * z,
      height = 100 * Math.max(1, r / relative) * z;
    style = `width:${width}%;height:${height}%;left:${50 + (slot.x || 0) * 100}%;top:${50 + (slot.y || 0) * 100}%;`;
  }
  return `<img src="${esc(src)}" alt="${esc(slot.alt || "Collection image")}" style="${style}" draggable="false">`;
}
function tiles(collection, mode = "home") {
  const { columns } = gridSize(collection);
  return gridSlots(collection)
    .map((slot, i) => {
      const hasImage = !!(slot?.source || slot?.preview);
      const image = hasImage
        ? imageMarkup(slot, ratio(collection))
        : `<span class="slot-number">${String(i + 1).padStart(2, "0")}</span>`;
      if (mode === "editor")
        return `
      <div class="tile editor-tile ${hasImage ? "" : "empty"}" data-reorder="image"
        tabindex="0" aria-label="Image ${i + 1}. Drag to move, or use arrow keys.">
        <div class="image-window">${image}</div>
        <div class="tile-actions">
          <button type="button" data-image="${i}">edit image</button>
          <button type="button" data-description="${i}">edit description</button>
        </div>
      </div>`;
      if (mode === "profile")
        return `<div class="tile"><div class="image-window">${image}</div></div>`;
      const href = safeLink(slot?.link),
        tipId = "info-" + collection.id + "-" + i;
      return `
      <div class="tile home-tile ${i % columns === 0 ? "tip-left" : "tip-right"}">
        <${href ? "a" : "div"} class="image-window"
          ${href ? 'href="' + esc(href) + '"' : hasImage ? 'tabindex="0"' : ""}
          ${hasImage ? 'aria-describedby="' + esc(tipId) + '"' : ""}>${image}</${href ? "a" : "div"}>
        ${hasImage ? `<aside class="speechbox info-box" id="${esc(tipId)}" role="tooltip">${infoMarkup(slot)}</aside>` : ""}
      </div>`;
    })
    .join("");
}

function downloadIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>';
}
function gridClass(c) {
  return `grid ${c.borders === false ? "borderless" : ""}`;
}
function gridMarkup(collection, mode) {
  const { columns, rows } = gridSize(collection);
  return `<div class="${gridClass(collection)}"
    style="--ratio:${gridRatio(collection)};--grid-columns:${columns};--grid-rows:${rows}">
    ${tiles(collection, mode)}
  </div>`;
}
async function render() {
  renderAccountNav();
  let route;
  try {
    route = await resolveRoute();
  } catch (error) {
    app.innerHTML = `<section class="account-form"><h1>Page unavailable</h1><p>${esc(error.message)}</p><a href="/">Home</a></section>`;
    return;
  }
  if (route.stale) return;
  if ("auth" in route) return renderAccountForm(route.auth);
  if (route.landing) return renderLanding();
  const home = currentAccount ? profilePath(ownProfile) : "/";
  document.querySelector("#home-link").href = home;
  document.querySelector("#edit-link").href = currentAccount
    ? home + "/edit"
    : "/login";
  document
    .querySelector("#home-link")
    .setAttribute("aria-current", route.editing ? "false" : "page");
  document
    .querySelector("#edit-link")
    .setAttribute("aria-current", route.editing ? "page" : "false");
  if (route.collectionId) return renderEditor(route.collectionId);
  draft = null;
  dirty = false;
  profileDraft = structuredClone(state);
  renderProfile(route.editing);
}
function renderLanding() {
  document.title = "3x3site — a personal index";
  draft = null;
  dirty = false;
  app.innerHTML = `
    <section class="landing-page" aria-label="Welcome to 3x3site">
      <div class="landing-hero">
        <h1 class="landing-title">3<span>×</span>3site</h1>
        <div class="landing-subtitles">
          <div class="landing-subtitle-item">
            Make your own page full of 3x3s of various things you like
          </div>
          <div class="landing-subtitle-item">
            Upload your own images and edit your own page
          </div>
          <div class="landing-subtitle-item">
            Your own sharable page by URL and downloadable pages/grids
          </div>
          <div class="landing-subtitle-item">
            <a href="/fhgeh" class="landing-example-link">Example profile</a>
          </div>
        </div>
        <div class="landing-cta">
          <a href="/register" class="landing-register-btn">REGISTER</a>
        </div>
      </div>
    </section>`;
}
function collectionCard(collection, index, editing) {
  const { columns, rows } = gridSize(collection);
  return `
    <article class="collection ${editing ? "editable" : ""}" ${
      editing
        ? `data-reorder="collection" data-collection-id="${esc(collection.id)}" data-group-id="${esc(collection.groupId || "")}" tabindex="0" aria-label="${esc(collection.title || "Grid")}. Drag to move, or use arrow keys."`
        : ""
    }>
      ${
        editing
          ? `<button type="button" class="delete-grid-btn" data-delete-grid="${esc(collection.id)}" aria-label="Delete ${esc(collection.title || "grid")}">×</button>`
          : ""
      }
      ${editing ? `<a href="${editorPath(collection.id)}">` : ""}
        <div class="card-frame">${gridMarkup(collection, editing ? "profile" : "home")}</div>
        <div class="collection-caption">
          <h2>${esc(collection.title)}</h2>
          ${
            editing
              ? ""
              : `<button type="button" class="download-button grid-download"
            data-download-grid="${esc(collection.id)}" aria-label="Download ${esc(collection.title)} as PNG">${downloadIcon()}</button>`
          }
          <span>${String(index + 1).padStart(2, "0")} / ${columns}×${rows}</span>
        </div>
      ${editing ? "</a>" : ""}
    </article>`;
}
function renderCollectionsView(editing) {
  const profile = editing ? profileDraft : state;
  const collections = profile?.collections || [];
  const groups = profile?.groups || [];
  const cols = profile?.columns || 2;

  if (!groups.length) {
    return `
      <section class="collections" style="--columns:${cols}" aria-label="Collections">
        ${collections.map((c, i) => collectionCard(c, i, editing)).join("")}
        ${editing ? `<a class="add-grid" href="${editorPath("new")}" aria-label="Add a grid"><b>+</b><span>Add a grid</span></a>` : ""}
      </section>`;
  }

  const ungrouped = collections.filter(
    (c) => !c.groupId || !groups.some((g) => g.id === c.groupId),
  );
  let html = "";
  if (ungrouped.length > 0) {
    html += `
      <div class="group-section" data-group-section="ungrouped">
        <section class="collections ungrouped-collections" style="--columns:${cols}" data-group-id="" aria-label="Ungrouped collections">
          ${ungrouped.map((c) => collectionCard(c, collections.indexOf(c), editing)).join("")}
        </section>
      </div>`;
  }

  for (const group of groups) {
    const groupItems = collections.filter((c) => c.groupId === group.id);
    html += `
      <div class="group-section" data-group-section="${esc(group.id)}">
        <div class="group-divider ${editing ? "editable" : ""}">
          <div class="group-divider-line"></div>
          ${
            editing
              ? `
            <div class="group-title-wrap">
              <input class="group-title-input" data-group-title="${esc(group.id)}" value="${esc(group.title)}" placeholder="Group name" aria-label="Group name" maxlength="60">
              <button type="button" class="delete-group-btn" data-delete-group="${esc(group.id)}" aria-label="Delete group">×</button>
            </div>`
              : `<span class="group-divider-title">${esc(group.title)}</span>`
          }
          <div class="group-divider-line"></div>
        </div>
        <section class="collections group-collections" style="--columns:${cols}" data-group-id="${esc(group.id)}" aria-label="${esc(group.title)} collections">
          ${groupItems.map((c) => collectionCard(c, collections.indexOf(c), editing)).join("")}
          ${editing && groupItems.length === 0 ? `<div class="empty-group-target" data-group-drop="${esc(group.id)}">Drop 3×3s here</div>` : ""}
        </section>
      </div>`;
  }

  if (editing) {
    html += `
      <div class="edit-profile-bottom">
        <a class="add-grid" href="${editorPath("new")}" aria-label="Add a grid"><b>+</b><span>Add a grid</span></a>
      </div>`;
  }
  return html;
}
function refreshCollections() {
  const container = document.querySelector("#collections-view");
  if (!container) return render();
  container.innerHTML = renderCollectionsView(true);
  const countSpan = document.querySelector("#collection-count");
  if (countSpan && profileDraft) {
    countSpan.textContent = `Collections / ${String(profileDraft.collections.length).padStart(2, "0")} · Drag to reorder; save profile to keep changes.`;
  }
}
function renderProfile(editing) {
  document.title = state.name + " — 3x3site";
  if (editing && profileDraft) {
    profileDraft.groups =
      profileDraft.groups || structuredClone(state.groups || []);
  }
  const profile = editing ? profileDraft : state;
  const cols = profile?.columns || 2;
  const colCount = profile?.collections?.length || 0;
  app.innerHTML = `
    ${
      editing
        ? ""
        : `<button type="button" class="download-button profile-download" data-download-profile
      aria-label="Download profile as PNG">${downloadIcon()}</button>`
    }
    <section class="profile" aria-label="Profile">
      ${
        editing
          ? `
        <button class="avatar-button" aria-label="Change profile picture">${avatarMarkup(state)}</button>
        <input class="name-input" aria-label="Display name" maxlength="60" value="${esc(state.name)}">
        <label class="username-label">Username
          <input class="username-input" maxlength="40" pattern="[a-z0-9_-]+" value="${esc(state.username || "")}">
        </label>
        <textarea class="bio-input" aria-label="Biography" maxlength="600">${esc(state.bio)}</textarea>
        <button class="profile-save">Save profile</button>
      `
          : `
        <div class="profile-photo">${avatarMarkup(state)}</div>
        <h1>${esc(state.name)}</h1>
        <p class="bio">${esc(state.bio)}</p>
      `
      }
    </section>
    <div class="collection-bar">
      <span id="collection-count">Collections / ${String(colCount).padStart(2, "0")}${editing ? " · Drag to reorder; save profile to keep changes." : ""}</span>
      <div class="collection-bar-actions">
        ${editing ? `<button type="button" id="add-group-button" class="add-group-btn">+ Add group line</button>` : ""}
        <label>Per row <select id="columns" aria-label="Collections per row">
          ${[2, 3, 4].map((n) => `<option value="${n}" ${n === cols ? "selected" : ""}>${n}</option>`).join("")}
        </select></label>
      </div>
    </div>
    <div id="collections-view">
      ${renderCollectionsView(editing)}
    </div>`;
  document.querySelector("#columns").onchange = async (event) => {
    const columns = +event.target.value;
    document
      .querySelectorAll(".collections")
      .forEach((el) => el.style.setProperty("--columns", columns));
    if (viewedUserId !== currentAccount?.id) return;
    if (editing) {
      profileDraft.columns = columns;
      dirty = true;
      return;
    }
    try {
      await persist({ ...state, columns });
    } catch (error) {
      notify(error.message);
    }
  };
  if (editing) {
    document.querySelector(".avatar-button").onclick = () =>
      pickImage("avatar");
    document.querySelector(".name-input").oninput = (e) => {
      profileDraft.name = e.target.value;
      dirty = true;
    };
    document.querySelector(".username-input").oninput = (e) => {
      profileDraft.username = e.target.value.trim().toLowerCase();
      dirty = true;
    };
    document.querySelector(".bio-input").oninput = (e) => {
      profileDraft.bio = e.target.value;
      dirty = true;
    };
    document.querySelector(".profile-save").onclick = saveProfile;
    const addGroupBtn = document.querySelector("#add-group-button");
    if (addGroupBtn) {
      addGroupBtn.onclick = () => {
        if (!profileDraft.groups) profileDraft.groups = [];
        const newGroup = {
          id: crypto.randomUUID(),
          title: "New Group",
        };
        profileDraft.groups.push(newGroup);
        dirty = true;
        refreshCollections();
        notify(
          "Group line added. Drag 3×3s under it, and save profile to keep changes.",
        );
        const input = document.querySelector(
          `[data-group-title="${newGroup.id}"]`,
        );
        if (input) {
          input.focus();
          input.select();
        }
      };
    }
  }
}

async function saveProfile() {
  if (!profileDraft.name.trim()) return notify("Enter a username.");
  const saveBtn = document.querySelector(".profile-save");
  const originalText = saveBtn ? saveBtn.innerHTML : "";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML =
      '<span class="spinner" aria-hidden="true"></span> Saving...';
  }
  try {
    await persist({
      ...state,
      columns: profileDraft.columns,
      username: profileDraft.username,
      name: profileDraft.name.trim(),
      bio: profileDraft.bio,
      avatar: profileDraft.avatar,
      collections: profileDraft.collections,
      groups: profileDraft.groups || [],
    });
    profileDraft = structuredClone(state);
    renderAccountNav();
    dirty = false;
    navigate(profilePath() + "/edit", true);
    notify("Profile saved.");
  } catch (error) {
    notify("Could not save: " + error.message);
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalText;
    }
  }
}
function renderEditor(id) {
  document.title = "Edit grid — 3x3site";
  const existing = state.collections.find((c) => c.id === id);
  if (id !== "new" && !existing) {
    navigate(profilePath() + "/edit");
    return;
  }
  draft = structuredClone(
    existing || {
      id: crypto.randomUUID(),
      title: "",
      shape: "square",
      borders: true,
      groupId: null,
      slots: Array(9).fill(null),
    },
  );
  dirty = false;
  app.innerHTML = `
    <section class="editor">
      <a class="back" href="${profilePath()}/edit">← Back to profile</a>
      <h1>${existing ? "Edit grid" : "New grid"}</h1>
      <input class="title-input" aria-label="Grid title" maxlength="80" placeholder="Grid title" value="${esc(draft.title)}">
      <div class="grid-options">
        ${renderSizePicker()}
        <label>Image shape <select id="shape">
          <option value="square">Square · 1:1</option>
          <option value="portrait">Portrait · 788:1196</option>
          <option value="landscape">Landscape · 1090:570</option>
        </select></label>
        <label><input type="checkbox" id="borders" ${draft.borders !== false ? "checked" : ""}> Grid borders</label>
        ${
          state.groups && state.groups.length > 0
            ? `
          <label>Group <select id="grid-group">
            <option value="">(None)</option>
            ${state.groups.map((g) => `<option value="${esc(g.id)}" ${draft.groupId === g.id ? "selected" : ""}>${esc(g.title)}</option>`).join("")}
          </select></label>`
            : ""
        }
      </div>
      <div id="editable-grid">${gridMarkup(draft, "editor")}</div>
      <p class="hint">Drag anywhere on a tile to reorder. Focus a tile and use arrow keys to move it.</p>
      <div class="editor-actions">
        <button class="primary" id="save-grid">Save grid</button>
        <a class="back" href="${profilePath()}/edit">Cancel</a>
      </div>
      <p class="save-error" role="alert"></p>
    </section>`;
  bindSizePicker();
  document.querySelector(".title-input").oninput = (e) => {
    draft.title = e.target.value;
    dirty = true;
  };
  document.querySelector("#shape").value = draft.shape || "square";
  document.querySelector("#shape").onchange = (e) => {
    draft.shape = e.target.value;
    dirty = true;
    refreshGrid();
  };
  document.querySelector("#borders").onchange = (e) => {
    draft.borders = e.target.checked;
    dirty = true;
    refreshGrid();
  };
  const groupSelect = document.querySelector("#grid-group");
  if (groupSelect) {
    groupSelect.onchange = (e) => {
      draft.groupId = e.target.value || null;
      dirty = true;
    };
  }
  bindSlots();
  document.querySelector("#save-grid").onclick = async () => {
    if (!draft.title.trim()) {
      document.querySelector(".save-error").textContent =
        "Give your grid a title.";
      document.querySelector(".title-input").focus();
      return;
    }
    const visibleCount = gridSlots(draft).length;
    if (
      draft.slots
        .slice(visibleCount)
        .some(
          (slot) =>
            slot &&
            (slot.source || slot.preview || slot.info || slot.sections?.length),
        )
    ) {
      if (
        !confirm(
          "This smaller grid will remove the images and descriptions outside its new size. Save anyway?",
        )
      )
        return;
    }
    const saveBtn = document.querySelector("#save-grid");
    const originalText = saveBtn ? saveBtn.innerHTML : "";
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML =
        '<span class="spinner" aria-hidden="true"></span> Saving...';
    }
    const next = structuredClone(state);
    draft.slots = gridSlots(draft);
    draft.title = draft.title.trim();
    const index = next.collections.findIndex((c) => c.id === draft.id);
    if (index < 0) next.collections.push(draft);
    else next.collections[index] = draft;
    try {
      await persist(next);
      dirty = false;
      navigate(profilePath());
      notify("Grid saved.");
    } catch (error) {
      document.querySelector(".save-error").textContent =
        "Could not save: " + error.message + ". Your edits are still here.";
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    }
  };
}
function refreshGrid() {
  document.querySelector("#editable-grid").innerHTML = gridMarkup(
    draft,
    "editor",
  );
  bindSlots();
}
function bindSlots() {
  document.querySelectorAll("[data-image]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = +b.dataset.image;
        uploadTarget = i;
        if (draft.slots[i]?.source) openCrop(draft.slots[i]);
        else pickImage(i);
      }),
  );
  document
    .querySelectorAll("[data-description]")
    .forEach(
      (b) => (b.onclick = () => openDescription(+b.dataset.description, b)),
    );
}
function closeDescription() {
  document.querySelector(".description-box")?.remove();
  descriptionIndex = null;
}
function openDescription(i, button) {
  closeDescription();
  descriptionIndex = i;
  const slot = draft.slots[i] || {};
  const panel = document.createElement("form");
  panel.className =
    "speechbox description-box " +
    (i % gridSize(draft).columns === 0 ? "on-left" : "on-right");
  panel.setAttribute("aria-label", "Description for image " + (i + 1));
  panel.innerHTML = `
    <div class="description-head"><strong>Image ${i + 1}</strong><button type="button" class="close-description" aria-label="Close description">×</button></div>
    <div class="info-fields"></div>
    <button type="button" class="add-info">Add new info</button>
    <label>Link<input name="link" aria-label="Image link" placeholder="https://" value="${esc(slot.link || "")}"></label>
    <p class="description-error" role="alert"></p>
    <button type="submit" class="primary">Save description</button>`;
  function addSection(section = { title: "Info", text: "" }) {
    const field = document.createElement("fieldset");
    field.className = "info-field";
    field.innerHTML = `
      <label>Title<input data-info-title aria-label="Info title" maxlength="80" value="${esc(section.title)}"></label>
      <label>Text<textarea data-info-text aria-label="Info text" maxlength="10000">${esc(section.text)}</textarea></label>
      <button type="button" class="remove-info">Remove info</button>`;
    field.querySelector(".remove-info").onclick = () => field.remove();
    panel.querySelector(".info-fields").append(field);
    return field;
  }
  infoSections(slot).forEach(addSection);
  panel.querySelector(".add-info").onclick = () =>
    addSection().querySelector("input").focus();
  button.closest(".tile").append(panel);
  panel.querySelector(".close-description").onclick = () => {
    closeDescription();
    button.focus();
  };
  panel.onkeydown = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDescription();
      button.focus();
    }
  };
  panel.onsubmit = (e) => {
    e.preventDefault();
    const link = panel.elements.link.value.trim();
    if (link && !safeLink(link)) {
      panel.querySelector(".description-error").textContent =
        "Enter a full http:// or https:// link.";
      return;
    }
    const sections = [...panel.querySelectorAll(".info-field")].map(
      (field) => ({
        title: field.querySelector("[data-info-title]").value.trim() || "Info",
        text: field.querySelector("[data-info-text]").value,
      }),
    );
    draft.slots[i] = { ...draft.slots[i], sections, link };
    delete draft.slots[i].info;
    dirty = true;
    closeDescription();
    button.focus();
    notify("Description updated. Save the grid to keep changes.");
  };
  panel.querySelector("input")?.focus();
  positionSpeechbox(panel);
}

function pickImage(target) {
  uploadTarget = target;
  fileInput.value = "";
  fileInput.click();
}
fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return notify("Choose an image file.");
  if (file.size > 30 * 1024 * 1024)
    return notify("Choose an image smaller than 30 MB.");
  try {
    const src = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const im = await loadImage(src);
    let source = src;
    const animated = file.type === "image/gif" || /\.gif$/i.test(file.name);
    if (!animated) {
      const canvas = document.createElement("canvas"),
        scale = Math.min(1, 1800 / Math.max(im.width, im.height));
      canvas.width = Math.round(im.width * scale);
      canvas.height = Math.round(im.height * scale);
      canvas.getContext("2d").drawImage(im, 0, 0, canvas.width, canvas.height);
      source = canvas.toDataURL("image/png");
    }
    openCrop({
      source,
      animated,
      zoom: 1,
      x: 0,
      y: 0,
      alt: file.name.replace(/\.[^.]+$/, ""),
    });
  } catch {
    notify("This image could not be opened. Try GIF, PNG, JPEG, or WebP.");
  }
};
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}
async function openCrop(slot) {
  try {
    const im = await loadImage(slot.source);
    crop = {
      ...slot,
      zoom: slot.zoom || 1,
      x: slot.x || 0,
      y: slot.y || 0,
      im,
      width: im.width,
      height: im.height,
    };
    document.querySelector("#crop-image").src = slot.source;
    document.querySelector("#zoom").value = crop.zoom;
    document.querySelector("#crop-error").textContent = "";
    document.querySelector("#crop-stage").style.aspectRatio =
      uploadTarget === "avatar" ? 1 : ratio(draft);
    if (!dialog.open) dialog.showModal();
    paintCrop();
  } catch {
    notify("Image could not be loaded.");
  }
}
function paintCrop() {
  const stage = document.querySelector("#crop-stage"),
    w = stage.clientWidth,
    h = stage.clientHeight;
  const scale = Math.max(w / crop.im.width, h / crop.im.height) * crop.zoom;
  const img = document.querySelector("#crop-image");
  img.style.width = crop.im.width * scale + "px";
  img.style.height = crop.im.height * scale + "px";
  img.style.left = (w - crop.im.width * scale) / 2 + crop.x * w + "px";
  img.style.top = (h - crop.im.height * scale) / 2 + crop.y * h + "px";
  document.querySelector("#zoom-value").value =
    Math.round(crop.zoom * 100) + "%";
}
document.querySelector("#zoom").oninput = (e) => {
  crop.zoom = +e.target.value;
  paintCrop();
};
document.querySelector("#reset-crop").onclick = () => {
  crop.zoom = 1;
  crop.x = crop.y = 0;
  document.querySelector("#zoom").value = 1;
  paintCrop();
};
document.querySelector("#replace-image").onclick = () =>
  pickImage(uploadTarget);
const stage = document.querySelector("#crop-stage");
stage.onpointerdown = (e) => {
  drag = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y };
  stage.setPointerCapture(e.pointerId);
};
stage.onpointermove = (e) => {
  if (!drag) return;
  crop.x = drag.cx + (e.clientX - drag.x) / stage.clientWidth;
  crop.y = drag.cy + (e.clientY - drag.y) / stage.clientHeight;
  paintCrop();
};
stage.onpointerup = stage.onpointercancel = () => (drag = null);
stage.onkeydown = (e) => {
  const directions = {
    ArrowLeft: [-0.01, 0],
    ArrowRight: [0.01, 0],
    ArrowUp: [0, -0.01],
    ArrowDown: [0, 0.01],
  };
  if (directions[e.key]) {
    e.preventDefault();
    crop.x += directions[e.key][0];
    crop.y += directions[e.key][1];
    paintCrop();
  }
};
window.addEventListener("resize", () => {
  if (dialog.open && crop) paintCrop();
});
document.querySelector("#apply-crop").onclick = () => {
  const { im, ...saved } = crop;
  if (uploadTarget === "avatar") {
    if (saved.animated) {
      profileDraft.avatar = saved.source;
    } else {
      const c = document.createElement("canvas");
      c.width = c.height = 600;
      const ctx = c.getContext("2d"),
        scale = Math.max(600 / im.width, 600 / im.height) * crop.zoom;
      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, 600, 600);
      ctx.drawImage(
        im,
        (600 - im.width * scale) / 2 + crop.x * 600,
        (600 - im.height * scale) / 2 + crop.y * 600,
        im.width * scale,
        im.height * scale,
      );
      profileDraft.avatar = c.toDataURL("image/png");
    }
    document.querySelector(".avatar-button").innerHTML =
      avatarMarkup(profileDraft);
  } else {
    const old = draft.slots[uploadTarget] || {};
    draft.slots[uploadTarget] = {
      ...saved,
      info: old.info || "",
      sections: old.sections,
      link: old.link || "",
    };
    refreshGrid();
  }
  dirty = true;
  dialog.close();
};
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#/"]');
  if (a && dirty && !confirm("Discard unsaved changes?")) e.preventDefault();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("hashchange", () => {
  closeDescription();
  render();
});
init();
function positionSpeechbox(box) {
  const tile = box.closest(".tile");
  if (!tile) return;
  const rect = tile.getBoundingClientRect(),
    leftSide =
      tile.classList.contains("tip-left") || box.classList.contains("on-left");
  const narrow = innerWidth <= 620;
  const desired = leftSide ? rect.left - box.offsetWidth - 12 : rect.right + 12;
  const x = Math.max(
    12,
    Math.min(narrow ? rect.left : desired, innerWidth - box.offsetWidth - 12),
  );
  const y = Math.max(
    12,
    Math.min(
      narrow ? rect.bottom + 8 : rect.top,
      innerHeight - box.offsetHeight - 12,
    ),
  );
  box.style.position = "fixed";
  box.style.right = "auto";
  box.style.left = x + "px";
  box.style.top = y + "px";
  box.classList.toggle("edge-clamped", narrow || Math.abs(x - desired) > 1);
}
document.addEventListener("pointerover", (e) => {
  const tile = e.target.closest(".home-tile");
  if (tile) {
    const box = tile.querySelector(".info-box");
    if (box) positionSpeechbox(box);
  }
});
document.addEventListener("focusin", (e) => {
  const box =
    e.target.closest(".description-box") ||
    e.target.closest(".home-tile")?.querySelector(".info-box");
  if (box) positionSpeechbox(box);
});
window.addEventListener("resize", () =>
  document.querySelectorAll(".speechbox").forEach(positionSpeechbox),
);
window.addEventListener(
  "scroll",
  () => document.querySelectorAll(".speechbox").forEach(positionSpeechbox),
  true,
);

// Move the complete entry, including the original image, crop, description and link.
function moveEntry(items, from, to) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  )
    return false;
  items.splice(to, 0, items.splice(from, 1)[0]);
  return true;
}
function reorderItems(kind, from, to) {
  if (kind === "image") {
    if (!draft || !moveEntry(draft.slots, from, to)) return;
    closeDescription();
    dirty = true;
    refreshGrid();
    reorderPeers(kind)[to]?.focus();
    notify("Moved to position " + (to + 1) + ". Save to keep changes.");
  } else {
    if (!profileDraft) return;
    const peers = reorderPeers(kind);
    const fromCard = peers[from];
    const toCard = peers[to];
    if (!fromCard || !toCard) return;

    const fromId = fromCard.dataset.collectionId;
    const toId = toCard.dataset.collectionId;
    const fromIdx = profileDraft.collections.findIndex((c) => c.id === fromId);
    let toIdx = profileDraft.collections.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

    const targetGroupId = toCard.dataset.groupId || null;
    const [coll] = profileDraft.collections.splice(fromIdx, 1);
    if (targetGroupId) coll.groupId = targetGroupId;
    else delete coll.groupId;

    toIdx = profileDraft.collections.findIndex((c) => c.id === toId);
    const insertPos = fromIdx < toIdx ? toIdx + 1 : toIdx;
    profileDraft.collections.splice(insertPos, 0, coll);

    dirty = true;
    refreshCollections();
    const newPeers = reorderPeers(kind);
    const newIdx = newPeers.findIndex(
      (el) => el.dataset.collectionId === fromId,
    );
    if (newIdx >= 0) newPeers[newIdx].focus();
    notify("Moved grid. Save profile to keep changes.");
  }
}
function dropIntoEmptyGroup(fromPeerIndex, targetGroupId) {
  if (!profileDraft) return;
  const peers = reorderPeers("collection");
  const card = peers[fromPeerIndex];
  if (!card) return;
  const collId = card.dataset.collectionId;
  const collIdx = profileDraft.collections.findIndex((c) => c.id === collId);
  if (collIdx < 0) return;

  const [coll] = profileDraft.collections.splice(collIdx, 1);
  coll.groupId = targetGroupId;
  profileDraft.collections.push(coll);

  dirty = true;
  refreshCollections();
  notify("Moved grid to group. Save profile to keep changes.");
}
let reorderDrag = null,
  suppressReorderClick = false;
function reorderPeers(kind) {
  return [...document.querySelectorAll('[data-reorder="' + kind + '"]')];
}
// Gaps belong to the following slot in row-major order.
function insertionIndex(rects, x, y) {
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left)),
    right = Math.max(...rects.map((r) => r.right));
  if (
    x < left - 24 ||
    x > right + 24 ||
    y < rects[0].top - 24 ||
    y > rects.at(-1).bottom + 24
  )
    return null;
  let rowStart = 0;
  while (rowStart < rects.length) {
    let rowEnd = rowStart + 1;
    while (
      rowEnd < rects.length &&
      Math.abs(rects[rowEnd].top - rects[rowStart].top) < 4
    )
      rowEnd++;
    const bottom = Math.max(
      ...rects.slice(rowStart, rowEnd).map((r) => r.bottom),
    );
    if (y <= bottom || rowEnd === rects.length) {
      for (let i = rowStart; i < rowEnd; i++) if (x <= rects[i].right) return i;
      return rowEnd - 1;
    }
    rowStart = rowEnd;
  }
  return rects.length - 1;
}
function clearDragPreview(d) {
  d.peers.forEach((item) => {
    item.style.transform = "";
    item.classList.remove("drag-source", "drop-target");
  });
  document.querySelectorAll(".empty-group-target").forEach((t) => {
    t.classList.remove("drag-over");
  });
}
function finishReorder(commit) {
  const d = reorderDrag;
  if (!d) return;
  reorderDrag = null;
  clearDragPreview(d);
  document.body.classList.remove("reordering");
  if (app.hasPointerCapture?.(d.pointerId))
    app.releasePointerCapture(d.pointerId);
  if (d.active) {
    suppressReorderClick = true;
    setTimeout(() => (suppressReorderClick = false), 0);
    if (commit) {
      if (d.kind === "collection" && d.emptyGroupTarget) {
        dropIntoEmptyGroup(d.from, d.emptyGroupTarget);
      } else if (d.to !== null) {
        reorderItems(d.kind, d.from, d.to);
      }
    }
  }
}
app.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || dialog.open) return;
  const item = event.target.closest("[data-reorder]");
  if (
    !item ||
    event.target.closest(".description-box,input,textarea,select,button")
  )
    return;
  const kind = item.dataset.reorder,
    peers = reorderPeers(kind);
  reorderDrag = {
    kind,
    item,
    peers,
    from: peers.indexOf(item),
    to: null,
    emptyGroupTarget: null,
    x: event.clientX,
    y: event.clientY,
    pointerId: event.pointerId,
    active: false,
  };
});
app.addEventListener("pointermove", (event) => {
  const d = reorderDrag;
  if (!d || d.pointerId !== event.pointerId) return;
  if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 7)
    return;
  if (!d.active) {
    closeDescription();
    d.active = true;
    d.rects = d.peers.map((item) => item.getBoundingClientRect());
    d.scrollY = window.scrollY;
    app.setPointerCapture(event.pointerId);
    document.body.classList.add("reordering");
    d.item.classList.add("drag-source");
  }
  event.preventDefault();
  const scrollDelta = window.scrollY - d.scrollY;

  // Check if hovering over an empty group target
  const el = document.elementFromPoint(event.clientX, event.clientY);
  const emptyTarget = el?.closest("[data-group-drop]");
  document.querySelectorAll(".empty-group-target").forEach((t) => {
    t.classList.toggle("drag-over", t === emptyTarget);
  });
  d.emptyGroupTarget = emptyTarget ? emptyTarget.dataset.groupDrop : null;

  d.to = insertionIndex(d.rects, event.clientX, event.clientY + scrollDelta);
  const order = d.peers.map((_, i) => i);
  if (d.to !== null) moveEntry(order, d.from, d.to);
  d.peers.forEach((item, i) => {
    if (i === d.from) {
      item.style.transform =
        "translate(" +
        (event.clientX - d.x) +
        "px," +
        (event.clientY - d.y + scrollDelta) +
        "px)";
    } else {
      const target = d.rects[order.indexOf(i)],
        original = d.rects[i];
      item.style.transform =
        "translate(" +
        (target.left - original.left) +
        "px," +
        (target.top - original.top) +
        "px)";
    }
  });
  if (event.clientY < 60) window.scrollBy(0, -12);
  else if (event.clientY > innerHeight - 60) window.scrollBy(0, 12);
});
window.addEventListener("pointerup", () => finishReorder(true));
window.addEventListener("pointercancel", () => finishReorder(false));
window.addEventListener("blur", () => finishReorder(false));
app.addEventListener("dragstart", (e) => {
  if (e.target.closest("[data-reorder]")) e.preventDefault();
});
document.addEventListener(
  "click",
  (event) => {
    if (suppressReorderClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
app.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && reorderDrag) {
    event.preventDefault();
    finishReorder(false);
    return;
  }
  if (event.target.closest("button,input,textarea,select,a")) return;
  const item = event.target.closest("[data-reorder]");
  if (!item) return;
  const kind = item.dataset.reorder,
    peers = reorderPeers(kind),
    from = peers.indexOf(item);
  const columns =
    kind === "image"
      ? gridSize(draft).columns
      : (profileDraft || state).columns || 2;
  const delta = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -columns,
    ArrowDown: columns,
  }[event.key];
  if (delta !== undefined) {
    event.preventDefault();
    const to = from + delta;
    if (to >= 0 && to < peers.length) reorderItems(kind, from, to);
  }
});

document.addEventListener("click", (e) => {
  const deleteGridBtn = e.target.closest("[data-delete-grid]");
  if (deleteGridBtn) {
    e.preventDefault();
    e.stopPropagation();
    const id = deleteGridBtn.dataset.deleteGrid;
    const coll = profileDraft?.collections?.find((c) => c.id === id);
    if (!coll) return;
    if (!confirm(`Delete "${coll.title || "this grid"}"?`)) return;
    profileDraft.collections = profileDraft.collections.filter(
      (c) => c.id !== id,
    );
    dirty = true;
    refreshCollections();
    notify("Grid deleted. Save profile to keep changes.");
    return;
  }
  const deleteGroupBtn = e.target.closest("[data-delete-group]");
  if (deleteGroupBtn) {
    e.preventDefault();
    e.stopPropagation();
    const groupId = deleteGroupBtn.dataset.deleteGroup;
    const group = profileDraft?.groups?.find((g) => g.id === groupId);
    if (!group) return;
    if (
      !confirm(
        `Delete group "${group.title || "Untitled"}"? Grids in this group will remain.`,
      )
    )
      return;
    profileDraft.groups = (profileDraft.groups || []).filter(
      (g) => g.id !== groupId,
    );
    profileDraft.collections.forEach((c) => {
      if (c.groupId === groupId) delete c.groupId;
    });
    dirty = true;
    refreshCollections();
    notify("Group removed. Save profile to keep changes.");
    return;
  }
});

document.addEventListener("input", (e) => {
  const groupTitleInput = e.target.closest("[data-group-title]");
  if (groupTitleInput) {
    const groupId = groupTitleInput.dataset.groupTitle;
    const group = profileDraft?.groups?.find((g) => g.id === groupId);
    if (group) {
      group.title = groupTitleInput.value;
      dirty = true;
    }
  }
});
