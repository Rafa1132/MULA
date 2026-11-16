"use client";

import type { Ref } from "react";
import "../search-field.css";

type Props = {
  /** The input's id; the result count gets `${id}-count`. */
  id: string;
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Announced politely as the results change, such as "3 results". */
  resultText: string;
  inputRef?: Ref<HTMLInputElement>;
};

/** A labelled search box with a live result count. Escape clears it. Used by Catalogue and My apps. */
export default function SearchField({ id, label, placeholder, query, onQueryChange, resultText, inputRef }: Props) {
  const countId = `${id}-count`;
  return (
    <div className="catalogue-search">
      <label htmlFor={id}>{label}</label>
      <div className="catalogue-search-field">
        <input
          ref={inputRef}
          id={id}
          type="search"
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          aria-describedby={countId}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); onQueryChange(""); } }}
        />
      </div>
      <p id={countId} className="catalogue-count" role="status">{resultText}</p>
    </div>
  );
}
