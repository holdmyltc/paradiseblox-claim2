"use client";

/** Largest side of an uploaded screenshot. Bigger images are scaled down so they upload fast. */
const MAX_SIDE = 2400;
const MAX_BYTES = 8 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

/**
 * Turns any picked or pasted image into a PNG or JPG under 8 MB that our
 * storage accepts. Screenshots that are already fine are sent untouched.
 */
export async function prepareImage(file: File): Promise<File> {
  const okType = file.type === "image/png" || file.type === "image/jpeg";
  if (!file.type.startsWith("image/") && file.type !== "") throw new Error(`${file.name || "That file"} isn't an image. Only screenshots can be sent.`);
  let img: HTMLImageElement;
  try { img = await loadImage(file); } catch {
    throw new Error(`${file.name || "That image"} can't be opened. Take a screenshot instead and send that.`);
  }
  const big = Math.max(img.naturalWidth, img.naturalHeight) > MAX_SIDE;
  if (okType && !big && file.size <= MAX_BYTES) return file;

  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare that image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.9, 0.8, 0.7, 0.55]) {
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) {
      const base = (file.name || "screenshot").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    }
  }
  throw new Error(`${file.name || "That image"} is too large to send.`);
}

/** Images from a file picker or a drag and drop. */
export function imagesFromFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list || []).filter((f) => f.type.startsWith("image/"));
}

/** Images from a paste (copying a screenshot and pressing paste). */
export function imagesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items || [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (!f || !f.type.startsWith("image/")) continue;
    out.push(f.name && f.name !== "image.png" ? f : new File([f], `pasted-${Date.now()}-${out.length + 1}.${f.type === "image/jpeg" ? "jpg" : "png"}`, { type: f.type }));
  }
  if (!out.length) out.push(...imagesFromFiles(data.files));
  return out;
}
