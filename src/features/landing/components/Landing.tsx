import { MulaLogo } from "@/common/components";
import LandingActions from "./LandingActions";
import "../landing.css";

// The steps describe what the product does today; numbers, customers and claims are left as
// [PLACEHOLDER] until there are real ones to state.
const STEPS = [
  { title: "Tell Mula about you", text: "A short chat on your first visit: your name, your business and how you like answers. Every question can be skipped." },
  { title: "Add your businesses", text: "Each project is one business, with its own agents, memory and apps. Nothing is shared between them." },
  { title: "Work with your assistant", text: "Your personal assistant knows you across every project you can open, and each project's agents handle its day-to-day work." },
];

/** The public front page: what Mula is, how it works, and the way in. */
export default function Landing() {
  return <div className="landing">
    <header className="landing-header">
      <a href="/" className="landing-brand" aria-label="Mula home"><MulaLogo /></a>
      <LandingActions place="header" />
    </header>
    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="landing-eyebrow">A workspace for small businesses</p>
        <h1 id="landing-title">A little clarity for your everyday operations.</h1>
        <p className="landing-lead">Mula gives you a personal assistant that remembers you, and a team of agents for each business you run. [PLACEHOLDER: one-line value statement]</p>
        <LandingActions place="hero" />
        <div className="landing-orb" aria-hidden="true" />
      </section>
      <section className="landing-steps" aria-labelledby="landing-how">
        <h2 id="landing-how">How it works</h2>
        <ol>
          {STEPS.map((step, index) => <li key={step.title}>
            <span className="landing-step-number" aria-hidden="true">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>)}
        </ol>
      </section>
      <section className="landing-note" aria-labelledby="landing-proof">
        <h2 id="landing-proof">Who it is for</h2>
        <p>[PLACEHOLDER: who uses Mula and what they get from it, once there are real examples to quote.]</p>
      </section>
    </main>
    <footer className="landing-footer">
      <p>© [PLACEHOLDER: year and company name]</p>
      <a href="/login">Log in</a>
    </footer>
  </div>;
}
