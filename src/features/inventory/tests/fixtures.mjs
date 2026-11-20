// Shared test data: a project and two /api/team agents with the shapes the server sends.
export const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const BRAINS = {
  local: { name: "Local model", description: "Runs here.", location: "local", host: "this computer", status: "ready" },
  claude: { name: "Claude", description: "Anthropic's model.", location: "cloud", host: "Anthropic", setup_script: "enable_claude.py", setup_key: "ANTHROPIC_API_KEY", status: "needs_setup" },
  openrouter: { name: "OpenRouter", description: "Many models.", location: "cloud", host: "OpenRouter · Chutes", status: "ready" },
};

export const TEAM = [
  {
    id: "operator", name: "Operator", brain: "local",
    available_tools: { csv_read: "Read CSV files", memory_read: "Read memory", memory_write: "Save to memory" },
    available_toolsets: ["web", "todo"],
    toolset_status: { web: { status: "needs_setup", note: "Needs a search API key." }, todo: { status: "ready", note: "" } },
    available_brains: BRAINS,
  },
  {
    id: "forecasting", name: "Forecasting", brain: "openrouter",
    available_tools: { naive: "Naive", csv_read: "Read CSV files" },
    available_toolsets: ["todo"],
    toolset_status: { todo: { status: "ready", note: "" } },
    available_brains: BRAINS,
  },
];
