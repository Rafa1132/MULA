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
runtime_tools: [calculate_forecast, latest_forecast]   # Mula tools from the backend's /mcp server
delegates_to: []                  # agents this one may ask; needs ask_agent in runtime_tools
---
You are Mula's Forecasting agent...
```

All six keys are required, and unknown keys are refused so a typo cannot be silently ignored.

These files are the defaults every account starts from. What an owner changes in My agents (extra instructions, reference data, switched-off capabilities, brain, delegation) is stored per account in the database and added after the persona.

## What a file can and cannot do

- Editing a persona, a name, a description or a capability label needs no code change.
- `runtime_tools` can only name tools the backend serves (`ask_agent`, `remember`, `calculate_forecast`, `latest_forecast`). A new tool is code in `src/features/agents/tools.py`.
- A capability id only does something when code checks it with `team.require_tool`. A new id appears as a switch but has no effect on its own.
- A new agent file is served by the backend API, but the web app still allows only `operator` and `forecasting` in its proxies and has screens specific to each. A new agent needs that frontend work before owners can use it.
