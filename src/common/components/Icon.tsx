export type IconName = "board" | "microphone" | "memory" | "home" | "report" | "website" | "team" | "send" | "voice" | "muted" | "exit" | "arrow" | "stop" | "plus" | "live" | "options" | "catalogue" | "agent" | "app" | "connected" | "attention" | "unlinked" | "verified" | "edit" | "trash" | "external" | "infinity" | "zoomIn" | "zoomOut" | "fit" | "info" | "repeat" | "trend" | "tool" | "newNote" | "newFolder" | "collapseAll" | "chevron" | "folder";

const paths: Record<IconName, string> = {
  // Three columns of cards, the Board.
  board: "M3 4h18v16H3ZM9 4v16M15 4v16M5 7h2M11 7h2M11 10h2M17 7h2",
  microphone: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  memory: "M4 3h16v18H4ZM8 3v18M12 8h4M12 12h4M12 16h3",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  report: "M5 3h9l5 5v13H5ZM14 3v6h5M9 13h6M9 17h6",
  website: "M3 4h18v16H3ZM3 9h18M6 6.5h.01M9 6.5h.01",
  team: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 3a4 4 0 0 1 0 7M22 21v-3a4 4 0 0 0-3-3.87",
  send: "m4 4 17 8-17 8 3-8ZM7 12h14",
  voice: "M4 9h4l5-5v16l-5-5H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14",
  muted: "M4 9h4l5-5v16l-5-5H4ZM17 9l5 6M22 9l-5 6",
  exit: "M10 4H4v16h6M14 8l4 4-4 4M8 12h13",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  stop: "M6 6h12v12H6Z",
  plus: "M12 5v14M5 12h14",
  // The Memory page's file explorer, as in Obsidian: a page with a plus, a folder with a plus, and chevrons folding in.
  newNote: "M14 3H6v18h12V7ZM14 3v4h4M12 11v6M9 14h6",
  newFolder: "M3 6h6l2 2h10v12H3ZM12 11v6M9 14h6",
  collapseAll: "M7 4l5 5 5-5M7 20l5-5 5 5",
  // The project switcher's "opens a list" mark, and a project card.
  chevron: "m7 10 5 5 5-5",
  folder: "M3 6h6l2 2h10v12H3Z",
  live: "M4 11v2M8 8v8M12 4v16M16 8v8M20 11v2",
  options: "M4 7h9M17 7h3M15 4v6M4 17h3M11 17h9M9 14v6",
  // An open book, for the Catalogue of agents and apps.
  catalogue: "M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2ZM22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7Z",
  // A person, for "Agent" badges.
  agent: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",
  // Four tiles, for "App" badges.
  app: "M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z",
  // App connection states on My apps: a ticked circle, a warning triangle, a broken link.
  connected: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M8 12l3 3 5-6",
  attention: "M12 3 2 20h20ZM12 10v4M12 17h.01",
  // A rosette with a tick, for verified publishers.
  verified: "M12 2.5l2.3 1.9 3-.3.9 2.9 2.6 1.5-1 2.8 1 2.8-2.6 1.5-.9 2.9-3-.3L12 21.5l-2.3-1.9-3 .3-.9-2.9-2.6-1.5 1-2.8-1-2.8 2.6-1.5.9-2.9 3 .3ZM8.5 12l2.4 2.4 4.6-4.8",
  // A box with an arrow leaving it: "opens in a new tab".
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  edit: "M4 20h4L19 9l-4-4L4 16ZM13.5 6.5l4 4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  // Map view controls and the stamina bar.
  infinity: "M12 12c-2-2.5-3.5-4-6-4a4 4 0 0 0 0 8c2.5 0 4-1.5 6-4c2 2.5 3.5 4 6 4a4 4 0 0 0 0-8c-2.5 0-4 1.5-6 4",
  zoomIn: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4M8 11h6M11 8v6",
  zoomOut: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4M8 11h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01",
  // Tool cards in the agent settings panel.
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  trend: "M3 17l6-6 4 4 8-8M14 7h7v7",
  tool: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4Z",
  unlinked: "M9 15l-1.5 1.5a3.5 3.5 0 0 1-5-5L5 9M15 9l1.5-1.5a3.5 3.5 0 0 1 5 5L19 15M8 4v3M4 8h3M16 20v-3M20 16h-3",
};

export default function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
