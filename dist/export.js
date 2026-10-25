// Canvas exports use the saved data, never interface controls or hover overlays.
function exportFilename(name) {
  return (
    (name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .trim()
      .slice(0, 120) || "3x3") + ".png"
  );
}
function exportSurface(width, height) {
  const scale = Math.min(
    1,
    16000 / width,
    16000 / height,
    Math.sqrt(24000000 / (width * height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}
function exportLines(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text || "").split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
function fitExportGrid(r, width, height) {
  const w = Math.min(width, height * r);
  return { width: w, height: w / r };
}
function exportImageSource(slot) {
  return slot?.width && slot?.height
    ? slot.source
    : slot?.preview || slot?.source;
}
function paintExportImage(ctx, img, x, y, w, h, slot = {}) {
  const scale =
    Math.max(w / img.naturalWidth, h / img.naturalHeight) *
    (slot.width ? slot.zoom || 1 : 1);
  const iw = img.naturalWidth * scale,
    ih = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(
    img,
    x + (w - iw) / 2 + (slot.width ? slot.x || 0 : 0) * w,
    y + (h - ih) / 2 + (slot.width ? slot.y || 0 : 0) * h,
    iw,
    ih,
  );
  ctx.restore();
}
function exportLoader() {
  const cache = new Map();
  return (src) => {
    if (!cache.has(src)) cache.set(src, loadImage(src));
    return cache.get(src);
  };
}
async function paintExportGrid(ctx, collection, x, y, width, height, load) {
  const border = collection.borders === false ? 0 : Math.max(1.5, width / 300);
  ctx.fillStyle = border ? "#eee" : "#101010";
  ctx.fillRect(x, y, width, height);
  const { columns, rows } = gridSize(collection);
  const w = (width - (columns + 1) * border) / columns,
    h = (height - (rows + 1) * border) / rows;
  const images = await Promise.all(
    gridSlots(collection).map((slot) =>
      exportImageSource(slot) ? load(exportImageSource(slot)) : null,
    ),
  );
  for (let i = 0; i < columns * rows; i++) {
    const tx = x + border + (i % columns) * (w + border),
      ty = y + border + Math.floor(i / columns) * (h + border);
    ctx.fillStyle = "#101010";
    ctx.fillRect(tx, ty, w, h);
    if (images[i])
      paintExportImage(ctx, images[i], tx, ty, w, h, collection.slots[i]);
    else {
      ctx.fillStyle = "#666";
      ctx.font = `${Math.max(10, width / 44)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1).padStart(2, "0"), tx + w / 2, ty + h / 2);
    }
  }
}
async function exportCollection(profile, collection) {
  const load = exportLoader();
  const size = fitExportGrid(gridRatio(collection), 1500, 1800);
  const fontSize = Math.max(32, Math.min(72, size.width / 16));
  const padding = Math.min(40, size.width / 12);
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "bold " + fontSize + "px Arial";
  const lines = exportLines(
    measure,
    collection.title,
    size.width - padding * 2,
  );
  const lineHeight = fontSize * 1.15;
  const captionHeight = padding * 2 + lines.length * lineHeight + 36;
  const { canvas, ctx } = exportSurface(
    size.width,
    size.height + captionHeight,
  );
  await paintExportGrid(ctx, collection, 0, 0, size.width, size.height, load);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, size.height, size.width, captionHeight);
  ctx.fillStyle = "#eee";
  ctx.font = "bold " + fontSize + "px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  lines.forEach((line, i) =>
    ctx.fillText(line, padding, size.height + padding + i * lineHeight),
  );
  ctx.font = "22px Arial";
  ctx.fillStyle = "#aaa";
  ctx.fillText(
    profile.name + " / 3x3site",
    padding,
    size.height + padding + lines.length * lineHeight + 12,
  );
  return canvas;
}
async function exportProfile(profile) {
  const columns = [2, 3, 4].includes(profile.columns) ? profile.columns : 2,
    width = 1600,
    pad = 64,
    gap = 36,
    card = (width - pad * 2 - gap * (columns - 1)) / columns;
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = "bold 48px Arial";
  const nameLines = exportLines(measure, profile.name, width - pad * 2);
  measure.font = "24px Arial";
  const bioLines = exportLines(measure, profile.bio, 1050);
  const nameTop = pad + 180 + 26,
    bioTop = nameTop + nameLines.length * 58 + 14,
    ruleY = bioTop + bioLines.length * 34 + 40,
    startY = ruleY + 60;
  measure.font = "bold 28px Arial";
  const titleLines = profile.collections.map((c) =>
    exportLines(measure, c.title, card),
  );
  const rows = [];
  for (let i = 0; i < profile.collections.length; i += columns)
    rows.push(
      card +
        24 +
        Math.max(...titleLines.slice(i, i + columns).map((l) => l.length)) *
          34 +
        46,
    );
  const height = startY + rows.reduce((a, b) => a + b, 0) + pad;
  const { canvas, ctx } = exportSurface(width, height),
    load = exportLoader();
  const avatar = avatarSource(profile)
    ? await load(avatarSource(profile))
    : null;
  ctx.save();
  if (avatar) paintExportImage(ctx, avatar, (width - 180) / 2, pad, 180, 180);
  ctx.restore();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;
  ctx.strokeRect((width - 180) / 2, pad, 180, 180);
  ctx.fillStyle = "#eee";
  ctx.font = "bold 48px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  nameLines.forEach((line, i) =>
    ctx.fillText(line, width / 2, nameTop + i * 58),
  );
  ctx.font = "24px Arial";
  bioLines.forEach((line, i) => ctx.fillText(line, width / 2, bioTop + i * 34));
  ctx.strokeStyle = "#777";
  ctx.beginPath();
  ctx.moveTo(pad, ruleY);
  ctx.lineTo(width - pad, ruleY);
  ctx.stroke();
  ctx.fillStyle = "#aaa";
  ctx.font = "18px monospace";
  ctx.textAlign = "left";
  ctx.fillText(
    `Collections / ${String(profile.collections.length).padStart(2, "0")}`,
    pad,
    ruleY + 18,
  );
  let y = startY;
  for (let i = 0; i < profile.collections.length; i++) {
    const col = i % columns;
    if (col === 0 && i) y += rows[Math.floor(i / columns) - 1];
    const x = pad + col * (card + gap),
      c = profile.collections[i],
      size = fitExportGrid(gridRatio(c), card, card);
    await paintExportGrid(
      ctx,
      c,
      x + (card - size.width) / 2,
      y + (card - size.height) / 2,
      size.width,
      size.height,
      load,
    );
    ctx.fillStyle = "#eee";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    titleLines[i].forEach((line, j) =>
      ctx.fillText(line, x, y + card + 20 + j * 34),
    );
  }
  return canvas;
}
function saveExport(canvas, filename) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(Error("Image could not be created"));
        return;
      }
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      resolve();
    }, "image/png"),
  );
}
app.addEventListener("click", async (e) => {
  const button = e.target.closest(
    "[data-download-grid],[data-download-profile]",
  );
  if (!button || button.disabled) return;
  e.preventDefault();
  e.stopPropagation();
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const profile = structuredClone(state),
      collection = profile.collections.find(
        (c) => c.id === button.dataset.downloadGrid,
      );
    const canvas = collection
      ? await exportCollection(profile, collection)
      : await exportProfile(profile);
    await saveExport(
      canvas,
      exportFilename(
        collection
          ? `${profile.name}'s ${collection.title}`
          : profile.name + " - 3x3",
      ),
    );
    notify("PNG downloaded.");
  } catch (error) {
    console.error("Image export failed", error);
    notify("Could not export the image. Please try again.");
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
