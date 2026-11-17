"""The account's vault: `memory/notes/`, a folder of Markdown files that Obsidian can open as a vault.

The files are the source of truth for notes. `scan` reads the folder and brings the store in line
with it: a new file becomes a note, a changed file a new version, a moved file (same text, new
path) the same note in its new place, and a file that is gone an archived note. Every `.md` file
counts, whoever wrote it; folders and files whose names start with a dot (`.obsidian`, `.trash`,
`.git`) and symbolic links are skipped. Only files whose size or modified time changed are read.

Mula's own edits write the files here too. Mula never deletes a file or removes a folder:
archiving moves the file into `.trash/`, as Obsidian does, and a new note never replaces a file.
"""
import hashlib
import os
from pathlib import Path
import tempfile
import threading

from fastapi import HTTPException

from . import note_store, notes, store

# Larger files are listed as skipped rather than read on every change.
MAX_FILE_BYTES = 400_000
TRASH = ".trash"
VAULT_ACTOR = "vault"

# One scan or write at a time per account, so two requests can't both create a note for one new
# file. Re-entrant, because a save scans first and then writes while still holding the lock.
_locks = {}
_locks_guard = threading.Lock()


def lock_for(account_id):
    with _locks_guard:
        return _locks.setdefault(account_id, threading.RLock())


def notes_root(account_id):
    root = store.memory_folder(account_id) / "notes"
    if root.is_symlink():
        raise HTTPException(409, "The notes folder must not be a symbolic link.")
    root.mkdir(mode=0o700, exist_ok=True)
    return root


def relative(folder, title):
    """A note's file, relative to the vault, with forward slashes: `suppliers/Aroma.md`."""
    return notes.path_of(folder, title) + ".md"


def split_relative(rel):
    """`suppliers/Aroma.md` → ('suppliers', 'Aroma')."""
    folder, _, name = rel.rpartition("/")
    return folder, name[:-len(".md")]


def inside(root, rel):
    """The absolute path of `rel`, refused if it would leave the vault."""
    path = root.joinpath(*rel.split("/"))
    if root.resolve() not in path.resolve().parents:
        raise HTTPException(409, "A note path left the notes folder.")
    return path


def reserved(folder):
    # The generated Facts folder owns this name in the tree, so a vault folder with it isn't shown.
    return notes.key(folder.split("/")[0]) == notes.key(notes.FACTS_FOLDER)


def walk(root):
    """Every note file (relative path → absolute path) and every folder in the vault."""
    files = {}
    folders = []
    for current, directories, names in os.walk(root):
        here = Path(current)
        directories[:] = sorted(name for name in directories if not name.startswith(".") and not (here / name).is_symlink())
        folder = here.relative_to(root).as_posix()
        if folder == ".":
            folder = ""
        if folder and not reserved(folder):
            folders.append(folder)
        for name in sorted(names):
            path = here / name
            if name.startswith(".") or not name.lower().endswith(".md") or len(name) <= len(".md") or path.is_symlink():
                continue
            files[notes.path_of(folder, name[:-len(".md")]) + ".md"] = path
    return files, folders


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def scan(account_id):
    """Bring the store in line with the vault. Returns its folders and the files that were skipped."""
    with lock_for(account_id):
        root = notes_root(account_id)
        try:
            files, folders = walk(root)
        except OSError as error:
            raise HTTPException(503, "The notes folder could not be read. Check the runtime folder's permissions.") from error
        skipped = []
        with store.open_store(account_id) as db:
            known = note_store.vault_files(db)
            seen = set()
            fresh = []
            for rel, path in files.items():
                folder, title = split_relative(rel)
                record = known.get(rel)
                if record is not None:
                    # Whatever happens to its text below, the note's file is still here.
                    seen.add(record["note_id"])
                if reserved(folder):
                    skipped.append({"path": rel, "reason": "The Facts folder is made from your saved facts. Rename this folder to see its notes."})
                    continue
                try:
                    info = path.stat()
                except OSError:
                    skipped.append({"path": rel, "reason": "The file could not be read."})
                    continue
                if record is not None and record["size"] == info.st_size and record["mtime_ns"] == info.st_mtime_ns:
                    continue
                if info.st_size > MAX_FILE_BYTES:
                    skipped.append({"path": rel, "reason": f"Larger than {MAX_FILE_BYTES // 1000} KB."})
                    continue
                try:
                    raw = path.read_bytes()
                    text = raw.decode("utf-8")
                except (OSError, UnicodeDecodeError):
                    skipped.append({"path": rel, "reason": "Not readable as UTF-8 text."})
                    continue
                sha = digest(raw)
                if record is not None and record["sha256"] == sha:
                    # Touched but not changed (a sync tool, a save without edits): no new version.
                    note_store.set_file(db, record["note_id"], rel, info.st_size, info.st_mtime_ns, sha)
                    continue
                parsed = notes.read_file(folder, title, text)
                if record is not None:
                    note_store.commit(db, record["note_id"], parsed, VAULT_ACTOR, "note_saved")
                    note_store.set_file(db, record["note_id"], rel, info.st_size, info.st_mtime_ns, sha)
                    continue
                fresh.append((rel, parsed, info, sha))
            gone = {row["note_id"]: row for row in known.values() if row["note_id"] not in seen}
            gone_by_sha = {}
            for row in gone.values():
                gone_by_sha.setdefault(row["sha256"], row)
            for rel, parsed, info, sha in fresh:
                problem = add_file(db, gone, gone_by_sha, rel, parsed, info, sha)
                if problem:
                    skipped.append({"path": rel, "reason": problem})
            for note_id in gone:
                # Deleted or moved out of the vault in Obsidian: archived, with every version kept.
                note_store.archive(db, note_id)
                store.record(db, "note_archived", None, VAULT_ACTOR, note_id=note_id)
            # Notes saved before the vault was the source of truth whose file is missing.
            for note_id in note_store.active_ids(db):
                if note_store.file_of(db, note_id) is None:
                    note_store.archive(db, note_id)
                    store.record(db, "note_archived", None, VAULT_ACTOR, note_id=note_id)
        return {"folders": folders, "skipped": skipped}


def add_file(db, gone, gone_by_sha, rel, parsed, info, sha):
    """Record a file the store hasn't seen. Returns a reason when it can't be shown, else None."""
    note_id = None
    action = "note_created"
    moved = gone_by_sha.pop(sha, None)
    if moved is not None and moved["note_id"] in gone:
        # Same text at a new path: Obsidian moved or renamed it, so it stays the same note.
        note_id = moved["note_id"]
        del gone[note_id]
        action = "note_moved"
    else:
        owner = note_store.path_owner(db, parsed["path"])
        if owner is not None and note_store.file_of(db, owner) is None:
            # A note saved before the vault was the source of truth: this is its file.
            note_id = owner
            action = "note_saved"
        elif owner is not None:
            return "Another file has the same name with different capitals."
    db.execute("SAVEPOINT vault_file")
    try:
        note_id, _ = note_store.commit(db, note_id, parsed, VAULT_ACTOR, action)
        note_store.set_file(db, note_id, rel, info.st_size, info.st_mtime_ns, sha)
    except HTTPException as refusal:
        db.execute("ROLLBACK TO vault_file")
        db.execute("RELEASE vault_file")
        return str(refusal.detail)
    db.execute("RELEASE vault_file")
    return None


def taken(root, rel, ignore=None):
    """Whether a file already sits at `rel`, compared without case (as macOS does). `ignore` is the
    note's own current file, so a rename that only changes capitals is allowed."""
    folder, title = split_relative(rel)
    directory = inside(root, rel).parent
    if not directory.is_dir():
        return False
    wanted = notes.key(title + ".md")
    for entry in directory.iterdir():
        if notes.key(entry.name) != wanted:
            continue
        if ignore is not None and notes.key(notes.path_of(folder, entry.name)) == notes.key(ignore):
            continue
        return True
    return False


def make_folders(root, directory):
    """Create the missing folders between the vault and `directory`, owner-only."""
    current = directory
    missing = []
    while not current.exists():
        missing.append(current)
        current = current.parent
    for folder in reversed(missing):
        folder.mkdir(mode=0o700)
    for folder in [directory, *directory.parents]:
        if folder == root:
            break
        if folder.is_symlink():
            raise HTTPException(409, "Note files and folders must not be symbolic links.")


def write_note(root, old_rel, new_rel, text):
    """Write a note's file, moving it first when its folder or title changed. Returns its
    (size, mtime_ns, sha256) as recorded in `vault_files`."""
    path = inside(root, new_rel)
    try:
        make_folders(root, path.parent)
        if old_rel is not None and old_rel != new_rel:
            old_path = inside(root, old_rel)
            if old_path.is_file() and not old_path.is_symlink():
                os.rename(old_path, path)
        if path.is_symlink():
            raise HTTPException(409, "Note files and folders must not be symbolic links.")
        raw = text.encode("utf-8")
        descriptor, temporary = tempfile.mkstemp(prefix=".note-", dir=path.parent)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(raw)
            os.chmod(temporary, 0o600)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
        info = path.stat()
    except OSError as error:
        raise HTTPException(503, "The note file could not be written. Check the runtime folder's permissions.") from error
    return info.st_size, info.st_mtime_ns, digest(raw)


def trash(root, rel):
    """Move a note's file into the vault's `.trash/`, as Obsidian does; never delete it."""
    source = inside(root, rel)
    if not source.is_file() or source.is_symlink():
        return
    bin_folder = root / TRASH
    try:
        bin_folder.mkdir(mode=0o700, exist_ok=True)
        stem = source.name[:-len(".md")]
        target = bin_folder / source.name
        number = 1
        while target.exists():
            target = bin_folder / f"{stem} {number}.md"
            number += 1
        os.rename(source, target)
    except OSError as error:
        raise HTTPException(503, "The note file could not be moved to .trash. Check the runtime folder's permissions.") from error


def make_folder(root, folder):
    """Create one new folder in the vault; refuse if it is already there."""
    directory = inside(root, folder + "/x.md").parent
    if directory.exists():
        raise HTTPException(409, f"A folder called “{folder.rsplit('/', 1)[-1]}” is already here.")
    try:
        make_folders(root, directory)
    except OSError as error:
        raise HTTPException(503, "The folder could not be created. Check the runtime folder's permissions.") from error
