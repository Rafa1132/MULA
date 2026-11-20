"""Agent cards, generated from the agent files in server/agents/ (common/agent_catalog.py).

A card is what one agent knows about another before asking it: its name, what it is for, what it
can do and what it accepts. Cards are never written by hand, so they cannot drift from the files.
"""
from ...common.agent_catalog import CATALOG
from .schema import AgentCard, AgentSkill

# Every agent answers in text; delegated questions may carry the CSV attached to the turn.
INPUT_MODES = ["text/plain", "text/csv"]
OUTPUT_MODES = ["text/plain", "application/json"]


def card_for(agent_id: str) -> AgentCard:
    """The card for one agent in the catalog. KeyError for an unknown id."""
    agent = CATALOG[agent_id]
    # The agent's role is its main skill; each capability the owner can switch on is another one.
    skills = [AgentSkill(id=agent_id, name=agent["name"], description=agent["description"], tags=["role"])]
    for capability, label in agent["capabilities"].items():
        skills.append(AgentSkill(id=capability, name=label, description=f"{label}, when the owner has switched it on in My agents.", tags=["capability"]))
    return AgentCard(
        name=agent["name"],
        description=agent["description"],
        url=f"mula://agents/{agent_id}",
        version=agent["version"],
        default_input_modes=INPUT_MODES,
        default_output_modes=OUTPUT_MODES,
        skills=skills,
    )
