import { CATALOGUE_ENTRIES } from "../data.ts";
import type { Price } from "../data.ts";

/** The entry with this id, or undefined. */
export function findEntry(id: string) {
  return CATALOGUE_ENTRIES.find((entry) => entry.id === id);
}

/**
 * "Free" for 0, otherwise the amount in its currency, such as "Rp 49.000". Paid apps
 * need only a data change. An unknown currency code falls back to "49000 XYZ".
 */
export function formatPrice(price: Price) {
  if (price.amount === 0) return "Free";
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: price.currency, maximumFractionDigits: 0 }).format(price.amount);
  } catch (error) {
    console.warn(`Unknown currency ${price.currency}; showing the plain amount.`, error);
    return `${price.amount} ${price.currency}`;
  }
}

/** The carousel position after moving `step` from `index`, wrapping at both ends. */
export function wrapIndex(index: number, step: number, count: number) {
  if (count <= 0) return 0;
  return (((index + step) % count) + count) % count;
}
