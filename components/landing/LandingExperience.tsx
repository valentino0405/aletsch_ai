"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  GitBranch,
  GitPullRequest,
  MousePointer2,
  Route,
  ScanSearch,
  Sparkles,
  Workflow,
} from "lucide-react";

const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={rise}
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.18 }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

function ProductPreview() {
  return (
    <motion.div
      className="landing-preview-wrap"
      initial={{ opacity: 0, y: 28, rotateX: 5, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ duration: 1, delay: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="landing-preview-glow" />
      <div className="landing-preview">
        <div className="preview-topbar">
          <div className="preview-brand"><span className="preview-brand-mark">A</span><span>Aletsch<span className="preview-brand-ai"> AI</span></span></div>
          <div className="preview-project"><GitBranch size={13} /> northstar / storefront <ChevronRight size={12} /></div>
          <div className="preview-status"><span /> Analysis ready</div>
        </div>
        <div className="preview-body">
          <aside className="preview-sidebar">
            <div className="preview-side-label">WORKSPACE</div>
            <div className="preview-nav active"><BarChart3 size={14} /> Overview</div>
            <div className="preview-nav"><Workflow size={14} /> Event map</div>
            <div className="preview-nav"><Route size={14} /> User paths</div>
            <div className="preview-side-rule" />
            <div className="preview-side-label">REPOSITORY</div>
            <div className="preview-repo"><span className="preview-repo-dot" /> storefront</div>
            <div className="preview-repo-sub">main · synced just now</div>
            <div className="preview-sidebar-bottom"><Sparkles size={13} /> AI analysis <span>Ready</span></div>
          </aside>
          <div className="preview-main">
            <div className="preview-heading-row">
              <div><div className="preview-eyebrow">REPOSITORY OVERVIEW</div><div className="preview-title">A clearer view of your product.</div></div>
              <div className="preview-period">Last 30 days <ChevronRight size={12} /></div>
            </div>
            <div className="preview-stat-grid">
              <div className="preview-stat"><span>Routes mapped</span><strong>24</strong><small><span className="stat-up"><ArrowUpRight size={11} /> 6 new</span> this analysis</small></div>
              <div className="preview-stat"><span>Events detected</span><strong>68</strong><small>Across 12 components</small></div>
              <div className="preview-stat"><span>Instrumentation</span><strong>82<em>%</em></strong><small>Coverage estimate</small></div>
            </div>
            <div className="preview-chart-card">
              <div className="preview-chart-head"><div><strong>Product journey</strong><small>Illustrative event flow</small></div><span className="preview-live"><i /> LIVE MAP</span></div>
              <div className="preview-flow">
                <div className="preview-node"><span className="node-icon node-blue"><MousePointer2 size={13} /></span><span><b>Page viewed</b><small>home page</small></span><strong>100%</strong></div>
                <div className="flow-connector"><span /></div>
                <div className="preview-node"><span className="node-icon node-violet"><ScanSearch size={13} /></span><span><b>Product selected</b><small>product detail</small></span><strong>64%</strong></div>
                <div className="flow-connector"><span /></div>
                <div className="preview-node"><span className="node-icon node-green"><Check size={13} /></span><span><b>Checkout started</b><small>checkout flow</small></span><strong>28%</strong></div>
              </div>
            </div>
            <div className="preview-footnote"><CircleDot size={10} /> Preview uses illustrative data · connect a repository to explore yours</div>
          </div>
        </div>
      </div>
      <motion.div className="preview-float-chip chip-analysis" animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}><span><Code2 size={15} /></span><div><b>Codebase understood</b><small>Routes · components · events</small></div><Check size={14} className="chip-check" /></motion.div>
      <motion.div className="preview-float-chip chip-insight" animate={{ y: [0, 5, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}><span><ArrowDownRight size={15} /></span><div><b>Find the friction</b><small>Trace the journey to the drop-off</small></div></motion.div>
    </motion.div>
  );
}

function LiveDashboardPreview({ sample = false }: { sample?: boolean }) {
  return (
    <div className="landing-live-dashboard-frame">
      <iframe src={sample ? "/dashboard-preview" : "/dashboard"} title={sample ? "Aletsch sample dashboard preview" : "Live Aletsch dashboard preview"} tabIndex={-1} loading="eager" />
      <div className="live-dashboard-caption"><span><CircleDot size={11} /> {sample ? "SAMPLE WORKSPACE · SAMPLE DATA" : "YOUR ALETSCH WORKSPACE"}</span><span>{sample ? "DASHBOARD PREVIEW" : "LIVE PREVIEW"}</span></div>
    </div>
  );
}

const steps = [
  { number: "01", icon: GitBranch, title: "Connect a repository", copy: "Choose a project and connect the code that powers your product." },
  { number: "02", icon: ScanSearch, title: "Understand the code", copy: "Aletsch maps routes, components, forms, and meaningful interactions." },
  { number: "03", icon: BarChart3, title: "Follow real behavior", copy: "Review instrumentation and explore journeys as event data arrives." },
];

export default function LandingExperience({ isAuthenticated }: { isAuthenticated: boolean }) {
  const primaryHref = isAuthenticated ? "/dashboard" : "/sign-up";
  const primaryLabel = isAuthenticated ? "Open dashboard" : "Get started";
  const heroStoryRef = useRef<HTMLElement>(null);
  const { scrollY, scrollYProgress } = useScroll({ target: heroStoryRef, offset: ["start start", "end end"] });
  const [headerScrolled, setHeaderScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (latest) => setHeaderScrolled(latest > 16));
  const skyOpacity = useTransform(scrollYProgress, [0, 0.95], [1, 0]);
  // Leave enough room for the headline and keep the full dashboard in view
  // when the scroll story reaches its final frame.
  const dashboardX = useTransform(scrollYProgress, [0, 0.78], ["0vw", "20vw"]);
  const dashboardScale = useTransform(scrollYProgress, [0, 0.78], [1, 0.64]);
  const introOpacity = useTransform(scrollYProgress, [0, 0.79, 0.97], [0, 0, 1]);
  return (
    <main className="landing-page">
      <div className="landing-noise" aria-hidden="true" />
      <header className={`landing-header${headerScrolled ? " landing-header-glass" : ""}`}>
        <Link href="/" className="landing-logo" aria-label="Aletsch AI home"><span className="landing-logo-mark">A</span><span>Aletsch<span> AI</span></span></Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#principles">Why Aletsch</a>
        </nav>
        <div className="landing-header-actions"><Link href="/sign-in" className="landing-signin">Sign in</Link><Link href={primaryHref} className="landing-header-cta">{primaryLabel}<ArrowRight size={15} /></Link></div>
      </header>

      <section ref={heroStoryRef} className="landing-hero-story">
      <div className="landing-hero">
        <motion.video className="landing-sky-video" style={{ opacity: skyOpacity }} src="/landing-sky.mp4" autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
        <div className="landing-sky-wash" aria-hidden="true" />
        <div className="landing-hero-copy">
          <motion.div className="landing-intro-copy" style={{ opacity: introOpacity }}>
          <motion.div className="landing-kicker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}><span className="kicker-dot" /> CODE → CONTEXT → CLARITY <span className="kicker-divider">/</span> PRODUCT ANALYTICS</motion.div>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}>See what your product<br className="hero-desktop-break" /> is <span>really doing.</span></motion.h1>
          <motion.p className="landing-hero-description" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.18 }}>Aletsch reads your codebase, maps the moments that matter, and helps you understand how people move through your product.</motion.p>
          <motion.div className="landing-hero-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.28 }}><Link href={primaryHref} className="landing-button-primary">{primaryLabel}<ArrowRight size={16} /></Link><a href="#how-it-works" className="landing-button-secondary">Explore how it works <ArrowDownRight size={15} /></a></motion.div>
          <motion.div className="landing-trust-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.48 }}><span><Check size={12} /> Built around your codebase</span><i /> <span>Understand before you instrument</span></motion.div>
          </motion.div>
        </div>
        <div className="landing-hero-visual">
          <motion.div className="landing-hero-visual-motion" style={{ x: dashboardX, scale: dashboardScale }}>
            <div className="landing-live-desktop"><LiveDashboardPreview sample={!isAuthenticated} /></div>
            <div className="landing-live-mobile"><LiveDashboardPreview sample={!isAuthenticated} /></div>
          </motion.div>
        </div>
        <a className="landing-scroll-cue" href="#platform"><span>SCROLL TO EXPLORE</span><span className="scroll-cue-line" /></a>
      </div>
      </section>

      <section id="platform" className="landing-platform landing-section">
        <Reveal className="section-intro"><div className="section-eyebrow"><span /> A BETTER STARTING POINT</div><h2>Your product has a story.<br /><span>Start with the code.</span></h2><p>Most analytics start with a blank event plan. Aletsch starts with the product you already built, giving your team a map before the questions begin.</p></Reveal>
        <div className="landing-feature-grid">
          <Reveal className="landing-feature-card feature-large" delay={0.05}><div className="feature-card-top"><span className="feature-icon icon-blue"><Code2 size={18} /></span><span className="feature-index">01 / UNDERSTAND</span></div><div><h3>From files to a product map.</h3><p>Explore discovered routes, components, and interaction points in one connected view of your application.</p></div><div className="feature-code-visual"><div className="code-file"><span className="code-file-icon"><Code2 size={13} /></span><span>ProductDetail.tsx</span><span className="code-file-line">24</span></div><div className="code-lines"><i className="line-short" /><i className="line-medium" /><i className="line-long" /><i className="line-indented" /><i className="line-medium" /></div><div className="code-map-arrow"><span /><ArrowRight size={14} /><span /></div><div className="map-tags"><span><Route size={11} /> /products/[id]</span><span><MousePointer2 size={11} /> Add to cart</span><span><CircleDot size={11} /> 3 interactions</span></div></div></Reveal>
          <Reveal className="landing-feature-card" delay={0.12}><div className="feature-card-top"><span className="feature-icon icon-violet"><Workflow size={18} /></span><span className="feature-index">02 / INSTRUMENT</span></div><div><h3>Events with a reason.</h3><p>Review generated instrumentation plans and keep event names tied to meaningful product behavior.</p></div><div className="event-visual"><div><span className="event-dot dot-violet" /><code>product_viewed</code><Check size={13} /></div><div><span className="event-dot dot-blue" /><code>cart_item_added</code><Check size={13} /></div><div><span className="event-dot dot-green" /><code>checkout_started</code><Check size={13} /></div></div></Reveal>
          <Reveal className="landing-feature-card" delay={0.18}><div className="feature-card-top"><span className="feature-icon icon-green"><BarChart3 size={18} /></span><span className="feature-index">03 / LEARN</span></div><div><h3>Journeys grounded in events.</h3><p>Follow funnels and paths as your application sends data. Aletsch separates observed behavior from assumptions.</p></div><div className="journey-visual"><div className="journey-row"><span>Product viewed</span><div><i style={{ width: "88%" }} /></div><b>1,240</b></div><div className="journey-row"><span>Added to cart</span><div><i style={{ width: "59%" }} /></div><b>826</b></div><div className="journey-row"><span>Checkout started</span><div><i style={{ width: "31%" }} /></div><b>438</b></div><small><CircleDot size={10} /> Illustrative data</small></div></Reveal>
        </div>
      </section>

      <section id="how-it-works" className="landing-process landing-section">
        <Reveal className="process-heading"><div><div className="section-eyebrow"><span /> A SIMPLE WORKFLOW</div><h2>Go from repository<br /><span>to understanding.</span></h2></div><p>Keep your team close to the code and the behavior it creates. Move at your pace, with a clear view at every step.</p></Reveal>
        <div className="process-steps">{steps.map(({ number, icon: Icon, title, copy }, index) => <Reveal className="process-step" key={number} delay={index * 0.1}><div className="step-top"><span className="step-icon"><Icon size={17} /></span><span>{number}</span></div><h3>{title}</h3><p>{copy}</p>{index < 2 && <div className="step-connector"><span /></div>}</Reveal>)}</div>
      </section>

      <section id="principles" className="landing-principles landing-section">
        <Reveal className="principles-panel"><div className="principles-copy"><div className="section-eyebrow"><span /> ANALYTICS WITH CONTEXT</div><h2>Clarity comes from<br /><span>what you can verify.</span></h2><p>Code can reveal where interactions exist. Events reveal what people do. Aletsch helps connect the two and makes the difference clear.</p><Link href={primaryHref} className="landing-text-link">{isAuthenticated ? "Open your dashboard" : "Bring your repository"}<ArrowUpRight size={15} /></Link></div><div className="principles-list"><div><span className="principle-number">01</span><div><b>See what was discovered</b><p>Routes and components come from repository analysis.</p></div><Check size={15} /></div><div><span className="principle-number">02</span><div><b>Review before you apply</b><p>Instrumentation stays visible for your team to inspect.</p></div><Check size={15} /></div><div><span className="principle-number">03</span><div><b>Learn from received events</b><p>Funnels need observed traffic to tell a real story.</p></div><Check size={15} /></div></div></Reveal>
      </section>

      <section className="landing-final-cta"><Reveal className="final-cta-inner"><span className="final-cta-orbit orbit-one" /><span className="final-cta-orbit orbit-two" /><span className="final-cta-mark"><GitPullRequest size={19} /></span><div className="section-eyebrow"><span /> START WITH YOUR REPOSITORY</div><h2>Make the product<br /><span>easier to understand.</span></h2><p>Connect your codebase and see what Aletsch can map.</p><Link href={primaryHref} className="landing-button-primary">{isAuthenticated ? "Open dashboard" : "Get started with Aletsch"}<ArrowRight size={16} /></Link></Reveal></section>

      <footer className="landing-footer"><Link href="/" className="landing-logo"><span className="landing-logo-mark">A</span><span>Aletsch<span> AI</span></span></Link><span>Codebase context for product analytics.</span><span>© {new Date().getFullYear()} Aletsch AI</span></footer>
    </main>
  );
}
