"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";

export type PanelTabItem = { id: string; label: string };

type Props = {
  tabs: PanelTabItem[];
  selected: string;
  onSelect: (id: string) => void;
  label: string;
};

export function tabId(id: string) {
  return `agent-tab-${id}`;
}

export function tabPanelId(id: string) {
  return `agent-tabpanel-${id}`;
}

/** A tab list with roving focus: Left/Right move between tabs (wrapping), Home and End jump to the ends. */
export default function AgentPanelTabs({ tabs, selected, onSelect, label }: Props) {
  const list = useRef<HTMLDivElement>(null);

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === -1) return;
    event.preventDefault();
    // Selection follows focus: the panels are already rendered data, so switching is instant.
    onSelect(tabs[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return <div ref={list} className="agent-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => {
      const active = tab.id === selected;
      let tabIndex = -1;
      if (active) tabIndex = 0;
      return <button key={tab.id} type="button" role="tab" id={tabId(tab.id)} aria-selected={active} aria-controls={tabPanelId(tab.id)}
        tabIndex={tabIndex} onClick={() => onSelect(tab.id)} onKeyDown={(event) => move(event, index)}>{tab.label}</button>;
    })}
  </div>;
}
