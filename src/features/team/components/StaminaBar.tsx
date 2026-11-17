import { Icon } from "@/common/components";
import type { CSSProperties } from "react";
import { STAMINA_EXPLANATION, STAMINA_SEGMENTS, StaminaView } from "../services/stamina";

type Props = {
  view: StaminaView;
  // On a map card, the id of the hidden text the card's aria-describedby points to.
  id?: string;
  // In the settings panel the bar stands alone and is exposed as a meter (or an image when unlimited).
  standalone?: boolean;
};

// Shown on hover. Unlimited bars carry no visible label, so the tooltip says it in words.
const UNLIMITED_TITLE = "Unlimited stamina. " + STAMINA_EXPLANATION;

/**
 * A segmented pixel bar. With a limit it shows the share of tokens left and a label such as
 * "12k / 50k left". Unlimited bars have no label: every segment glows purple with energy flowing
 * through it, so the bar itself says "unlimited" and sits centred on its card.
 */
export default function StaminaBar({ view, id, standalone = false }: Props) {
  // Each segment knows its place, so the energy wave can travel through them one after another.
  const cells = Array.from({ length: STAMINA_SEGMENTS }, (_, index) =>
    <span key={index} className="stamina-cell" data-filled={index < view.filled} style={{ "--cell": index } as CSSProperties} />);
  let label = null;
  if (!view.unlimited) {
    label = <span className="stamina-label" aria-hidden="true">
      <span>{view.label}</span>
      {view.low && <span className="stamina-low"><Icon name="attention" />Low</span>}
    </span>;
  }
  const visual = <>
    <span className="stamina-track" aria-hidden="true">{cells}</span>
    {label}
  </>;
  let title = STAMINA_EXPLANATION;
  if (view.unlimited) title = UNLIMITED_TITLE;

  if (standalone && view.unlimited) {
    return <div className="stamina" data-unlimited="true" title={title} role="img" aria-label={view.spoken}>{visual}</div>;
  }
  if (standalone) {
    return <div className="stamina" data-low={view.low} role="meter" aria-label="Stamina"
      aria-valuemin={0} aria-valuemax={view.limit ?? 0} aria-valuenow={view.left ?? 0} aria-valuetext={view.valueText}>{visual}</div>;
  }
  // Inside a card (a button), roles are flattened, so the card reads this text as its description.
  return <span className="stamina" data-low={view.low} data-unlimited={view.unlimited} title={title}>
    {visual}
    <span id={id} className="sr-only">{view.spoken}</span>
  </span>;
}
