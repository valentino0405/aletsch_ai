# Aletsch AI - Project Context File

## 1. Project Overview
**Aletsch AI** is an analytics platform tailored for AI-built software products (such as lovables, v0, etc.). It automates event instrumentation by parsing application code (component trees, CTAs, forms, routes) and maps conversion pipelines, drop-offs, events, user metrics, and AI-driven insights onto a glassmorphic dashboard.

---

## 2. Technology Stack & Key Dependencies
- **Core Framework**: [Next.js 16.3.0](https://nextjs.org/) (App Router, dynamic layouts)
- **Runtime & Library**: React 19.2.8 / ReactDOM 19.2.8
- **Styling**: Tailwind CSS v4 & Vanilla CSS custom configurations
- **Authentication**: [@clerk/nextjs v7.7.1](https://clerk.com/)
- **Database**: [MongoDB v7.5.0](https://www.mongodb.com/) (Atlas client setup with fallback mode)
- **Icons**: `lucide-react`
- **Linting & Code Style**: ESLint 9 & TypeScript 5

---

## 3. Database Architecture & Schemas
Defined in `types/index.ts`:

1. **`Project`**: The connected repository being instrumented.
   - `_id?: string`
   - `name: string`
   - `repositoryUrl: string`
   - `branch: string`
   - `ownerId: string` (Clerk User ID)
   - `status: "Connected" | "Syncing" | "Disconnected"`
   - `createdAt: string`, `updatedAt: string`

2. **`Repository`**: Extra details for repository health and stars tracking.
   - `stars`, `forks`, `language`, `lastSyncedAt`

3. **`Event`**: Captured logs of trace events.
   - `category: "Interaction" | "Form" | "Pageview" | "System" | "Conversion"`
   - `eventName`, `path`, `selector`, `userId`, `occurrences`, `lastSeen`

4. **`Funnel`**: Multi-step conversion pipelines.
   - `name`, `steps: { order, name, targetSelector, expectedUsers, actualUsers }[]`

5. **`Insight`**: Automatically generated AI suggestions/recommendations.
   - `type: "critical" | "opportunity" | "positive" | "behavior"`
   - `title`, `description`, `recommendation`

---

## 4. File & Folder Structure
```
aletsch_ai/
├── app/
│   ├── (auth)/                      # Authentication pages (Sign In & Sign Up) via Clerk
│   ├── alerts/                      # Alerts & incident logging interface page
│   ├── api/
│   │   └── projects/                # API router to GET projects or POST to connect a repository
│   │       └── route.ts
│   ├── dashboard/                   # Core landing dashboard showing metrics, charts, & system health
│   ├── events/                      # Explorer page to filter & search all tracked interaction telemetry
│   ├── funnel-analysis/             # Dynamic page visualizing conversion rates and drop-off hotspots
│   ├── insights/                    # Deep dive AI optimization recommendations
│   ├── instrumentation/             # Automated hooks controller and setup status page
│   ├── projects/                    # List and configure connected source control projects
│   ├── reports/                     # Custom telemetry report generator and outputs
│   ├── repositories/                # Health stats, stars, and languages list
│   ├── settings/                    # Account configuration and MongoDB API keys management
│   ├── users/                       # Users tracker and behavior list
│   ├── globals.css                  # Custom styling system, fonts, gradients, and custom scrollbars
│   ├── layout.tsx                   # Master root layout wraps app in ClerkProvider & loads Geist fonts
│   └── page.tsx                     # Product landing page introducing Aletsch AI features
├── components/
│   └── navigation/
│       ├── DashboardLayout.tsx      # Sidebar/Topbar responsive container grid for subpages
│       ├── Sidebar.tsx              # Interactive dynamic nav pane showing Active Project & Profile
│       └── Topbar.tsx               # Simple breadcrumbs & search utility bar
├── lib/
│   └── mongodb.ts                   # Persistent MongoDB connection pool logic (with local fallback)
├── types/
│   └── index.ts                     # Main TypeScript interfaces
├── proxy.ts                         # Clerk Middleware protecting dashboard pages and APIs
├── package.json                     # Package dependencies and standard scripts
└── tsconfig.json                    # TypeScript environment config
```

---

## 5. Middleware & Route Protection
All routes inside `/dashboard`, `/projects`, `/repositories`, `/funnel-analysis`, `/events`, `/instrumentation`, `/insights`, `/reports`, `/users`, `/alerts`, `/settings`, and `/api` are fully protected.
- If a user tries to access them without logging in, they are redirected to `/sign-in` or `/sign-up`.
- Root page (`/`) is public.
- File references: `proxy.ts`

---

## 6. Implementation Notes & Fallbacks
- **MongoDB Configuration**: The project has standard connection pooling inside `lib/mongodb.ts`. If `MONGODB_URI` is not present, endpoints (such as `app/api/projects/route.ts`) will gracefully fallback to generating and serving premium-style demo mock data.
- **Clerk Setup Prompt**: If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is not present in environment variables, the master root layout (`app/layout.tsx`) displays an instructions card prompt to setup Clerk keys.

---

## 7. Detailed Features by Page / Route

### 1. Landing Page (`/`)
- Brand presentation & introduction to the auto-instrumentation engine pipeline (Code Understanding, Auto Instrumentation, AI Analytics).
- Dynamic navigation controls based on authentication state (displays "Dashboard" if logged in; "Sign In" otherwise).
- Deep link integration to the open-source repository.

### 2. Dashboard (`/dashboard`)
- **Key Metrics Overview**: Real-time stats with auto-scaling sparkline graphics (Total Users, Events Tracked, Conversion Rate, Session Time, Drop-offs).
- **Funnel Flow Map**: Beautiful horizontal connector graph rendering user progress across conversion stages.
- **Drop-off Alert Bar**: Highlights friction points (e.g., abandon rate between registration & login).
- **Instrumentation Status Gauge**: Radial progress indicator reflecting the code-parsing coverage.
- **Activity & System Health Logs**: Live feed of telemetry captures and background worker health levels.

### 3. Projects Configuration (`/projects`)
- Grid tracking all linked projects with metrics (Users, Event counts, and active sync timings).
- **Add Project Modal**: Validated form executing POST requests to the `/api/projects` endpoint. Inserts metadata directly into MongoDB or handles fallback mocking seamlessly.
- **Sync Actions**: Trigger controls to re-run workspace telemetry indexer scripts.

### 4. Events Explorer (`/events`)
- Live search engine for all captured interaction traces.
- Custom categories selector (Pageviews, Interactions, Forms, System, Conversions).
- Tabular data rendering: Unique users, occurrence metrics, and precise "last seen" relative timestamps.

### 5. Funnel Analysis (`/funnel-analysis`)
- Target pipeline dropdown switcher (Onboarding, Engagement, Checkout).
- Comparative drop-off histograms plotting user percentages.
- Structured AI Suggestions console highlighting exactly which element selector causes the biggest conversions drop.

### 6. AI Insights (`/insights`)
- Optimization vector logs categorizing cards into `critical`, `opportunity`, `positive`, and `behavior` types.
- Provides diagnostic details (e.g., Clerk redirects issues) alongside immediate technical recommendations.

### 7. Auto-Instrumentation Controls (`/instrumentation`)
- Pipeline milestone visualization mapping AST parsing steps.
- Deep component directory log identifying React files, categorizing them (Page Layouts, Forms, Buttons), and listing precisely mapped actions.
- Code window presenting standard telemetry code injection layouts.

### 8. Telemetry Reports (`/reports`)
- Cards tracking generated digests (Weekly/Monthly active metrics digests).
- Core conversion metrics comparisons and download triggers.

### 9. Repository Health (`/repositories`)
- GitHub connection form configuring target repository URL and specific branches.
- Active repositories listing rendering language breakdowns, star/fork counts, and remote webhook synchronization states.

### 10. Alerts Log (`/alerts`)
- Custom severity warning blocks (Critical/Warning flags) filtering telemetry spikes or AST inject failures.
- Categorized status boards highlighting issues by component origin.

### 11. Users Analytics (`/users`)
- Structured client session dashboard tracking user emails, total active sessions, event frequency, and current conversion funnel position.
- Quick navigation links for auditing detailed user behavior graphs.

### 12. Account Settings (`/settings`)
- Configuration panes (General, Repo, Notifications, API security keys).
- Form options saving variables like active projects, update thresholds, and API configurations.

