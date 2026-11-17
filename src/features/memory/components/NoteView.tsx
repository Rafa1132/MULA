"use client";

import { Mention, NoteDetail, titleKey } from "../services/notes";
import NoteMarkdown from "./NoteMarkdown";

// Frontmatter shown elsewhere on the page (tags as chips, aliases and essential in the header).
const SHOWN_SEPARATELY = new Set(["tags", "aliases", "essential"]);

type LinkHandlers = {
  resolve: (target: string) => string | null;
  onLink: (target: string, nodeId: string | null) => void;
  onTag: (tag: string) => void;
};

function propertyText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined) return "—";
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function plural(count: number, noun: string) {
  if (count === 1) return `1 ${noun}`;
  return `${count} ${noun}s`;
}

export function LinkedMentions({ mentions, onOpen }: { mentions: Mention[]; onOpen: (mention: Mention) => void }) {
  return <section className="note-mentions" aria-labelledby="linked-mentions">
    <h3 id="linked-mentions">Linked mentions <span className="note-count">{mentions.length}</span></h3>
    {mentions.length === 0 && <p className="notes-empty">No other notes link here yet.</p>}
    <ul>
      {mentions.map((mention, index) => <li key={`${mention.note_id ?? "fact"}-${mention.fact_id ?? index}`}>
        <button type="button" className="mention-title" onClick={() => onOpen(mention)}>{mention.title}</button>
        {mention.context && <p>{mention.context}</p>}
      </li>)}
    </ul>
  </section>;
}

type Props = LinkHandlers & {
  note: NoteDetail;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onMention: (mention: Mention) => void;
};

/** One note as it reads: header, properties, tags, the rendered body and its linked mentions. */
export default function NoteView({ note, busy, resolve, onLink, onTag, onEdit, onArchive, onMention }: Props) {
  // The server resolved this note's own links (including aliases); fall back to the graph for anything else.
  const resolved = new Map(note.links.map((link) => [titleKey(link.target), link.resolves_to]));
  function resolveHere(target: string) {
    const known = resolved.get(titleKey(target));
    if (known !== undefined) return known;
    return resolve(target);
  }
  const properties = Object.entries(note.frontmatter).filter(([name]) => !SHOWN_SEPARATELY.has(name));
  let aliases: string[] = [];
  if (Array.isArray(note.frontmatter.aliases)) aliases = note.frontmatter.aliases.map(String);

  return <article className="note-view" aria-labelledby="note-title">
    <header className="note-header">
      {note.folder && <p className="note-path">{note.folder.split("/").join(" / ")}</p>}
      <h2 id="note-title">{note.title}</h2>
      <p className="note-meta">
        {note.frontmatter.essential === true && <span className="note-badge">Essential</span>}
        <span>Updated {new Date(note.updated_at).toLocaleString()} · {plural(note.versions, "version")}</span>
        {aliases.length > 0 && <span>Also called {aliases.join(", ")}</span>}
      </p>
      <div className="note-actions">
        <button type="button" className="account-submit" onClick={onEdit} disabled={busy}>Edit</button>
        <button type="button" className="text-button" onClick={onArchive} disabled={busy}>Archive</button>
      </div>
    </header>
    {/* The file is shown as it is in the vault; saving from Mula needs the problem fixed first. */}
    {note.warning && <p className="note-warning" role="note"><strong>Check this note:</strong> {note.warning}</p>}
    {note.tags.length > 0 && <ul className="note-tags" aria-label="Tags">
      {note.tags.map((tag) => <li key={tag}><button type="button" className="tag-chip" onClick={() => onTag(tag)} aria-label={`Show notes tagged ${tag}`}>#{tag}</button></li>)}
    </ul>}
    {properties.length > 0 && <dl className="note-properties">
      {properties.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{propertyText(value)}</dd></div>)}
    </dl>}
    {note.body.trim() && <NoteMarkdown text={note.body} resolve={resolveHere} onLink={onLink} onTag={onTag} />}
    {!note.body.trim() && <p className="notes-empty">This note is empty. Select Edit to write it.</p>}
    <LinkedMentions mentions={note.mentions} onOpen={onMention} />
  </article>;
}

type GhostProps = { title: string; mentions: Mention[]; busy: boolean; onCreate: () => void; onMention: (mention: Mention) => void };

/** A link target no note has yet, shown like Obsidian's unresolved links: who links here, and a way to create it. */
export function GhostView({ title, mentions, busy, onCreate, onMention }: GhostProps) {
  return <article className="note-view" aria-labelledby="note-title">
    <header className="note-header">
      <p className="note-path">Not created yet</p>
      <h2 id="note-title">{title}</h2>
      <p className="note-meta"><span>Other notes link to this title, but no note has it yet.</span></p>
      <div className="note-actions"><button type="button" className="account-submit" onClick={onCreate} disabled={busy}>Create this note</button></div>
    </header>
    <LinkedMentions mentions={mentions} onOpen={onMention} />
  </article>;
}
