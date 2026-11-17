// A remark plugin for react-markdown that turns `[[links]]` and `#tags` in prose into links with
// Mula-only URL schemes, which NoteMarkdown renders as buttons. Code spans and code blocks are
// separate node types, so links and tags inside code are left as text, as on the server.
import { splitInline } from "./notes.ts";

export const NOTE_SCHEME = "mula-note:";
export const TAG_SCHEME = "mula-tag:";

// The few Markdown syntax-tree fields this plugin reads; react-markdown's own types are not imported.
type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };

function expand(node: MarkdownNode) {
  // Text inside an existing link stays as written, so a link is never nested in a link.
  if (!node.children || node.type === "link" || node.type === "linkReference") return;
  const children: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type !== "text" || !child.value) {
      expand(child);
      children.push(child);
      continue;
    }
    for (const part of splitInline(child.value)) {
      if ("text" in part) {
        children.push({ type: "text", value: part.text });
      } else if ("link" in part) {
        children.push({ type: "link", url: NOTE_SCHEME + encodeURIComponent(part.link), children: [{ type: "text", value: part.label }] });
      } else {
        children.push({ type: "link", url: TAG_SCHEME + encodeURIComponent(part.tag), children: [{ type: "text", value: "#" + part.tag }] });
      }
    }
  }
  node.children = children;
}

export function remarkWikilinks() {
  return (tree: MarkdownNode) => {
    expand(tree);
  };
}

/** react-markdown removes unknown URL schemes; keep Mula's two and apply its usual rule to the rest. */
export function keepMulaUrls(url: string, fallback: (url: string) => string) {
  if (url.startsWith(NOTE_SCHEME) || url.startsWith(TAG_SCHEME)) return url;
  return fallback(url);
}
