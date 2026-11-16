"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "@/common/components";
import type { CatalogueType, Screenshot } from "../data.ts";
import { wrapIndex } from "../services/details.ts";
import CatalogueImage from "./CatalogueImage";

type Props = { name: string; type: CatalogueType; screenshots: Screenshot[] };

/**
 * Preview images, one at a time. Previous/next wrap around, the dots jump to an
 * image, and the arrow keys move while focus is anywhere in the carousel. It never
 * moves on its own. A missing image shows the cards' neutral tile.
 */
export default function Carousel({ name, type, screenshots }: Props) {
  const [index, setIndex] = useState(0);
  const count = screenshots.length;

  if (count === 0) {
    return <CatalogueImage src="" alt="" name={name} type={type} frame="screenshot" />;
  }

  function move(step: number) {
    setIndex(wrapIndex(index, step, count));
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
  }

  const shot = screenshots[index];
  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={`${name} previews`} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="carousel-stage">
        <div role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
          {/* A new key per image resets the fallback, so one missing image doesn't hide the rest. */}
          <CatalogueImage key={shot.src} src={shot.src} alt={shot.alt} name={name} type={type} frame="screenshot" />
        </div>
        <button type="button" className="carousel-arrow carousel-previous" aria-label="Previous image" onClick={() => move(-1)}><Icon name="arrow" /></button>
        <button type="button" className="carousel-arrow carousel-next" aria-label="Next image" onClick={() => move(1)}><Icon name="arrow" /></button>
      </div>
      <div className="carousel-controls">
        <div className="carousel-dots">
          {screenshots.map((screenshot, position) => {
            let current: "true" | undefined;
            if (position === index) current = "true";
            return <button key={screenshot.src} type="button" className="carousel-dot" aria-label={`Show image ${position + 1} of ${count}`} aria-current={current} onClick={() => setIndex(position)} />;
          })}
        </div>
        <p className="carousel-counter" aria-live="polite">{index + 1} / {count}</p>
      </div>
    </section>
  );
}
