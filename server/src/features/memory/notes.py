"""Obsidian-compatible notes: validation and parsing, with no storage.

A note is a Markdown file in the account's vault, with optional YAML frontmatter. Its file name
is its title and its folder is a real path, so `suppliers/Aroma Coffee.md` is the note
`Aroma Coffee` in `suppliers/`. Links are `[[Title]]`, `[[Title|alias]]`, `[[Title#Heading]]` or
`[[folder/Title]]`; tags are `#tag` in the body or the frontmatter `tags` list. Everything here
is pure, so the vault scan, the store and the tests share one parser.

Two modes: `parse` checks what Mula itself is about to write and refuses with a reason;
`read_file` reads what is already in the vault (often written in Obsidian) and never refuses,
reporting a problem as a warning instead, so every file the owner keeps there shows up.
"""
from datetime import date, datetime
import json
import re
import unicodedata

import yaml

from .filters import MemoryRefused, sensitive_reason

MAX_TEXT = 100_000
MAX_TITLE = 120
MAX_FOLDER_DEPTH = 8
# The Facts folder holds the two generated notes made from the fact store, so no note may use it.
FACTS_FOLDER = "Facts"
FACT_TITLES = {"business": "About the business", "owner": "About the owner"}
# Characters Obsidian refuses in a linkable file name, plus path separators.
TITLE_FORBIDDEN = set('/\\:*?"<>|[]#^')
FENCE = re.compile(r"^(```|~~~)")
INLINE_CODE = re.compile(r"`[^`\n]*`")
WIKILINK = re.compile(r"!?\[\[([^\[\]\n]+?)\]\]")
# A tag starts after whitespace or at the line start, and has at least one non-digit (Obsidian's rule).
TAG = re.compile(r"(?:(?<=\s)|^)#([\w/-]*[^\W\d][\w/-]*)", re.UNICODE)


def key(text):
    """Comparison form for titles, paths and aliases: Unicode-normalized and case-folded."""
    return unicodedata.normalize("NFC", " ".join(text.split())).casefold()


def check_name(name, what):
    """A title or folder segment: readable, short, and safe as a file name on every platform."""
    if not isinstance(name, str):
        raise MemoryRefused(f"The {what} must be text.")
    name = unicodedata.normalize("NFC", " ".join(name.split()))
    if not name:
        raise MemoryRefused(f"Give the note a {what}.")
    if len(name) > MAX_TITLE:
        raise MemoryRefused(f"A {what} can have at most {MAX_TITLE} characters.")
    if name.startswith(".") or name.endswith("."):
        raise MemoryRefused(f"A {what} can't start or end with a dot.")
    for character in name:
        if character in TITLE_FORBIDDEN or unicodedata.category(character)[0] == "C":
            raise MemoryRefused(f"A {what} can't contain {character!r}. These characters break links and file names: / \\ : * ? \" < > | [ ] # ^")
    return name


def check_folder(folder):
    """`a/b/c` with at most four levels, each a safe name; '' is the top level."""
    if not isinstance(folder, str):
        raise MemoryRefused("The folder must be text.")
    folder = folder.strip().strip("/")
    if not folder:
        return ""
    parts = [check_name(part, "folder name") for part in folder.split("/")]
    if len(parts) > MAX_FOLDER_DEPTH:
        raise MemoryRefused(f"Folders can be at most {MAX_FOLDER_DEPTH} levels deep.")
    if key(parts[0]) == key(FACTS_FOLDER):
        raise MemoryRefused("The Facts folder is made from your saved facts. Choose another folder.")
    return "/".join(parts)


def check_title(title):
    title = check_name(title, "title")
    for reserved in FACT_TITLES.values():
        if key(title) == key(reserved):
            raise MemoryRefused(f"“{reserved}” is the name of a Facts note. Choose another title.")
    return title


def path_of(folder, title):
    if folder:
        return folder + "/" + title
    return title


def split_frontmatter(text):
    """(frontmatter text or None, body). Frontmatter is a `---` block on the very first line."""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---", 3)
    while end != -1:
        after = end + len("\n---")
        if after == len(text) or text[after] == "\n":
            return text[4:end + 1], text[after + 1:]
        end = text.find("\n---", after)
    raise MemoryRefused("The frontmatter starts with --- but has no closing --- line.")


def scalar(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def plain_value(value):
    """A property as the page shows it: text, numbers, yes/no, dates as ISO text, lists of those.
    Anything nested (Obsidian allows it) is kept as compact JSON text rather than refused."""
    value = scalar(value)
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, list) and all(not isinstance(item, (dict, list)) for item in value):
        return [scalar(item) for item in value]
    return json.dumps(value, ensure_ascii=False, default=str)


def text_list(value):
    """`tags` and `aliases` may be a list or one comma-separated string, as in Obsidian."""
    if value is None:
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list):
        value = [value]
    items = []
    for item in value:
        item = str(item).strip()
        if item:
            items.append(item)
    return items


def parse_frontmatter(block):
    """The note's frontmatter properties, as the page shows them; MemoryRefused when unreadable."""
    if block is None or not block.strip():
        return {}
    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as error:
        raise MemoryRefused("The frontmatter is not valid YAML. Check the lines between the --- markers.") from error
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise MemoryRefused("The frontmatter must be a list of properties, such as `tags: [supplier]`.")
    properties = {}
    for name, value in data.items():
        properties[str(name)] = plain_value(value)
    if "tags" in properties:
        properties["tags"] = [tag.lstrip("#") for tag in text_list(properties["tags"])]
    if "aliases" in properties:
        properties["aliases"] = text_list(properties["aliases"])
    if "essential" in properties and not isinstance(properties["essential"], bool):
        raise MemoryRefused("The frontmatter property “essential” must be true or false.")
    return properties


def render_frontmatter(properties):
    """The editable frontmatter block for the editor, or '' when there are no properties."""
    if not properties:
        return ""
    return "---\n" + yaml.safe_dump(properties, allow_unicode=True, sort_keys=False) + "---\n"


def prose_lines(body):
    """Body lines outside fenced code blocks, with inline code removed: where links and tags count."""
    lines = []
    fenced = False
    for line in body.split("\n"):
        if FENCE.match(line.strip()):
            fenced = not fenced
            continue
        if fenced:
            continue
        lines.append(INLINE_CODE.sub(" ", line))
    return lines


def parse_link(inner):
    """`Title#Heading|alias` → (target, alias or None). `.md` and the heading are not part of the target."""
    alias = None
    if "|" in inner:
        inner, alias = inner.split("|", 1)
        alias = alias.strip() or None
    target = inner.split("#", 1)[0].split("^", 1)[0].strip()
    if target.lower().endswith(".md"):
        target = target[:-3].strip()
    return target, alias


def links_in(lines):
    """Each wikilink once per line: (target, alias, the line it sits in as context)."""
    found = []
    for line in lines:
        for match in WIKILINK.finditer(line):
            target, alias = parse_link(match.group(1))
            if target:
                found.append((target, alias, " ".join(line.split())[:200]))
    return found


def tags_in(lines, properties):
    tags = list(properties.get("tags", []))
    for line in lines:
        if re.match(r"^#{1,6}\s", line):
            # A Markdown heading is not a tag.
            continue
        tags.extend(TAG.findall(line))
    unique = {}
    for tag in tags:
        tag = tag.strip().strip("/")
        if tag:
            unique.setdefault(key(tag), tag)
    return list(unique.values())


def check_text(text):
    """Line endings normalized; no control characters other than newlines and tabs; within the size limit."""
    if not isinstance(text, str):
        raise MemoryRefused("A note must be text.")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(text) > MAX_TEXT:
        raise MemoryRefused(f"A note can hold at most {MAX_TEXT:,} characters. Split it into linked notes.")
    for character in text:
        if character not in "\n\t" and unicodedata.category(character) in {"Cc", "Cf", "Cs", "Co", "Cn"}:
            raise MemoryRefused("A note must be readable text without control characters.")
    return text


def sensitive_in(title, lines, properties):
    """The filter for facts, applied line by line: a phone number and the word 'customer' only count together on one line."""
    candidates = [title, *lines]
    for value in properties.values():
        if isinstance(value, list):
            candidates.extend(str(item) for item in value)
        else:
            candidates.append(str(value))
    for candidate in candidates:
        reason = sensitive_reason(candidate)
        if reason is not None:
            return reason
    return None


def parsed_note(folder, title, text, properties, body, warning):
    lines = prose_lines(body)
    return {
        "folder": folder,
        "title": title,
        "path": path_of(folder, title),
        # The file's exact text: the vault is the source of truth, so the editor shows it as written.
        "text": text,
        "frontmatter": properties,
        "body": body,
        "links": links_in(lines),
        "tags": tags_in(lines, properties),
        "aliases": properties.get("aliases", []),
        "essential": properties.get("essential") is True,
        "warning": warning,
    }


def parse(folder, title, text):
    """A note Mula is about to write, or MemoryRefused with the reason."""
    folder = check_folder(folder)
    title = check_title(title)
    text = check_text(text)
    block, body = split_frontmatter(text)
    properties = parse_frontmatter(block)
    reason = sensitive_in(title, body.split("\n"), properties)
    if reason is not None:
        raise MemoryRefused(reason)
    return parsed_note(folder, title, text, properties, body, None)


def read_file(folder, title, text):
    """A note already in the vault. Never refused: a problem becomes the note's warning, and the
    file is still shown, because it is the owner's own file. The sensitive-data filter only flags."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    warning = None
    try:
        block, body = split_frontmatter(text)
    except MemoryRefused as problem:
        block, body, warning = None, text, str(problem)
    try:
        properties = parse_frontmatter(block)
    except MemoryRefused as problem:
        properties = {}
        warning = str(problem)
    reason = sensitive_in(title, body.split("\n"), properties)
    if reason is not None and warning is None:
        warning = reason
    return parsed_note(folder, title, text, properties, body, warning)


def retarget_links(body, old_keys, new_target):
    """The body with every link to one of `old_keys` pointing at `new_target`, and how many changed.

    The heading and alias of each link are kept, and links inside code are left alone, so this
    changes only what a reader sees as a link.
    """
    changed = 0
    fenced = False
    lines = []

    def replace(match):
        nonlocal changed
        inner = match.group(1)
        target, _ = parse_link(inner)
        if key(target) not in old_keys:
            return match.group(0)
        changed += 1
        # Keep everything after the target as written: `#Heading`, `^block` and `|alias`.
        rest = inner[len(re.split(r"[#^|]", inner, maxsplit=1)[0]):]
        return match.group(0).replace(inner, new_target + rest, 1)

    for line in body.split("\n"):
        if FENCE.match(line.strip()):
            fenced = not fenced
            lines.append(line)
            continue
        if fenced:
            lines.append(line)
            continue
        # Split around inline code so only the prose parts are rewritten.
        parts = re.split(r"(`[^`\n]*`)", line)
        for index in range(0, len(parts), 2):
            parts[index] = WIKILINK.sub(replace, parts[index])
        lines.append("".join(parts))
    return "\n".join(lines), changed


def fact_links(fact):
    """Wikilinks inside a saved fact, so facts can point at notes too."""
    return links_in(prose_lines(fact))
