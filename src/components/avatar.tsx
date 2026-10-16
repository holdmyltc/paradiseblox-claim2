"use client";
import { useEffect, useRef, useState } from "react";

/** A Roblox avatar that falls back to the first letter if the picture is missing or fails to load. */
export function Avatar({ src, name, className, fallbackClassName }: { src?: string | null; name: string; className?: string; fallbackClassName: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { setFailed(false); }, [src]);
  // The picture can fail before the page is interactive, when onError has not been attached yet.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (src && !failed) return <img ref={ref} className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  return <span className={fallbackClassName} aria-hidden="true">{(name || "?").slice(0, 1).toUpperCase()}</span>;
}
