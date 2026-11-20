"""The orchestrator's personality: a few fixed choices, and the SOUL.md rendered from them.

The choices are stored in `onboarding.personality`; SOUL.md in the orchestrator's runtime profile
is rendered from them on every turn (runtime.chat's `identity`), so a profile refresh by
provision_profiles.py, which writes the shared identity, never loses them.
"""
from fastapi import HTTPException

from ...common import profiles

OPTIONS = {
    "tone": {"warm": "Warm and encouraging.", "neutral": "Calm and matter-of-fact.", "playful": "Light and playful, never at the owner's expense."},
    "formality": {"casual": "Casual, like a trusted colleague.", "formal": "Formal and polite."},
    "language": {"en": "Reply in English unless the owner writes in another language.",
                 "id": "Reply in Bahasa Indonesia unless the owner writes in another language."},
    "emoji": {"none": "Don't use emoji.", "some": "An occasional emoji is fine."},
}
DEFAULT = {"tone": "warm", "formality": "casual", "language": "en", "emoji": "none"}

ROLE = """
## Your role

You are the owner's personal assistant across all of their projects in Mula. Each project is a
separate business with its own agents and memory; you sit above them. You know the owner from
their profile (USER.md) and you can read a short summary of each project they can open, both
supplied with every message. You cannot change an existing project, run its agents or see anything
outside those summaries; when a task belongs to one project, say which and suggest opening it.

You can propose a new project when the owner asks for one, if your instructions for the message
say the tool is on. A proposal creates nothing: the owner confirms it with a button.

Keep the owner's profile private: never repeat it as a whole, and never ask for passwords, card or
ID numbers, or other people's contact details.
"""


def clean(choices):
    """The four choices, each one of OPTIONS; anything missing takes the default."""
    if not isinstance(choices, dict):
        raise HTTPException(422, "Send the personality as an object.")
    unknown = set(choices) - set(OPTIONS)
    if unknown:
        raise HTTPException(422, "Unknown personality setting.")
    cleaned = {}
    for key, allowed in OPTIONS.items():
        value = choices.get(key)
        if value is None:
            value = DEFAULT[key]
        if value not in allowed:
            raise HTTPException(422, f"Choose one of the listed options for {key}.")
        cleaned[key] = value
    return cleaned


def render_soul(choices, name):
    """SOUL.md for the orchestrator: the shared identity, its name and role, and the personality.

    `name` is the owner's chosen name for it, already checked by onboarding.clean_assistant_name
    (a plain name only), or the default.
    """
    if choices is None:
        choices = DEFAULT
    identity = profiles.IDENTITY.read_text(encoding="utf-8").rstrip() + "\n"
    naming = f"\n## Your name\n\nThe owner calls you {name}. Use this name when you introduce yourself.\n"
    lines = [f"- {OPTIONS[key][choices[key]]}" for key in OPTIONS]
    return identity + naming + ROLE + "\n## Personality\n\n" + "\n".join(lines) + "\n"
