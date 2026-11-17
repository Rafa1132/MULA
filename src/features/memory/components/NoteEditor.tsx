"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Draft, GraphNode, completeLink, linkQuery, matchTitles } from "../services/notes";

type Props = {
  initial: Draft;
  isNew: boolean;
  nodes: GraphNode[];
  folders: string[];
  busy: boolean;
  // Set when the note changed in another tab since this editor opened.
  conflict: boolean;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  onReload: () => void;
  // Start with the caret in the text (a note just named in the tree), rather than on the page.
  focusText?: boolean;
};

type Suggestions = { start: number; options: string[]; active: number };
const LIST_ID = "note-link-suggestions";

/**
 * A plain Markdown editor. Typing `[[` lists note titles; Up and Down choose, Enter or Tab
 * insert, Escape closes. The text is saved through the memory pipeline, as a new version.
 */
export default function NoteEditor({ initial, isNew, nodes, folders, busy, conflict, onSave, onCancel, onReload, focusText = false }: Props) {
  const [draft, setDraft] = useState(initial);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Once, when the editor is usable: it opens while the save that created the note is finishing.
  const focused = useRef(false);
  useEffect(() => {
    if (!focusText || busy || focused.current) return;
    focused.current = true;
    textarea.current?.focus();
  }, [focusText, busy]);

  function suggest(text: string, caret: number) {
    const open = linkQuery(text, caret);
    if (open === null) {
      setSuggestions(null);
      return;
    }
    const options = matchTitles(nodes, open.query);
    if (options.length === 0) {
      setSuggestions(null);
      return;
    }
    setSuggestions({ start: open.start, options, active: 0 });
  }

  function accept(title: string) {
    const element = textarea.current;
    if (!element || !suggestions) return;
    const result = completeLink(draft.text, suggestions.start, element.selectionStart, title);
    setDraft({ ...draft, text: result.text });
    setSuggestions(null);
    // Put the caret after the inserted link once React has written the new text.
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(result.caret, result.caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggestions) return;
    const count = suggestions.options.length;
    if (event.key === "ArrowDown") {
      setSuggestions({ ...suggestions, active: (suggestions.active + 1) % count });
    } else if (event.key === "ArrowUp") {
      setSuggestions({ ...suggestions, active: (suggestions.active - 1 + count) % count });
    } else if (event.key === "Enter" || event.key === "Tab") {
      accept(suggestions.options[suggestions.active]);
    } else if (event.key === "Escape") {
      setSuggestions(null);
    } else {
      return;
    }
    event.preventDefault();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(draft);
  }

  let activeId: string | undefined;
  if (suggestions) activeId = `${LIST_ID}-${suggestions.active}`;
  let heading = `Edit ${initial.title}`;
  if (isNew) heading = "New note";

  return <form className="note-editor" onSubmit={submit} aria-labelledby="note-editor-title">
    <h2 id="note-editor-title">{heading}</h2>
    {conflict && <div className="note-conflict" role="alert">
      <p>This note changed in another tab or window since you opened it. Saving now would replace that newer version, so it was not saved.</p>
      <button type="button" className="account-toggle" onClick={onReload} disabled={busy}>Load the newer version</button>
    </div>}
    <div className="note-editor-fields">
      <label htmlFor="note-title-input">Title</label>
      <input id="note-title-input" value={draft.title} maxLength={120} required disabled={busy}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <label htmlFor="note-folder-input">Folder</label>
      <input id="note-folder-input" value={draft.folder} list="note-folders" placeholder="suppliers" disabled={busy}
        onChange={(event) => setDraft({ ...draft, folder: event.target.value })} aria-describedby="note-folder-help" />
      <datalist id="note-folders">{folders.map((folder) => <option key={folder} value={folder} />)}</datalist>
      <p id="note-folder-help" className="memory-help">Use / for subfolders, like people/staff. Leave empty for the top level.</p>
    </div>
    <label htmlFor="note-text-input">Text</label>
    <p id="note-text-help" className="memory-help">Markdown. Type [[ to link a note and #word for a tag. Optional properties go first, between two --- lines.</p>
    <div className="note-text-wrap">
      <textarea id="note-text-input" ref={textarea} value={draft.text} rows={16} maxLength={20000} disabled={busy}
        aria-describedby="note-text-help" aria-autocomplete="list" aria-controls={LIST_ID} aria-expanded={suggestions !== null}
        aria-activedescendant={activeId}
        onChange={(event) => { setDraft({ ...draft, text: event.target.value }); suggest(event.target.value, event.target.selectionStart); }}
        onKeyDown={onKeyDown}
        onClick={(event) => suggest(event.currentTarget.value, event.currentTarget.selectionStart)}
        onBlur={() => setSuggestions(null)} />
      <ul id={LIST_ID} role="listbox" aria-label="Notes to link" className="note-suggestions" hidden={suggestions === null}>
        {suggestions?.options.map((title, index) => <li key={title} id={`${LIST_ID}-${index}`} role="option" aria-selected={index === suggestions.active}
          // Mouse down, not click: a click would blur the textarea and close the list first.
          onMouseDown={(event) => { event.preventDefault(); accept(title); }}>{title}</li>)}
      </ul>
    </div>
    <div className="note-editor-actions">
      <button type="button" className="account-toggle" onClick={onCancel} disabled={busy}>Cancel</button>
      <button className="account-submit" disabled={busy || !draft.title.trim()}>Save note</button>
    </div>
  </form>;
}
