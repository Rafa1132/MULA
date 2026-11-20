// How each owner-toggleable tool looks in the settings panel. Names come from the server
// (available_tools); this adds an icon and a one-line description. Unknown ids get a generic entry,
// so a tool added on the server still shows up.
import type { IconName } from "@/common/components/Icon";

type ToolInfo = { icon: IconName; description: string };

const TOOLS: Record<string, ToolInfo> = {
  csv_read: { icon: "report", description: "Reads CSV files you attach to a message." },
  memory_read: { icon: "memory", description: "Looks up facts saved in your account memory." },
  memory_write: { icon: "edit", description: "Saves a fact when you ask it to remember something." },
  naive: { icon: "arrow", description: "Repeats the latest value as the forecast." },
  moving_average: { icon: "live", description: "Averages recent periods to smooth out noise." },
  exponential_smoothing: { icon: "options", description: "Gives recent periods more weight than older ones." },
  seasonal_naive: { icon: "repeat", description: "Repeats last season's pattern, such as last week." },
  drift: { icon: "trend", description: "Continues the overall trend of the history." },
  explain: { icon: "agent", description: "Explains forecast results in everyday words." },
};
const FALLBACK: ToolInfo = { icon: "tool", description: "A capability this agent can use." };

export function toolInfo(id: string): ToolInfo {
  return TOOLS[id] ?? FALLBACK;
}

// How each of the runtime's own toolsets looks in the settings panel. The ids, tool names and
// readiness come from the server (available_toolsets, toolset_tools, toolset_status).
const TOOLSETS: Record<string, { name: string; icon: IconName }> = {
  web: { name: "Web search", icon: "website" },
  vision: { name: "Image understanding", icon: "info" },
  image_gen: { name: "Image generation", icon: "app" },
  todo: { name: "Task list", icon: "report" },
  session_search: { name: "Past conversation search", icon: "memory" },
};

export function toolsetInfo(id: string) {
  return TOOLSETS[id] ?? { name: id, icon: "tool" as IconName };
}
