// Grid geometry is shared by the editor, public profile, and PNG exporter.
function gridSize(collection) {
  return {
    columns: Math.max(1, Math.min(5, Number(collection?.gridColumns) || 3)),
    rows: Math.max(1, Math.min(5, Number(collection?.gridRows) || 3)),
  };
}
function gridRatio(collection) {
  const { columns, rows } = gridSize(collection);
  return (ratio(collection) * columns) / rows;
}
function gridSlots(collection) {
  const { columns, rows } = gridSize(collection);
  return Array.from(
    { length: columns * rows },
    (_, i) => collection.slots[i] || null,
  );
}
function resizeGrid(collection, columns, rows) {
  const next = structuredClone(collection);
  // Preserve row-major order. Keep overflow until the editor is saved so shrinking
  // and expanding during the same edit never silently loses an image.
  next.gridColumns = columns;
  next.gridRows = rows;
  while (next.slots.length < columns * rows) next.slots.push(null);
  return next;
}
function infoSections(slot) {
  if (Array.isArray(slot?.sections)) return slot.sections;
  return [{ title: "Info", text: slot?.info || "" }];
}
function infoMarkup(slot) {
  return infoSections(slot)
    .map(
      (section) => `
    <section class="info-section">
      <h3>${esc(section.title || "Info")}</h3>
      <div>${esc(section.text || "")}</div>
    </section>
  `,
    )
    .join("");
}
function avatarSource(profile) {
  return profile.avatar && !/^(\/?assets\/avatar\.png)$/.test(profile.avatar)
    ? profile.avatar
    : "";
}
function avatarMarkup(profile) {
  const source = avatarSource(profile);
  return source
    ? `<img class="avatar" src="${esc(source)}" alt="Profile picture">`
    : '<div class="avatar blank-avatar" role="img" aria-label="No profile picture"></div>';
}
function renderSizePicker() {
  const { columns, rows } = gridSize(draft);
  return `
    <details class="size-picker">
      <summary>Grid size <span id="size-label">${columns} × ${rows}</span></summary>
      <div class="size-panel">
        <div class="size-squares" aria-label="Choose columns by rows">
          ${Array.from({ length: 25 }, (_, i) => {
            const x = (i % 5) + 1,
              y = Math.floor(i / 5) + 1;
            return `<button type="button" data-size-x="${x}" data-size-y="${y}"
              aria-label="${x} columns by ${y} rows"
              class="${x <= columns && y <= rows ? "selected" : ""}"></button>`;
          }).join("")}
        </div>
        <output id="size-preview">${columns} columns × ${rows} rows</output>
      </div>
    </details>`;
}
function bindSizePicker() {
  const buttons = [...document.querySelectorAll("[data-size-x]")];
  function highlight(x, y) {
    buttons.forEach((button) =>
      button.classList.toggle(
        "selected",
        +button.dataset.sizeX <= x && +button.dataset.sizeY <= y,
      ),
    );
    document.querySelector("#size-preview").textContent =
      `${x} columns × ${y} rows`;
  }
  buttons.forEach((button) => {
    const x = +button.dataset.sizeX,
      y = +button.dataset.sizeY;
    button.onpointerenter = button.onfocus = () => highlight(x, y);
    button.onclick = () => {
      draft = resizeGrid(draft, x, y);
      dirty = true;
      document.querySelector("#size-label").textContent = `${x} × ${y}`;
      document.querySelector(".size-picker").open = false;
      refreshGrid();
    };
    button.onkeydown = (event) => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 }[
        event.key
      ];
      if (delta !== undefined) {
        event.preventDefault();
        buttons[
          Math.max(0, Math.min(24, buttons.indexOf(button) + delta))
        ].focus();
      }
    };
  });
}
