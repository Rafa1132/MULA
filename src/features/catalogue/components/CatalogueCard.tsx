"use client";

import { Icon } from "@/common/components";
import type { CatalogueEntry, CatalogueStatus } from "../data.ts";
import { publisherFor } from "../services/publishers.ts";
import CatalogueImage from "./CatalogueImage";
import PublisherAvatar from "./PublisherAvatar";

const STATUS_LABELS: Record<CatalogueStatus, string> = { available: "Available", added: "Added", coming_soon: "Coming soon" };

type Props = {
  entry: CatalogueEntry;
  onAdd: (entry: CatalogueEntry) => void;
  onOpenWithoutPage: (entry: CatalogueEntry) => void;
};

type CardProps = Props & {
  /** Why a search shows this card when one of its plugins matched, such as "Includes Store monitor". */
  hint?: string;
};

/** The card's one action: Add, Open, or a disabled Add for entries that are not ready. */
function CardAction({ entry, onAdd, onOpenWithoutPage }: Props) {
  // Every card has the same verbs, so the accessible name carries the entry's name too.
  if (entry.status === "coming_soon") {
    return <button type="button" className="catalogue-action" disabled aria-label={`Add ${entry.name} (coming soon)`}>Add</button>;
  }
  if (entry.status === "available") {
    return <button type="button" className="catalogue-action catalogue-action-primary" aria-label={`Add ${entry.name}`} onClick={() => onAdd(entry)}>Add</button>;
  }
  if (entry.href) {
    return <a className="catalogue-action" href={entry.href} aria-label={`Open ${entry.name}`}>Open</a>;
  }
  return <button type="button" className="catalogue-action" aria-label={`Open ${entry.name}`} onClick={() => onOpenWithoutPage(entry)}>Open</button>;
}

/** A picture-first card: the artwork takes most of the space, with a short caption row below.
 * Clicking the card (or Enter on its name) opens /catalogue/<id>; the action button does not. */
export default function CatalogueCard({ entry, hint, onAdd, onOpenWithoutPage }: CardProps) {
  const headingId = `catalogue-${entry.id}`;
  let typeLabel = "App";
  if (entry.type === "agent") typeLabel = "Agent";
  const publisher = publisherFor(entry);
  return (
    <li className={`catalogue-card catalogue-card-${entry.type}`}>
      <article aria-labelledby={headingId}>
        <div className="catalogue-media">
          <CatalogueImage src={entry.image} alt={entry.imageAlt} name={entry.name} type={entry.type} />
          <span className="catalogue-status" data-status={entry.status}>{STATUS_LABELS[entry.status]}</span>
        </div>
        <div className="catalogue-caption">
          <div className="catalogue-text">
            <div className="catalogue-title">
              {/* The name is the link to the detail page; CSS stretches its click area over
                  the whole card. The action button is a sibling above that area, so it
                  keeps its own action and the two never nest. */}
              <h3 id={headingId}><a className="catalogue-card-link" href={`/catalogue/${entry.id}`}>{entry.name}</a></h3>
              {/* The type is text with its own icon, so it never depends on the image or on colour. */}
              <span className={`catalogue-type catalogue-type-${entry.type}`}><Icon name={entry.type} />{typeLabel}</span>
            </div>
            {/* Plain text for now: there is no publisher profile page yet. */}
            <p className="catalogue-publisher"><PublisherAvatar publisher={publisher} size={16} />by {publisher.name}</p>
            <p className="catalogue-description" title={entry.description}>{entry.description}</p>
            {hint && <p className="catalogue-hint"><Icon name="app" />{hint}</p>}
          </div>
          <CardAction entry={entry} onAdd={onAdd} onOpenWithoutPage={onOpenWithoutPage} />
        </div>
      </article>
    </li>
  );
}
