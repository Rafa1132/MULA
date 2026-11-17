"use client";

import { KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { FACTS_FOLDER, TreeDraft, TreeFolder, TreeRow, visibleRows } from "../services/notes";

type NewKind = TreeDraft["kind"];

type Props = {
  root: TreeFolder;
  selected: string | null;
  // The folder last clicked: highlighted, and where New note and New folder put things.
  activeFolder: string | null;
  expanded: Set<string>;
  tagFilter: string | null;
  draft: TreeDraft | null;
  draftError: string;
  draftName: string;
  onToggle: (path: string, open: boolean) => void;
  onOpen: (nodeId: string) => void;
  onSelectFolder: (path: string) => void;
  onNew: (kind: NewKind, folder: string) => void;
  onDraftCommit: (name: string) => void;
  onDraftCancel: () => void;
};

type Menu = { folder: string; x: number; y: number; returnTo: string | null };
const MENU_ITEMS: { kind: NewKind; label: string }[] = [{ kind: "note", label: "New note" }, { kind: "folder", label: "New folder" }];

function rowLabel(row: TreeRow) {
  if (row.kind === "folder") return row.folder.name;
  if (row.kind === "note") return row.node.title;
  return "";
}

// Only one row is in the tab order; the arrow keys reach the rest.
function tabStop(isCurrent: boolean) {
  if (isCurrent) return 0;
  return -1;
}

function plural(count: number) {
  if (count === 1) return "1 note";
  return `${count} notes`;
}

// The Facts folder is generated from saved facts, so nothing new can be made in it.
function canHoldNew(path: string) {
  return path !== FACTS_FOLDER;
}

/** The folder a row's menu acts on: a folder itself, or the folder a note sits in. */
function folderOf(row: TreeRow) {
  if (row.kind === "folder") return row.folder.path;
  if (row.kind === "note") return row.node.folder ?? "";
  return row.draft.folder;
}

/**
 * The name field for a new note or folder, typed straight into the tree as in Obsidian. It starts
 * with "Untitled" selected; Enter or moving away creates it, Escape cancels.
 */
function DraftRow({ draft, initialName, error, onCommit, onCancel }: { draft: TreeDraft; initialName: string; error: string; onCommit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const input = useRef<HTMLInputElement>(null);
  // Set once Escape or Enter has decided, so the blur that follows doesn't commit a second time.
  const settled = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    // A refused name reopens the field for another try.
    if (error) {
      settled.current = false;
      input.current?.focus();
    }
  }, [error]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Keep the tree's arrow keys and type-ahead out of the text field.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      settled.current = true;
      onCommit(name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      settled.current = true;
      onCancel();
    }
  }

  function onBlur() {
    if (settled.current) return;
    settled.current = true;
    onCommit(name);
  }

  let label = "Name for the new note";
  if (draft.kind === "folder") label = "Name for the new folder";
  return <span className="tree-draft">
    <input ref={input} value={name} aria-label={label} aria-invalid={error !== ""} aria-describedby="tree-draft-error" maxLength={120}
      onChange={(event) => setName(event.target.value)} onKeyDown={onKeyDown} onBlur={onBlur} />
    {error && <span id="tree-draft-error" className="tree-draft-error" role="alert">{error}</span>}
  </span>;
}

/**
 * The folder tree, following the ARIA tree pattern: one row is focusable at a time; Up and Down
 * move, Right opens a folder or enters it, Left closes it or goes to its parent, Home and End
 * jump, Enter or Space opens, and typing a letter moves to the next row starting with it. Right-
 * click, the Menu key or Shift+F10 offers New note and New folder in that folder.
 */
export default function FolderTree(props: Props) {
  const { root, selected, activeFolder, expanded, tagFilter, draft, draftError, draftName, onToggle, onOpen, onSelectFolder, onNew, onDraftCommit, onDraftCancel } = props;
  const rows = useMemo(() => visibleRows(root, expanded, tagFilter, draft), [root, expanded, tagFilter, draft]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const menuItems = useRef<(HTMLLIElement | null)[]>([]);
  // Set when a key moved focus, so the effect below moves the browser's focus too (not on clicks or reloads).
  const keyboardMove = useRef(false);

  let current = focusId;
  if (current === null || !rows.some((row) => row.id === current && row.kind !== "draft")) {
    current = rows.find((row) => row.id === selected)?.id ?? rows.find((row) => row.kind !== "draft")?.id ?? null;
  }

  useEffect(() => {
    if (!keyboardMove.current || current === null) return;
    keyboardMove.current = false;
    elements.current.get(current)?.focus();
  }, [current]);

  useEffect(() => {
    if (menu) menuItems.current[menuIndex]?.focus();
  }, [menu, menuIndex]);

  // A click anywhere outside the menu closes it, as in a desktop app.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".tree-menu")) return;
      setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menu]);

  function move(id: string | undefined) {
    if (!id) return;
    keyboardMove.current = true;
    setFocusId(id);
  }

  function activate(row: TreeRow) {
    if (row.kind === "folder") {
      onSelectFolder(row.folder.path);
      onToggle(row.folder.path, !row.expanded);
    } else if (row.kind === "note") {
      onOpen(row.id);
    }
  }

  function openMenu(folder: string, x: number, y: number, returnTo: string | null) {
    if (!canHoldNew(folder)) return;
    setMenuIndex(0);
    setMenu({ folder, x, y, returnTo });
  }

  function closeMenu(refocus: boolean) {
    const returnTo = menu?.returnTo ?? null;
    setMenu(null);
    if (refocus && returnTo) elements.current.get(returnTo)?.focus();
  }

  function choose(kind: NewKind) {
    if (!menu) return;
    const folder = menu.folder;
    setMenu(null);
    onNew(kind, folder);
  }

  function onRowMenu(event: MouseEvent<HTMLLIElement>, row: TreeRow) {
    const folder = folderOf(row);
    // Never let a row's right-click reach the empty-space handler (which makes things at the top level).
    event.stopPropagation();
    if (!canHoldNew(folder)) return;
    event.preventDefault();
    setFocusId(row.id);
    openMenu(folder, event.clientX, event.clientY, row.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const index = rows.findIndex((row) => row.id === current);
    if (index === -1) return;
    const row = rows[index];
    let handled = true;
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      const box = elements.current.get(row.id)?.getBoundingClientRect();
      if (box) openMenu(folderOf(row), box.left + 24, box.bottom, row.id);
    } else if (event.key === "ArrowDown") {
      move(rows.slice(index + 1).find((candidate) => candidate.kind !== "draft")?.id);
    } else if (event.key === "ArrowUp") {
      move(rows.slice(0, index).reverse().find((candidate) => candidate.kind !== "draft")?.id);
    } else if (event.key === "Home") {
      move(rows.find((candidate) => candidate.kind !== "draft")?.id);
    } else if (event.key === "End") {
      move([...rows].reverse().find((candidate) => candidate.kind !== "draft")?.id);
    } else if (event.key === "ArrowRight") {
      if (row.kind === "folder" && !row.expanded) onToggle(row.folder.path, true);
      else if (row.kind === "folder" && rows[index + 1]?.parent === row.id) move(rows[index + 1].id);
    } else if (event.key === "ArrowLeft") {
      if (row.kind === "folder" && row.expanded && tagFilter === null) onToggle(row.folder.path, false);
      else if (row.parent) move(row.parent);
    } else if (event.key === "Enter" || event.key === " ") {
      activate(row);
    } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Type-ahead: the next row after this one whose label starts with the typed character.
      const letter = event.key.toLocaleLowerCase();
      const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
      move(ordered.find((candidate) => candidate.kind !== "draft" && rowLabel(candidate).toLocaleLowerCase().startsWith(letter))?.id);
    } else {
      handled = false;
    }
    if (handled) event.preventDefault();
  }

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    event.stopPropagation();
    if (event.key === "ArrowDown") setMenuIndex((menuIndex + 1) % MENU_ITEMS.length);
    else if (event.key === "ArrowUp") setMenuIndex((menuIndex - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
    else if (event.key === "Home") setMenuIndex(0);
    else if (event.key === "End") setMenuIndex(MENU_ITEMS.length - 1);
    else if (event.key === "Enter" || event.key === " ") choose(MENU_ITEMS[menuIndex].kind);
    else if (event.key === "Escape" || event.key === "Tab") closeMenu(true);
    else return;
    event.preventDefault();
  }

  let body = <ul className="folder-tree" role="tree" aria-label="Notes by folder" onKeyDown={onKeyDown}>
    {rows.map((row) => {
      const indent = { paddingInlineStart: `${10 + (row.level - 1) * 16}px` };
      const common = {
        role: "treeitem", "aria-level": row.level, "aria-setsize": row.size, "aria-posinset": row.position, style: indent,
        ref: (element: HTMLLIElement | null) => {
          if (element) elements.current.set(row.id, element);
          else elements.current.delete(row.id);
        },
      } as const;
      if (row.kind === "draft") {
        return <li key={row.id} {...common} className="tree-row tree-draft-row" data-kind={row.draft.kind}>
          <span className="tree-icon" aria-hidden="true" />
          <DraftRow draft={row.draft} initialName={draftName} error={draftError} onCommit={onDraftCommit} onCancel={onDraftCancel} />
        </li>;
      }
      const focusable = { tabIndex: tabStop(row.id === current), onFocus: () => setFocusId(row.id), onContextMenu: (event: MouseEvent<HTMLLIElement>) => onRowMenu(event, row) };
      if (row.kind === "folder") {
        return <li key={row.id} {...common} {...focusable} aria-expanded={row.expanded} aria-selected={row.folder.path === activeFolder}
          className="tree-row tree-folder" data-open={row.expanded} data-active={row.folder.path === activeFolder}
          onClick={() => { setFocusId(row.id); activate(row); }}>
          <span className="tree-chevron" aria-hidden="true" />
          <span className="tree-label">{row.folder.name}</span>
          <span className="tree-count" aria-hidden="true">{row.folder.count}</span>
          <span className="sr-only">, {plural(row.folder.count)}</span>
        </li>;
      }
      return <li key={row.id} {...common} {...focusable} aria-selected={row.id === selected} className="tree-row tree-note" data-kind={row.node.kind}
        onClick={() => { setFocusId(row.id); activate(row); }}>
        <span className="tree-label">{row.node.title}</span>
        {row.node.essential && <span className="tree-essential" title="Essential">Essential</span>}
      </li>;
    })}
  </ul>;
  if (rows.length === 0) {
    body = <p className="notes-empty">No notes yet.</p>;
    if (tagFilter !== null) body = <p className="notes-empty">No notes are tagged #{tagFilter}.</p>;
  }

  // Right-clicking the empty space below the rows makes things at the top level.
  return <div className="folder-tree-area" onContextMenu={(event) => { event.preventDefault(); openMenu("", event.clientX, event.clientY, current); }}>
    {body}
    {menu && <ul className="tree-menu" role="menu" aria-label={`New in ${menu.folder || "the top level"}`} style={{ left: menu.x, top: menu.y }} onKeyDown={onMenuKey}>
      {MENU_ITEMS.map((item, index) => <li key={item.kind} role="menuitem" tabIndex={-1} ref={(element) => { menuItems.current[index] = element; }}
        onClick={() => choose(item.kind)} onPointerEnter={() => setMenuIndex(index)}>{item.label}</li>)}
    </ul>}
  </div>;
}
