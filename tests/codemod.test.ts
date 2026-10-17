import { test } from "node:test";
import assert from "node:assert/strict";
import { instrumentFile, injectProvider, type InstrumentationTarget } from "@/lib/instrumentation/codemod";
import { validateInstrumentedFile } from "@/lib/instrumentation/validator";
import type { FrameworkDetection } from "@/lib/ingestion/framework-detector";

const nextAppRouter: FrameworkDetection = {
  framework: "nextjs-app-router",
  label: "Next.js (App Router)",
  confidence: 1,
  language: "typescript",
  routerKind: "app-router",
  routeRoot: "app",
  isClientRenderable: true,
  signals: [],
  libraries: [],
  existingAnalytics: [],
  packageManager: "npm",
  suggestedTrackerPath: "lib/aletsch",
  importAlias: "@/*",
};

const vite: FrameworkDetection = {
  ...nextAppRouter,
  framework: "react-vite",
  label: "React (Vite)",
  routerKind: "none",
  routeRoot: "src",
  suggestedTrackerPath: "src/aletsch",
};

function target(overrides: Partial<InstrumentationTarget> = {}): InstrumentationTarget {
  return {
    eventName: "checkout_started",
    lineNumber: 4,
    tagName: "button",
    interactionType: "button_click",
    componentName: "Checkout",
    label: "Buy now",
    properties: { component: "Checkout", route: "/checkout", element: "button", label: "Buy now" },
    ...overrides,
  };
}

// ── Wrapping an existing handler ────────────────────────────

test("wraps an existing onClick without losing the original handler", () => {
  const source = `"use client";
export default function Checkout() {
  const handleBuy = () => console.log("buy");
  return <button onClick={handleBuy}>Buy now</button>;
}
`;
  const result = instrumentFile("app/checkout/page.tsx", source, [target()], { framework: nextAppRouter });

  assert.equal(result.error, undefined);
  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].mode, "wrapped_existing_handler");
  assert.ok(result.instrumentedContent.includes('trackEvent("checkout_started"'));
  assert.ok(result.instrumentedContent.includes("handleBuy"), "original handler is preserved");
  assert.ok(result.instrumentedContent.includes("import { trackEvent }"));

  const validation = validateInstrumentedFile(result);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues, null, 2));
});

test("wraps an inline arrow handler and keeps its body intact", () => {
  const source = `"use client";
export default function Checkout() {
  return (
    <button onClick={(e) => { e.preventDefault(); submitOrder(); }}>Buy now</button>
  );
}
`;
  const result = instrumentFile("app/checkout/page.tsx", source, [target({ lineNumber: 4 })], {
    framework: nextAppRouter,
  });

  assert.equal(result.applied.length, 1);
  assert.ok(result.instrumentedContent.includes("e.preventDefault()"));
  assert.ok(result.instrumentedContent.includes("submitOrder()"));
  assert.equal(validateInstrumentedFile(result).valid, true);
});

test("wraps onSubmit on a form rather than adding onClick", () => {
  const source = `"use client";
export default function SignupForm() {
  return (
    <form onSubmit={handleSignup}>
      <button type="submit">Create account</button>
    </form>
  );
}
`;
  const result = instrumentFile(
    "app/signup/page.tsx",
    source,
    [target({ eventName: "account_created", lineNumber: 4, tagName: "form", interactionType: "form_submit" })],
    { framework: nextAppRouter }
  );

  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].attribute, "onSubmit");
  assert.ok(result.instrumentedContent.includes('onSubmit={trackEvent("account_created"'));
  assert.ok(result.instrumentedContent.includes("handleSignup"));
  assert.equal(validateInstrumentedFile(result).valid, true);
});

// ── Adding a handler where none exists ──────────────────────

test("adds onClick to a Link that has no handler", () => {
  const source = `"use client";
import Link from "next/link";
export default function Nav() {
  return <Link href="/pricing">Pricing</Link>;
}
`;
  const result = instrumentFile(
    "app/nav.tsx",
    source,
    [target({ eventName: "pricing_viewed", lineNumber: 4, tagName: "Link", interactionType: "navigation" })],
    { framework: nextAppRouter }
  );

  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0].mode, "added_handler");
  assert.ok(result.instrumentedContent.includes('onClick={trackEvent("pricing_viewed"'));
  assert.equal(validateInstrumentedFile(result).valid, true);
});

test("refuses to add a handler to a server component", () => {
  const source = `import Link from "next/link";
export default function Nav() {
  return <Link href="/pricing">Pricing</Link>;
}
`;
  const result = instrumentFile(
    "app/nav.tsx",
    source,
    [target({ eventName: "pricing_viewed", lineNumber: 3, tagName: "Link", interactionType: "navigation" })],
    { framework: nextAppRouter }
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0].code, "server_component");
  assert.equal(result.instrumentedContent, source, "the file is left untouched");
});

test("adds handlers freely in a non-Next framework", () => {
  const source = `export default function Nav() {
  return <button>Pricing</button>;
}
`;
  const result = instrumentFile(
    "src/Nav.tsx",
    source,
    [target({ eventName: "pricing_viewed", lineNumber: 2, tagName: "button" })],
    { framework: vite }
  );

  assert.equal(result.applied.length, 1);
  assert.ok(result.instrumentedContent.includes("../aletsch/analytics") || result.instrumentedContent.includes("./aletsch/analytics"));
});

test("skips elements that spread props", () => {
  const source = `"use client";
export default function Card(props) {
  return <button {...props}>Go</button>;
}
`;
  const result = instrumentFile("app/card.tsx", source, [target({ lineNumber: 3 })], {
    framework: nextAppRouter,
  });

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0].code, "spread_handler");
});

test("does not add a handler to an input that has none", () => {
  const source = `"use client";
export default function Form() {
  return <input name="email" />;
}
`;
  const result = instrumentFile(
    "app/form.tsx",
    source,
    [target({ lineNumber: 3, tagName: "input", interactionType: "input_change", eventName: "email_entered" })],
    { framework: nextAppRouter }
  );

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0].code, "no_handler_slot");
});

// ── Idempotence ─────────────────────────────────────────────

test("running twice does not double-instrument", () => {
  const source = `"use client";
export default function Checkout() {
  return <button onClick={handleBuy}>Buy now</button>;
}
`;
  const first = instrumentFile("app/checkout/page.tsx", source, [target({ lineNumber: 3 })], {
    framework: nextAppRouter,
  });
  assert.equal(first.applied.length, 1);

  // Line 3 in the original is line 4 after the import is added.
  const second = instrumentFile("app/checkout/page.tsx", first.instrumentedContent, [target({ lineNumber: 4 })], {
    framework: nextAppRouter,
  });

  assert.equal(second.applied.length, 0);
  assert.equal(second.skipped[0].code, "already_instrumented");
  assert.equal(second.unchanged, true);
});

// ── Multiple targets in one file ────────────────────────────

test("instruments several elements bottom-up without shifting line numbers", () => {
  const source = `"use client";
export default function Page() {
  return (
    <div>
      <button onClick={a}>A</button>
      <button onClick={b}>B</button>
      <button onClick={c}>C</button>
    </div>
  );
}
`;
  const result = instrumentFile(
    "app/page.tsx",
    source,
    [
      target({ eventName: "a_clicked", lineNumber: 5 }),
      target({ eventName: "b_clicked", lineNumber: 6 }),
      target({ eventName: "c_clicked", lineNumber: 7 }),
    ],
    { framework: nextAppRouter }
  );

  assert.equal(result.applied.length, 3);
  for (const name of ["a_clicked", "b_clicked", "c_clicked"]) {
    assert.ok(result.instrumentedContent.includes(`trackEvent("${name}"`), `${name} is present`);
  }
  // Each wrapper kept its own handler.
  assert.ok(result.instrumentedContent.includes('trackEvent("a_clicked", { component: "Checkout", route: "/checkout", element: "button", label: "Buy now" }, a)'));

  const validation = validateInstrumentedFile(result);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues, null, 2));
});

// ── Import placement ────────────────────────────────────────

test('the "use client" directive stays first after the import is added', () => {
  const source = `"use client";

import { useState } from "react";

export default function Page() {
  return <button onClick={go}>Go</button>;
}
`;
  const result = instrumentFile("app/page.tsx", source, [target({ lineNumber: 6 })], {
    framework: nextAppRouter,
  });

  const lines = result.instrumentedContent.split("\n");
  assert.equal(lines[0].trim(), '"use client";');
  assert.ok(result.instrumentedContent.indexOf('from "react"') < result.instrumentedContent.indexOf("trackEvent"));
  assert.equal(validateInstrumentedFile(result).valid, true);
});

test("merges into an existing import from the tracker module", () => {
  const source = `"use client";
import { track } from "../../lib/aletsch/analytics";

export default function Page() {
  return <button onClick={go}>Go</button>;
}
`;
  const result = instrumentFile("app/x/page.tsx", source, [target({ lineNumber: 5 })], {
    framework: nextAppRouter,
    importSpecifier: "../../lib/aletsch/analytics",
  });

  const importCount = (result.instrumentedContent.match(/from "\.\.\/\.\.\/lib\/aletsch\/analytics"/g) || []).length;
  assert.equal(importCount, 1, "no duplicate import declaration");
  assert.ok(result.instrumentedContent.includes("track, trackEvent") || result.instrumentedContent.includes("trackEvent, track"));
});

// ── Not-found handling ──────────────────────────────────────

test("reports a target whose element has disappeared", () => {
  const source = `"use client";
export default function Page() {
  return <div>nothing here</div>;
}
`;
  const result = instrumentFile("app/page.tsx", source, [target({ lineNumber: 40 })], {
    framework: nextAppRouter,
  });

  assert.equal(result.applied.length, 0);
  assert.equal(result.skipped[0].code, "element_not_found");
  assert.equal(result.unchanged, true);
});

test("tolerates a small line drift", () => {
  const source = `"use client";
// a comment was added above
export default function Checkout() {
  return <button onClick={handleBuy}>Buy now</button>;
}
`;
  // Target says line 3, the element is now on line 4.
  const result = instrumentFile("app/checkout/page.tsx", source, [target({ lineNumber: 3 })], {
    framework: nextAppRouter,
  });

  assert.equal(result.applied.length, 1);
});

// ── Provider injection ──────────────────────────────────────

test("mounts the provider as the last child of <body>", () => {
  const layout = `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="dark">
        {children}
      </body>
    </html>
  );
}
`;
  const result = injectProvider("app/layout.tsx", layout, "@/lib/aletsch/AletschAnalytics");

  assert.equal(result.injected, true);
  assert.ok(result.content.includes("<AletschAnalytics />"));
  assert.ok(result.content.includes('import AletschAnalytics from "@/lib/aletsch/AletschAnalytics"'));
  assert.ok(
    result.content.indexOf("<AletschAnalytics />") < result.content.indexOf("</body>"),
    "the provider is inside <body>"
  );
  assert.ok(result.content.indexOf("{children}") < result.content.indexOf("<AletschAnalytics />"));
});

test("provider injection is idempotent", () => {
  const layout = `import AletschAnalytics from "@/lib/aletsch/AletschAnalytics";
export default function RootLayout({ children }) {
  return <html><body>{children}<AletschAnalytics /></body></html>;
}
`;
  const result = injectProvider("app/layout.tsx", layout, "@/lib/aletsch/AletschAnalytics");
  assert.equal(result.injected, false);
  assert.equal(result.content, layout);
});
