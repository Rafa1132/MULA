# Agents

One Markdown file per agent. The file name is the agent's id (`operator.md` is `operator`). The backend reads this folder once at startup (`src/common/agent_catalog.py`) and refuses to start if a file is broken, naming the file and the problem. Restart the backend after an edit.

Each file is YAML front matter between two `---` lines, then the persona: the start of the agent's system prompt, used exactly as written.

```markdown
---
name: Forecasting                 # shown in My agents
description: Turn a sales history into a forecast.
order: 2                          # display order; lower comes first
capabilities:                     # switches the owner sees in My agents (id: label), at most 10
  naive: Last value
runtime_tools: [ask_agent, calculate_forecast, latest_forecast]   # Mula tools from the backend's /mcp server
runtime_toolsets: [todo, session_search]   # runtime toolsets the owner may switch on; safe set only
delegates_to:                     # agents this one may ask (A2A), with the default mode; needs ask_agent
  operator: none                  # ask, auto, off or none (not connected until the owner connects it)
---
You are Mula's Forecasting agent...
```

All seven keys are required, and unknown keys are refused so a typo cannot be silently ignored.

These files are the defaults every project starts from. What an owner changes in My agents (extra instructions, reference data, switched-off capabilities, brain, connections, runtime tools) is stored per account in the database and added after the persona.

## What a file can and cannot do

- Editing a persona, a name, a description or a capability label needs no code change.
- `runtime_tools` can only name tools the backend serves (`ask_agent`, `remember`, `calculate_forecast`, `latest_forecast`). A new tool is code in `src/features/agents/tools.py`. `create_project` is served too, but only to the workspace assistant, so an agent file can't name it.
- `runtime_toolsets` can only name the safe set in `src/common/agent_catalog.py` (`web`, `vision`, `image_gen`, `todo`, `session_search`). A file naming `terminal`, `file` or any other toolset is refused at startup. Everything starts switched off.
- `delegates_to` is a mapping of agent id to default mode, and is the ceiling: the owner can't connect an agent to one the file doesn't list. An agent id is at most 26 characters, so its runtime profile name fits.
- A capability id only does something when code checks it with `team.require_tool`. A new id appears as a switch but has no effect on its own.
- A new agent file is served by the backend API, but the web app still allows only `operator` and `forecasting` in its proxies and has screens specific to each. A new agent needs that frontend work before owners can use it.
