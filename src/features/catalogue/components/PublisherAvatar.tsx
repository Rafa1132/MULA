"use client";

import { useEffect, useRef, useState } from "react";
import type { Publisher } from "../data.ts";

type Props = { publisher: Publisher; size: 16 | 32 };

/**
 * The publisher's square avatar. Its name is always written next to it, so the image
 * is decorative (empty alt). A missing or broken image becomes a small initial tile.
 */
export default function PublisherAvatar({ publisher, size }: Props) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(publisher.avatar.trim() === "");

  useEffect(() => {
    // An image that fails before React attaches onError is caught here instead.
    const element = image.current;
    if (element && element.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return <span className={`publisher-avatar publisher-avatar-${size} publisher-avatar-fallback`} aria-hidden="true">{publisher.name.slice(0, 1).toUpperCase()}</span>;
  }
  return <img ref={image} className={`publisher-avatar publisher-avatar-${size}`} src={publisher.avatar} alt="" width={size} height={size} decoding="async" onError={() => setFailed(true)} />;
}
