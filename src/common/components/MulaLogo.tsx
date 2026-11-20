// The wordmark is two transparent PNG masks (public/mula-wordmark.png and mula-star.png) that
// CSS paints with the theme's ink and the brand green, so the logo reads on the light and the
// dark theme alike. See `.mula-logo` in globals.css.
export default function MulaLogo() {
  return (
    <span className="mula-logo" role="img" aria-label="Mula">
      <span className="mula-logo-word" aria-hidden="true" />
      <span className="mula-logo-star" aria-hidden="true" />
    </span>
  );
}
