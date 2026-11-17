// Stamina: the tokens an agent has left for the current period, shown as a segmented bar on its card.
export type Stamina = { used: number; limit: number | null };

export const STAMINA_SEGMENTS = 10;
// Below this share remaining, the card says "Low" in words and with an icon, not only by colour.
export const LOW_STAMINA_SHARE = 0.2;
export const STAMINA_EXPLANATION = "Stamina is how many tokens this agent can still use this period.";

// The server doesn't send stamina yet; until it does, every agent is unlimited.
export const UNLIMITED: Stamina = { used: 0, limit: null };

export type StaminaView = {
  unlimited: boolean;
  // Share of the period's tokens still available, 0–1 (1 when unlimited).
  remaining: number;
  // Filled segments out of STAMINA_SEGMENTS.
  filled: number;
  low: boolean;
  label: string;
  // Tokens left and the period's limit; null when unlimited.
  left: number | null;
  limit: number | null;
  // The value alone, for a meter's aria-valuetext, for example "12k of 50k tokens left, low".
  valueText: string;
  // What a screen reader hears, for example "Stamina: 12k of 50k tokens left, low".
  spoken: string;
};

/** Accept only a well-formed value; anything else (missing, negative, not a number) counts as unlimited. */
export function staminaOf(value: unknown): Stamina {
  if (typeof value !== "object" || value === null) return UNLIMITED;
  const { used, limit } = value as { used?: unknown; limit?: unknown };
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return UNLIMITED;
  if (limit === null) return { used, limit: null };
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return UNLIMITED;
  return { used, limit };
}

/** Short token counts: 950, 12k, 1.5M. */
export function formatTokens(amount: number) {
  const value = Math.max(0, Math.round(amount));
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trim(value / 1_000)}k`;
  return String(value);
}

export function staminaView(stamina: Stamina): StaminaView {
  if (stamina.limit === null) {
    return { unlimited: true, remaining: 1, filled: STAMINA_SEGMENTS, low: false, label: "Unlimited", left: null, limit: null, valueText: "unlimited", spoken: "Stamina: unlimited" };
  }
  const left = Math.max(0, stamina.limit - stamina.used);
  const remaining = left / stamina.limit;
  // Round up so any tokens left still show one segment; an empty bar means none at all.
  const filled = Math.ceil(remaining * STAMINA_SEGMENTS);
  const low = remaining < LOW_STAMINA_SHARE;
  const label = `${formatTokens(left)} / ${formatTokens(stamina.limit)} left`;
  let valueText = `${formatTokens(left)} of ${formatTokens(stamina.limit)} tokens left`;
  if (low) valueText += ", low";
  return { unlimited: false, remaining, filled, low, label, left, limit: stamina.limit, valueText, spoken: `Stamina: ${valueText}` };
}

// One decimal at most, without a trailing ".0".
function trim(value: number) {
  if (value >= 10) return String(Math.floor(value));
  return String(Math.floor(value * 10) / 10);
}
