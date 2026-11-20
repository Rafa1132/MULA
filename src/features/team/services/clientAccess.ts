// Setup text for Agent Client Protocol clients (see components/ClientAccess.tsx and
// server/scripts/mula_acp.py). Kept apart from the component so it can be unit-tested.

// The backend address the bridge talks to; change it in the editor's settings if Mula runs elsewhere.
export const BACKEND_URL = "http://127.0.0.1:8000";

/** The editor settings for one key: Zed's agent_servers entry, which other clients mirror. */
export function zedSettings(agentName: string, key: string) {
  return JSON.stringify({
    agent_servers: {
      [`Mula ${agentName}`]: {
        command: "/path/to/LARAS/server/.venv/bin/python",
        args: ["/path/to/LARAS/server/scripts/mula_acp.py"],
        // The key travels in the environment, never in args, so it doesn't show in process lists.
        env: { MULA_URL: BACKEND_URL, MULA_CLIENT_KEY: key },
      },
    },
  }, null, 2);
}
