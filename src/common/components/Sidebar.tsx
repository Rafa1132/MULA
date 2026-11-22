"use client";

import Icon from "./Icon";
import ProjectSwitcher from "./ProjectSwitcher";
import { useProjectId } from "../hooks/useProjectId";
import { projectPath } from "../services/project";

type Section = "workspace" | "board" | "catalogue" | "apps" | "inventory" | "team" | "memory";

type Props = {
  // "workspace" is the project's chat, kept under its old name so callers don't change.
  active: Section;
  username: string;
  onSignOut: () => void;
  busy?: boolean;
};

const ITEMS: { section: Section; path: string; icon: "home" | "board" | "catalogue" | "app" | "tool" | "team" | "memory"; label: string }[] = [
  { section: "workspace", path: "", icon: "home", label: "Chat" },
  { section: "board", path: "/board", icon: "board", label: "Board" },
  { section: "catalogue", path: "/catalogue", icon: "catalogue", label: "Catalogue" },
  { section: "apps", path: "/apps", icon: "app", label: "My apps" },
  { section: "inventory", path: "/inventory", icon: "tool", label: "Inventory" },
  { section: "team", path: "/agents", icon: "team", label: "My agents" },
  { section: "memory", path: "/memory", icon: "memory", label: "Memory" },
];

/** The project page's left side: the project switcher, the project's sections, and the account. */
export default function Sidebar({ active, username, onSignOut, busy = false }: Props) {
  const projectId = useProjectId();
  let section = "";
  const current = ITEMS.find((item) => item.section === active);
  if (current) section = current.path;
  return (
      <aside className="sidebar">
        <ProjectSwitcher section={section} />
        <nav aria-label="Project">
          {ITEMS.map((item) => {
            let className = "nav-item";
            let ariaCurrent: "page" | undefined;
            if (item.section === active) {
              className += " active-nav";
              ariaCurrent = "page";
            }
            return <a key={item.section} className={className} href={projectPath(projectId, item.path)} aria-current={ariaCurrent}><Icon name={item.icon} />{item.label}</a>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{username.slice(0, 1).toUpperCase()}</span>
          <strong>{username}</strong>
          <button className="icon-button signout" aria-label="Sign out" onClick={onSignOut} disabled={busy}><Icon name="exit" /></button>
        </div>
      </aside>
  );
}
