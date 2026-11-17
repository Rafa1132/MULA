"use client";

import { DEFAULT_FILTER, FolderStyle, MapFilter } from "../services/graph";
import { FolderSwatch } from "./MapLegend";

type Props = {
  filter: MapFilter;
  onChange: (filter: MapFilter) => void;
  folders: FolderStyle[];
  tags: { tag: string; count: number }[];
  // The note the local graph centres on: the one last opened in Folders or on the map.
  focusTitle: string | null;
};

function without(list: string[], item: string) {
  return list.filter((each) => each !== item);
}

/** What the map shows: folders, a tag, links to notes not created yet, notes with no links, the local graph. */
export default function MapFilters({ filter, onChange, folders, tags, focusTitle }: Props) {
  function toggleFolder(folder: string, shown: boolean) {
    let hiddenFolders = without(filter.hiddenFolders, folder);
    if (!shown) hiddenFolders = [...hiddenFolders, folder];
    onChange({ ...filter, hiddenFolders });
  }

  function chooseTag(value: string) {
    let tag: string | null = value;
    if (value === "") tag = null;
    onChange({ ...filter, tag });
  }

  function chooseDepth(value: string) {
    let depth: 1 | 2 = 1;
    if (value === "2") depth = 2;
    onChange({ ...filter, depth });
  }

  return <form className="graph-filters" onSubmit={(event) => event.preventDefault()}>
    <fieldset>
      <legend>Folders</legend>
      {folders.map((style) => <label key={style.folder} className="graph-check">
        <input type="checkbox" checked={!filter.hiddenFolders.includes(style.folder)} onChange={(event) => toggleFolder(style.folder, event.target.checked)} />
        <FolderSwatch style={style} />
        <span>{style.folder}</span>
        <span className="graph-count">{style.count}</span>
      </label>)}
    </fieldset>
    <label className="graph-field">
      <span>Tag</span>
      <select value={filter.tag ?? ""} onChange={(event) => chooseTag(event.target.value)}>
        <option value="">Every tag</option>
        {tags.map((entry) => <option key={entry.tag} value={entry.tag}>#{entry.tag} ({entry.count})</option>)}
      </select>
    </label>
    <fieldset>
      <legend>Also show</legend>
      <label className="graph-check">
        <input type="checkbox" checked={filter.ghosts} onChange={(event) => onChange({ ...filter, ghosts: event.target.checked })} />
        <span>Links to notes not created yet</span>
      </label>
      <label className="graph-check">
        <input type="checkbox" checked={filter.orphans} onChange={(event) => onChange({ ...filter, orphans: event.target.checked })} />
        <span>Notes with no links</span>
      </label>
    </fieldset>
    <fieldset>
      <legend>Local graph</legend>
      <label className="graph-check">
        <input type="checkbox" checked={filter.local && focusTitle !== null} disabled={focusTitle === null}
          aria-describedby="graph-local-help" onChange={(event) => onChange({ ...filter, local: event.target.checked })} />
        <span>Only notes near the open note</span>
      </label>
      <p id="graph-local-help" className="graph-help">
        {focusTitle === null && "Open a note in Folders, or select one on the map, to centre on it."}
        {focusTitle !== null && <>Centred on <strong>{focusTitle}</strong>.</>}
      </p>
      <label className="graph-field">
        <span>Reach</span>
        <select value={String(filter.depth)} disabled={!filter.local || focusTitle === null} onChange={(event) => chooseDepth(event.target.value)}>
          <option value="1">1 link away</option>
          <option value="2">2 links away</option>
        </select>
      </label>
    </fieldset>
    <button type="button" className="text-button" onClick={() => onChange(DEFAULT_FILTER)}>Reset filters</button>
  </form>;
}
