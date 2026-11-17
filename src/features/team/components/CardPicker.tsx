"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "@/common/components";

export type PickerItem = { id: string; title: string; description: string; visual: ReactNode };

type Props = {
  // The "+" card's text, such as "Add tool".
  label: string;
  // Names the open picker, such as "Tools you can add".
  pickerLabel: string;
  items: PickerItem[];
  // Accessible name of each item's + button, such as "Add Moving average tool".
  addLabel: (item: PickerItem) => string;
  onAdd: (id: string) => void;
  emptyText: string;
  disabled?: boolean;
  // Shown under the card when it is disabled, for example the tool limit.
  disabledReason?: string;
};

/**
 * An "Add …" card that opens a list of cards to choose from. Escape or the close button shuts it and
 * returns focus to the "+" card; choosing an item closes it too, and the caller moves focus to the new card.
 */
export default function CardPicker({ label, pickerLabel, items, addLabel, onAdd, emptyText, disabled = false, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const pickerId = `picker-${label.toLowerCase().replace(/\W+/g, "-")}`;

  function close() {
    setOpen(false);
    opener.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    // Without this, Escape would also close the settings dialog around the picker.
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function choose(id: string) {
    setOpen(false);
    onAdd(id);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Focus the first choice so keyboard users land inside the list.
    if (next) requestAnimationFrame(() => region.current?.querySelector<HTMLButtonElement>(".picker-add")?.focus());
  }

  return <div className="card-picker">
    <button ref={opener} type="button" className="panel-card panel-add-card" aria-expanded={open} aria-controls={pickerId} disabled={disabled} onClick={toggle}>
      <span className="panel-card-icon" aria-hidden="true"><Icon name="plus" /></span>
      <span>{label}</span>
    </button>
    {disabled && disabledReason && <p className="settings-help">{disabledReason}</p>}
    <div ref={region} id={pickerId} className="picker" role="group" aria-label={pickerLabel} hidden={!open} onKeyDown={onKeyDown}>
      <div className="picker-heading"><strong>{pickerLabel}</strong><button type="button" className="icon-button picker-close" aria-label={`Close ${pickerLabel.toLowerCase()}`} onClick={close}><span aria-hidden="true">×</span></button></div>
      {items.length === 0 && <p className="settings-help">{emptyText}</p>}
      {items.length > 0 && <ul className="panel-card-list">{items.map((item) =>
        <li key={item.id} className="panel-card">
          {item.visual}
          <span className="panel-card-text"><strong>{item.title}</strong><span>{item.description}</span></span>
          <button type="button" className="icon-button picker-add" aria-label={addLabel(item)} onClick={() => choose(item.id)}><Icon name="plus" /></button>
        </li>)}</ul>}
    </div>
  </div>;
}
