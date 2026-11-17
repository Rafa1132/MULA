"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { NOTE_SCHEME, TAG_SCHEME, keepMulaUrls, remarkWikilinks } from "../services/markdown";

type Props = {
  text: string;
  // The node id a link target opens, or null when no note has that title yet (a ghost).
  resolve: (target: string) => string | null;
  onLink: (target: string, nodeId: string | null) => void;
  onTag: (tag: string) => void;
};

const PLUGINS = [remarkWikilinks];

/** Note Markdown with clickable [[links]] and #tags. Raw HTML in notes is shown as text, never run. */
export default function NoteMarkdown({ text, resolve, onLink, onTag }: Props) {
  function renderLink(href: string | undefined, children: ReactNode) {
    if (href && href.startsWith(NOTE_SCHEME)) {
      const target = decodeURIComponent(href.slice(NOTE_SCHEME.length));
      const nodeId = resolve(target);
      if (nodeId === null) {
        return <button type="button" className="wikilink" data-ghost="true" title={`No note called “${target}” yet. Select to create it.`} onClick={() => onLink(target, null)}>{children}</button>;
      }
      return <button type="button" className="wikilink" onClick={() => onLink(target, nodeId)}>{children}</button>;
    }
    if (href && href.startsWith(TAG_SCHEME)) {
      const tag = decodeURIComponent(href.slice(TAG_SCHEME.length));
      return <button type="button" className="tag-chip" onClick={() => onTag(tag)} aria-label={`Show notes tagged ${tag}`}>{children}</button>;
    }
    return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
  }

  return <div className="note-markdown">
    <ReactMarkdown remarkPlugins={PLUGINS} urlTransform={(url) => keepMulaUrls(url, defaultUrlTransform)}
      components={{ a: ({ href, children }) => renderLink(href, children) }}>{text}</ReactMarkdown>
  </div>;
}
