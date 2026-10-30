import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowDown, ArrowUpRight, ChartNoAxesCombined, CodeXml, GitBranch, ScanLine, Sparkles, Waypoints } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import DataLandscape from "@/components/landing/DataLandscape";
import LandingMotion from "@/components/landing/LandingMotion";
import styles from "@/components/landing/landing.module.css";

const FEATURES = [
  { Icon: CodeXml, title: "Code Intelligence", description: "Your code tells a story. Aletsch maps your routes, components, and interactions to find the moments worth measuring.", number: "01" },
  { Icon: ScanLine, title: "Automatic Instrumentation", description: "Go from a connected repository to a clear tracking plan. Review generated changes and bring your events to life.", number: "02" },
  { Icon: ChartNoAxesCombined, title: "A Complete Product View", description: "Follow the entire journey with funnels, retention, and user paths. See where people find value and where they drop off.", number: "03" },
  { Icon: Sparkles, title: "Insights That Move You Forward", description: "Turn real events into your next decision. Discover what changed, understand why it matters, and know where to look next.", number: "04" },
];

const STEPS = [
  { title: "Connect your repository", text: "Give your analytics the context of your code." },
  { title: "Review your instrumentation", text: "See exactly what will be tracked before you ship." },
  { title: "Understand your users", text: "Find the patterns behind every product journey." },
];

function OrbitGraphic() {
  return (
    <svg className={styles.orbitGraphic} viewBox="0 0 640 480" fill="none" aria-hidden="true">
      <defs><radialGradient id="orbit-glow"><stop stopColor="#a6b8ad" stopOpacity=".13" /><stop offset="1" stopColor="#a6b8ad" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="320" cy="240" rx="305" ry="225" fill="url(#orbit-glow)" />
      <g stroke="#dcebd9" strokeOpacity=".23" strokeWidth=".7">
        <circle cx="320" cy="240" r="155" />
        <ellipse cx="320" cy="240" rx="155" ry="55" /><ellipse cx="320" cy="240" rx="155" ry="110" />
        <ellipse cx="320" cy="240" rx="55" ry="155" /><ellipse cx="320" cy="240" rx="110" ry="155" />
        <path d="M165 240h310M320 85v310" />
        <ellipse cx="320" cy="240" rx="265" ry="92" transform="rotate(-28 320 240)" strokeDasharray="2 7" />
        <ellipse cx="320" cy="240" rx="242" ry="108" transform="rotate(28 320 240)" />
      </g>
      <g fill="#ff6046"><circle cx="112" cy="305" r="5" /><circle cx="481" cy="140" r="5" /><circle cx="407" cy="270" r="4" /></g>
      <g fill="#e3efdc"><circle cx="215" cy="186" r="3" /><circle cx="320" cy="85" r="3" /><circle cx="320" cy="395" r="3" /></g>
    </svg>
  );
}

export default async function Home() {
  const { userId } = await auth();
  const signedIn = !!userId;
  const startHref = signedIn ? "/dashboard" : "/sign-up";
  const startLabel = signedIn ? "Open Dashboard" : "Get Started";

  return (
    <LandingMotion>
      <Link className={styles.skipLink} href="#main-content">Skip to content</Link>
      <LandingNav signedIn={signedIn} />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <DataLandscape />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroContent}>
            <h1 id="hero-title"><span className={styles.heroTitleLine} data-hero-line>The new standard</span><span className={styles.heroTitleLine} data-hero-line>in product analytics</span></h1>
            <p data-hero-copy>Understand your users.<br />Build what comes next.</p>
            <Link className={styles.primaryButton} data-hero-copy href="#features">Learn More <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
          <Link className={styles.scrollCue} href="#features" aria-label="Explore Aletsch AI"><ArrowDown size={17} aria-hidden="true" /><span>Discover a clearer picture</span></Link>
        </section>

        <section id="features" className={styles.features} aria-labelledby="features-title">
          <div className={styles.featureIntro}>
            <span className={styles.sectionLabel}>Built for what&apos;s next</span>
            <h2 id="features-title" data-reveal="heading">Let your code take your product to higher ground.</h2>
            <p data-reveal="copy">You&apos;ve built something great. Now understand how people use it. Aletsch connects your code to your analytics, turning everyday interactions into a clearer picture of your product.</p>
            <Link className={styles.textLink} data-reveal="copy" href="#how">Meet your new workflow <ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className={styles.featureCards}>
            {FEATURES.map(({ Icon, title, description, number }) => (
              <div key={title} className={styles.featureCardSlot} data-card-slot>
                <article className={styles.featureCard}>
                  <div className={styles.cardTop}><span className={styles.featureIcon}><Icon size={29} strokeWidth={1.2} aria-hidden="true" /></span><span className={styles.cardNumber}>{number}</span></div>
                  <h3>{title}</h3><p>{description}</p>
                  <div className={styles.cardRule} aria-hidden="true"><span /></div>
                </article>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.workflowVisual}>
            <span className={styles.sectionLabel}>From code to clarity</span>
            <h2 id="workflow-title" data-reveal="heading">Unprecedented clarity.<br />Effortless analytics.</h2>
            <OrbitGraphic />
            <span className={styles.visualCaption}><GitBranch size={15} aria-hidden="true" />Every insight starts with your code.</span>
          </div>
          <div className={styles.workflowContent}>
            <p className={styles.workflowLead} data-reveal="heading">Less time connecting the dots.<br />More time moving forward.</p>
            <p className={styles.bodyCopy} data-reveal="copy">From the first connection to your next product decision, Aletsch brings your workflow together. Analytics grounded in real events, with a clear path back to the source.</p>
            <ol className={styles.steps}>{STEPS.map((step, index) => <li key={step.title} data-reveal="copy"><span className={styles.stepNumber}>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
            <Link href={startHref} className={styles.primaryButton}>{startLabel}<ArrowUpRight size={17} aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="vision" className={styles.vision} aria-labelledby="vision-title">
          <span className={styles.sectionLabel}>A clearer view. A better product.</span>
          <h2 id="vision-title" data-reveal="heading">Built on your code.<br />Grounded in real behavior.</h2>
          <p data-reveal="copy">Good decisions start with data you can trust. Every metric in Aletsch traces back to counted events. When there isn&apos;t enough data, we say so. You get the context to move forward with confidence.</p>
          <div className={styles.visionTags}><span><i aria-hidden="true" />Traceable insights</span><span><i aria-hidden="true" />Privacy-conscious collection</span><span><i aria-hidden="true" />Your code, your context</span></div>
        </section>

        <section className={styles.cta} aria-labelledby="cta-title">
          <div className={styles.ctaHeading}><span className={styles.sectionLabel}>Your next chapter starts here</span><h2 id="cta-title" data-reveal="heading">Ready to see<br />the full picture?</h2></div>
          <div className={styles.ctaContent}><p data-reveal="copy">Bring your code, your users, and your next big idea together. Let&apos;s turn what&apos;s happening into what happens next.</p><Link href={startHref} className={styles.primaryButton}>{startLabel}<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div><Link href="#top" className={styles.brand} aria-label="Aletsch AI home"><Waypoints size={25} strokeWidth={1.6} aria-hidden="true" />ALETSCH.AI</Link><p className={styles.footerTagline}>Your code. Your users.<br />A whole new perspective.</p></div>
          <nav aria-label="Footer navigation" className={styles.footerNav}><Link href="#features">Solutions</Link><Link href="#how">How It Works</Link><Link href="#vision">Our Vision</Link></nav>
          <div className={styles.footerAction}><span>Make your next move a smarter one.</span><Link className={styles.outlineButton} href={startHref}>{startLabel}<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
        </div>
        <div className={styles.footerBottom}><p>© {new Date().getFullYear()} Aletsch AI. All rights reserved.</p><Link href="#top">Back to top <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      </footer>
    </LandingMotion>
  );
}
