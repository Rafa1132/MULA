"""Scripted onboarding: fixed questions, one at a time, asked by the orchestrator in its chat.

Steps run in order: what to call the assistant, the four questions about the owner
(`user_file.FIELDS`), a summary the owner can edit, an optional personality, then done. The
assistant's name goes to its SOUL.md (rendered on every turn from `assistant_name`); every other
answer is written to USER.md as soon as it is given. Any
question can be skipped, and "Skip for now" ends onboarding at once; either way the workspace
works as usual. It runs once per account and can be restarted from Settings.

Each change names the step it answers, so a double submit or a second tab gets a 409 instead of
skipping a question.

New accounts hear a spoken welcome first (WELCOME, also shown as text). `welcome_heard_at` is set
when it starts, so it plays once per account, on whichever device.
"""
import re

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from ...common.database import database
from . import personality as personalities
from . import user_file

QUESTIONS = {
    "assistant_name": ("What would you like to call me?", "For example: Operator, Sari or Kopi"),
    "name": ("What should I call you?", "Your name or a nickname"),
    "business": ("What does your business do?", "For example: a small coffee shop in Bandung"),
    "help": ("What would you like help with first?", "For example: planning stock for next month"),
    "style": ("How do you like answers?", "For example: short and direct, or step by step"),
}
STEPS = [*QUESTIONS, "summary", "personality", "done"]
# Spoken once to a new account, and shown word for word in the chat as its caption. Fixed text, so
# its audio is made once and reused (voice/welcome.py); change it and the audio is made again.
WELCOME = ("Hi, welcome to Mula. I'm your assistant across every business you run here. "
           "A few quick questions so I can help you better. Skip any you like, or skip them all for now.")
DEFAULT_ASSISTANT_NAME = "Operator"
MAX_ASSISTANT_NAME = 40
# The name is written into the assistant's instructions, so it is kept to a plain name: letters,
# digits, spaces and . ' - only. No line breaks, markup or punctuation that could carry an instruction.
ASSISTANT_NAME = re.compile(r"^[^\W_](?:[^\W_]|[ .'-])*$")
ASSISTANT_TOOLS = ("project_create",)


def row_for(db, account_id, lock=False):
    """The account's onboarding row, made on first use (a new account starts at the first question)."""
    db.execute("INSERT INTO onboarding (account_id, step) VALUES (%s, %s) ON CONFLICT (account_id) DO NOTHING",
               (account_id, STEPS[0]))
    query = "SELECT * FROM onboarding WHERE account_id = %s"
    if lock:
        query += " FOR UPDATE"
    return db.execute(query, (account_id,)).fetchone()


def next_step(step):
    return STEPS[STEPS.index(step) + 1]


def move(db, account_id, step, **ended):
    db.execute('''UPDATE onboarding SET step = %s, completed_at = COALESCE(%s, completed_at),
                  skipped_at = COALESCE(%s, skipped_at), updated_at = now() WHERE account_id = %s''',
               (step, ended.get("completed_at"), ended.get("skipped_at"), account_id))


def expect(row, step):
    """Refuse a change made for a step that isn't the current one."""
    if step not in STEPS:
        raise HTTPException(422, "Unknown onboarding step.")
    if row["step"] != step:
        raise HTTPException(409, "That step is already done. Reload to see where you are.")


def public(row, about):
    status = "active"
    finished = None
    if row["step"] == "done":
        status = "done"
        finished = "completed"
        if row["skipped_at"] is not None and row["completed_at"] is None:
            finished = "skipped"
    return {
        "status": status,
        "finished": finished,
        "step": row["step"],
        "greeting": WELCOME,
        "welcome_pending": row["welcome_heard_at"] is None and row["step"] != "done",
        "assistant_name": display_name(row["assistant_name"]),
        "assistant_name_given": row["assistant_name"] is not None,
        "questions": [{"id": field, "question": text, "placeholder": hint} for field, (text, hint) in QUESTIONS.items()],
        "about": about,
        "personality": row["personality"],
        "personality_options": {key: list(values) for key, values in personalities.OPTIONS.items()},
    }


def state(account_id):
    with database() as db:
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def answer(account_id, step, value):
    with database() as db:
        row = row_for(db, account_id, lock=True)
        expect(row, step)
        if step not in QUESTIONS:
            raise HTTPException(422, "This step has no question to answer.")
        if step == "assistant_name":
            name = clean_assistant_name(value)
            if name is None:
                raise HTTPException(422, "Type a name, or skip this question.")
            db.execute("UPDATE onboarding SET assistant_name = %s WHERE account_id = %s", (name, account_id))
            about = user_file.read_about(account_id)
        else:
            if user_file.clean_answer(step, value) is None:
                raise HTTPException(422, "Type an answer, or skip this question.")
            # Written before the step moves on, so an answer that is refused keeps the question open.
            about = user_file.save_answer(account_id, step, value)
        move(db, account_id, next_step(step))
        row = row_for(db, account_id)
    return public(row, about)


def skip(account_id, step):
    """Skip one step: a question keeps whatever USER.md already has, the summary is accepted as it
    is, and skipping the personality finishes onboarding with the current one."""
    with database() as db:
        row = row_for(db, account_id, lock=True)
        expect(row, step)
        if step == "done":
            raise HTTPException(409, "Onboarding is already finished.")
        if step == "personality":
            move(db, account_id, "done", completed_at=now(db))
        else:
            move(db, account_id, next_step(step))
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def skip_all(account_id):
    """"Skip for now": end onboarding wherever it is. Answers given so far stay in USER.md."""
    with database() as db:
        row = row_for(db, account_id, lock=True)
        if row["step"] != "done":
            move(db, account_id, "done", skipped_at=now(db))
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def confirm_summary(account_id, answers):
    """Accept the summary, with the owner's edits when `answers` is given."""
    with database() as db:
        row = row_for(db, account_id, lock=True)
        expect(row, "summary")
        if answers is None:
            about = user_file.read_about(account_id)
        else:
            about = user_file.save_all(account_id, answers)
        move(db, account_id, "personality")
        row = row_for(db, account_id)
    return public(row, about)


def choose_personality(account_id, choices):
    """The onboarding's last step: keep the choices and finish."""
    cleaned = personalities.clean(choices)
    with database() as db:
        row = row_for(db, account_id, lock=True)
        expect(row, "personality")
        db.execute("UPDATE onboarding SET personality = %s WHERE account_id = %s", (Jsonb(cleaned), account_id))
        move(db, account_id, "done", completed_at=now(db))
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def set_personality(account_id, choices):
    """Change the personality later, from Settings, whatever step onboarding is at."""
    cleaned = personalities.clean(choices)
    with database() as db:
        row_for(db, account_id, lock=True)
        db.execute("UPDATE onboarding SET personality = %s, updated_at = now() WHERE account_id = %s",
                   (Jsonb(cleaned), account_id))
    return cleaned


def personality_of(account_id):
    with database() as db:
        return row_for(db, account_id)["personality"]


def restart(account_id):
    """Start the questions again (Settings). USER.md keeps its answers until they are replaced."""
    with database() as db:
        row_for(db, account_id, lock=True)
        db.execute('''UPDATE onboarding SET step = %s, completed_at = NULL, skipped_at = NULL, updated_at = now()
                      WHERE account_id = %s''', (STEPS[0], account_id))
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def clean_assistant_name(value):
    """The assistant's name as it will be kept: trimmed, single spaces, or None for none given."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(422, "The name must be text.")
    name = " ".join(value.split())
    if not name:
        return None
    if len(name) > MAX_ASSISTANT_NAME:
        raise HTTPException(422, f"Keep the name to {MAX_ASSISTANT_NAME} characters.")
    if not ASSISTANT_NAME.match(name):
        raise HTTPException(422, "Use letters, numbers and spaces for the name.")
    return name


def display_name(stored):
    if stored is None:
        return DEFAULT_ASSISTANT_NAME
    return stored


def mark_welcome_heard(account_id):
    """The spoken welcome has started (or the owner chose to read it): it never plays again."""
    with database() as db:
        row_for(db, account_id)
        db.execute("UPDATE onboarding SET welcome_heard_at = COALESCE(welcome_heard_at, now()) WHERE account_id = %s", (account_id,))
        row = row_for(db, account_id)
    return public(row, user_file.read_about(account_id))


def assistant_settings(account_id):
    """The assistant's name and capabilities, for Settings and for each turn."""
    with database() as db:
        row = row_for(db, account_id)
    tools = [tool for tool in row["assistant_tools"] if tool in ASSISTANT_TOOLS]
    return {
        "name": display_name(row["assistant_name"]),
        "name_given": row["assistant_name"] is not None,
        "default_name": DEFAULT_ASSISTANT_NAME,
        "tools": tools,
    }


def save_assistant_settings(account_id, name, propose_projects):
    """Settings: rename the assistant (blank goes back to the default) and switch proposing projects."""
    cleaned = clean_assistant_name(name)
    tools = []
    if propose_projects:
        tools.append("project_create")
    with database() as db:
        row_for(db, account_id, lock=True)
        db.execute("UPDATE onboarding SET assistant_name = %s, assistant_tools = %s, updated_at = now() WHERE account_id = %s",
                   (cleaned, Jsonb(tools), account_id))
    return assistant_settings(account_id)


def now(db):
    return db.execute("SELECT now() AS at").fetchone()["at"]
