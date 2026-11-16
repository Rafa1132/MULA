import Icon from "./Icon";

type Props = {
  active: "workspace" | "catalogue" | "apps" | "team" | "memory";
  username: string;
  onSignOut: () => void;
  busy?: boolean;
};

export default function Sidebar({ active, username, onSignOut, busy = false }: Props) {
  let workspaceClass = "nav-item";
  let teamClass = "nav-item";
  let memoryClass = "nav-item";
  let catalogueClass = "nav-item";
  let catalogueCurrent: "page" | undefined;
  let appsClass = "nav-item";
  let appsCurrent: "page" | undefined;
  let memoryCurrent: "page" | undefined;
  let workspaceCurrent: "page" | undefined;
  let teamCurrent: "page" | undefined;
  if (active === "workspace") { workspaceClass += " active-nav"; workspaceCurrent = "page"; }
  if (active === "catalogue") { catalogueClass += " active-nav"; catalogueCurrent = "page"; }
  if (active === "apps") { appsClass += " active-nav"; appsCurrent = "page"; }
  if (active === "team") { teamClass += " active-nav"; teamCurrent = "page"; }
  if (active === "memory") { memoryClass += " active-nav"; memoryCurrent = "page"; }
  return (
      <aside className="sidebar">
        <a className="brand" href="/"><span className="brand-word">WORKSPACE</span></a>
        <nav aria-label="Main navigation">
          <a className={workspaceClass} href="/" aria-current={workspaceCurrent}><Icon name="home" />Chat</a>
          <a className={catalogueClass} href="/catalogue" aria-current={catalogueCurrent}><Icon name="catalogue" />Catalogue</a>
          <a className={appsClass} href="/apps" aria-current={appsCurrent}><Icon name="app" />My apps</a>
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
