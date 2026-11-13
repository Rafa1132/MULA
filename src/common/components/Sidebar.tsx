import Icon from "./Icon";
import MulaLogo from "./MulaLogo";

type Props = {
  active: "workspace" | "team" | "memory";
  username: string;
  onSignOut: () => void;
  busy?: boolean;
};

export default function Sidebar({ active, username, onSignOut, busy = false }: Props) {
  let workspaceClass = "nav-item";
  let teamClass = "nav-item";
  let memoryClass = "nav-item";
  let memoryCurrent: "page" | undefined;
  let workspaceCurrent: "page" | undefined;
  let teamCurrent: "page" | undefined;
  if (active === "workspace") { workspaceClass += " active-nav"; workspaceCurrent = "page"; }
  if (active === "team") { teamClass += " active-nav"; teamCurrent = "page"; }
  if (active === "memory") { memoryClass += " active-nav"; memoryCurrent = "page"; }
  return (
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Mula home"><MulaLogo /></a>
        <nav aria-label="Main navigation">
          <a className={workspaceClass} href="/" aria-current={workspaceCurrent}><Icon name="home" />Workspace</a>
          <button className="nav-item" disabled title="Reports are coming soon"><Icon name="report" />Reports<span className="soon">Soon</span></button>
          <button className="nav-item" disabled title="Website builder is coming soon"><Icon name="website" />My website<span className="soon">Soon</span></button>
          <a className={teamClass} href="/agents" aria-current={teamCurrent}><Icon name="team" />My agents</a>
          <a className={memoryClass} href="/memory" aria-current={memoryCurrent}><Icon name="memory" />Memory</a>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{username.slice(0, 1).toUpperCase()}</span>
          <strong>{username}</strong>
          <button className="icon-button signout" aria-label="Sign out" onClick={onSignOut} disabled={busy}><Icon name="exit" /></button>
        </div>
      </aside>
  );
}
