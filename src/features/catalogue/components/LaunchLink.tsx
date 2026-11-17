import { Icon } from "@/common/components";
import "../launch-link.css";

type Props = {
  href: string;
  className: string;
  /** The visible words, such as "Open" or "Open To-do". */
  label: string;
  /** Extra words for screen readers only, such as the app's name when `label` is just "Open". */
  hiddenContext?: string;
};

/**
 * Opens an app in a new tab. A real link, so middle-click and "Copy link" work too.
 * The icon shows it opens elsewhere; screen readers hear "(opens in a new tab)".
 */
export default function LaunchLink({ href, className, label, hiddenContext }: Props) {
  let context = "";
  if (hiddenContext) context = ` ${hiddenContext}`;
  return (
    <a className={`${className} launch-link`} href={href} target="_blank" rel="noopener noreferrer">
      {label}
      <span className="sr-only">{context} (opens in a new tab)</span>
      <Icon name="external" />
    </a>
  );
}
