"use client";

// The empty conversation: one line and a few starting points. Picking one puts its text in the
// field to edit or send; nothing is sent on its own.
export type Suggestion = { title: string; text: string };

export default function ChatSuggestions({ intro, items, onPick, disabled = false }: { intro: string; items: Suggestion[]; onPick: (text: string) => void; disabled?: boolean }) {
  return <>
    <p>{intro}</p>
    <div className="suggestions">
      {items.map((item) => <button key={item.title} type="button" className="suggestion" onClick={() => onPick(item.text)} disabled={disabled}>{item.title}</button>)}
    </div>
  </>;
}
