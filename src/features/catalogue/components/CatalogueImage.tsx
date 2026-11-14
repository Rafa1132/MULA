"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogueType } from "../data.ts";

type Props = { src: string; alt: string; name: string; type: CatalogueType };

/**
 * The card artwork in its type's frame: a rounded portrait for agents, a square
 * tile for apps. The frame's shape, not the picture, carries the type, so a
 * missing picture still shows which kind of entry this is.
 *
 * The app has no image pipeline (no next/image anywhere), so this is a plain
 * <img>. The frame fixes the aspect ratio and the image covers it, so artwork of
 * any size keeps the grid even.
 */
export default function CatalogueImage({ src, alt, name, type }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(src.trim() === "");

  useEffect(() => {
    // An image that fails before React attaches its handlers never fires onError
    // for React, so check once after mounting as well.
    const element = image.current;
    if (element && element.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  let content;
  if (failed) {
    // A neutral tile with the initial, so a card never looks broken. The name is
    // already the card's heading, so the tile itself is decorative.
    content = <span className="catalogue-fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>;
  } else {
    content = <img ref={image} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  }
  return <div className={`catalogue-frame catalogue-frame-${type}`}>{content}</div>;
}
