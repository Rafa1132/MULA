"""USER.md: what the owner told the orchestrator about themselves, one file per account.

It lives at `<data dir>/users/<account id>/USER.md`, owner-only, outside every project, so no
project member and no project agent reads it; only the account's own orchestrator does. The file
has four fixed sections, one line each, so it can be read back without guessing. It is the only
copy of the answers: onboarding and Settings both write here.
"""
import os
from pathlib import Path
import re
import tempfile
import unicodedata
from uuid import UUID

from fastapi import HTTPException

from ..memory import filters
from ..memory import store

# Section headings, in file order. The keys are the API's field names.
FIELDS = {
    "name": "Name",
    "business": "Business",
    "help": "Wants help with",
    "style": "How to answer",
}
MAX_ANSWER = 300
NOT_GIVEN = "(not given)"
HEADER = ("# About you\n\n"
          "Written by Mula from your answers. Change it in Settings. Mula never keeps passwords, "
          "card or ID numbers, email addresses or phone numbers here.\n")
SECTION = re.compile(r"^## (.+)$", re.MULTILINE)
# Stricter than the memory filter, which needs `password: …`: a profile answer never mentions a
# credential's value in prose either ("my password is …", "PIN saya adalah …").
CREDENTIAL_PROSE = re.compile(r"\b(?:password|passwd|kata sandi|sandi|pin|api key|token)\b(?:\s+(?:saya|kami|aku|ku))?\s*(?:is|was|adalah|itu|=|:)\s*\S", re.IGNORECASE)


def user_folder(account_id):
    """The account's private folder, created owner-only. Never a client-supplied path."""
    identity = str(UUID(account_id))
    root = store.DATA_DIR / "users"
    folder = root / identity
    for directory in (root, folder):
        if directory.is_symlink():
            raise HTTPException(409, "The user folder must not be a symbolic link.")
        directory.mkdir(mode=0o700, exist_ok=True)
    return folder


def user_path(account_id):
    return user_folder(account_id) / "USER.md"


def clean_answer(field, value):
    """One answer as it will be written: a single trimmed line, or None for no answer.

    Refuses what must never be kept about a person: credentials, card or ID numbers (the memory
    filter's rules) and, stricter than memory, any email address or phone number.
    """
    if field not in FIELDS:
        raise HTTPException(422, "Unknown question.")
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(422, "An answer must be text.")
    text = " ".join(value.split())
    if not text:
        return None
    for character in text:
        if unicodedata.category(character) in {"Cc", "Cf", "Cs", "Co", "Cn"}:
            raise HTTPException(422, "An answer must be readable text without control characters.")
    if len(text) > MAX_ANSWER:
        raise HTTPException(422, f"Keep the answer to {MAX_ANSWER} characters.")
    reason = filters.sensitive_reason(text)
    if reason is None and CREDENTIAL_PROSE.search(text):
        reason = "Credentials, keys and passwords are never kept in your profile."
    if reason is None and (filters.EMAIL.search(text) or filters.PHONE.search(text)):
        reason = "Email addresses and phone numbers are not kept in your profile."
    if reason is not None:
        raise HTTPException(422, reason.replace("saved to memory", "kept in your profile"))
    return text


def render(about):
    parts = [HEADER]
    for field, heading in FIELDS.items():
        value = about.get(field)
        if value is None:
            value = NOT_GIVEN
        parts.append(f"\n## {heading}\n\n{value}\n")
    return "".join(parts)


def parse(text):
    """The four answers from a USER.md written by `render`; unknown sections are ignored."""
    about = {field: None for field in FIELDS}
    by_heading = {heading: field for field, heading in FIELDS.items()}
    matches = list(SECTION.finditer(text))
    for index, match in enumerate(matches):
        end = len(text)
        if index + 1 < len(matches):
            end = matches[index + 1].start()
        field = by_heading.get(match.group(1).strip())
        value = " ".join(text[match.end():end].split())
        if field is not None and value and value != NOT_GIVEN:
            about[field] = value
    return about


def read_about(account_id):
    path = user_path(account_id)
    if path.is_symlink():
        raise HTTPException(409, "USER.md must not be a symbolic link.")
    if not path.is_file():
        return {field: None for field in FIELDS}
    try:
        return parse(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as error:
        raise HTTPException(503, "Your profile could not be read. Check the runtime folder's permissions.") from error


def write_about(account_id, about):
    """Replace USER.md with these answers, atomically and owner-only."""
    path = user_path(account_id)
    if path.is_symlink():
        raise HTTPException(409, "USER.md must not be a symbolic link.")
    raw = render(about).encode("utf-8")
    try:
        descriptor, temporary = tempfile.mkstemp(prefix=".user-", dir=path.parent)
        try:
            with os.fdopen(descriptor, "wb") as output:
                output.write(raw)
            os.chmod(temporary, 0o600)
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
    except OSError as error:
        raise HTTPException(503, "Your profile could not be saved. Check the runtime folder's permissions.") from error


def save_answer(account_id, field, value):
    """Write one answer into USER.md, keeping the others. Returns all four."""
    about = read_about(account_id)
    about[field] = clean_answer(field, value)
    write_about(account_id, about)
    return about


def save_all(account_id, answers):
    """Replace all four answers (the summary edit and Settings). Missing fields become not given."""
    if not isinstance(answers, dict):
        raise HTTPException(422, "Send the answers as an object.")
    about = {field: clean_answer(field, answers.get(field)) for field in FIELDS}
    write_about(account_id, about)
    return about
