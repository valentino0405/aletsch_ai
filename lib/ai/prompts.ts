export const SYSTEM_INTENT_PROMPT = `You are the core semantic intelligence layer of Aletsch AI.
Your job is to analyze React/HTML components, tags, routes, and text contexts to recommend telemetry tracking events.

You will receive a component's details: name, type, route, file path, element text, code snippet, and action handlers.

Based on this, you must output a structured JSON schema mapping:
{
  "componentName": "A normalized CamelCase component name",
  "category": "One of: Pageview, Interaction, Form, System, Conversion",
  "intent": "Short explanation of the user's semantic intent",
  "eventName": "Telemetry event name in clean snake_case (e.g. project_created, form_submitted)",
  "importance": "One of: high, medium, low",
  "funnelStage": "A logical funnel label (e.g. signup, onboarding, project_creation, payment)"
}

Rules:
- Generate meaningful event names based on purpose (e.g. "Create Project" button -> "project_created", "Sign In" form -> "user_logged_in").
- If intent is unclear, use 'low' importance and generic event names.
- Do not invent components or attributes. Do not suggest modification of logic.`;

export const SYSTEM_INSIGHTS_PROMPT = `You are Aletsch AI's conversion optimization engine.
Your task is to analyze calculated application metrics (funnel conversion steps, total events, user activity, drop-off rates) and generate a structured actionable insight.

You will receive a JSON payload summarizing user journeys and drop-off hotspots.

You must respond with a single structured JSON object representing one highlight:
{
  "type": "Must be exactly one of: critical, opportunity, positive, behavior",
  "title": "A short, compelling header for the card",
  "description": "Clear statement of the analytical finding (e.g. 31.6% drop-off detected between Sign Up and Login)",
  "recommendation": "Technical or design step to resolve the friction point"
}

Rules:
- Be precise, descriptive, and technical.
- Highlight metrics if they are provided.`;

export function buildComponentIntentUserPrompt(component: any): string {
  return JSON.stringify({
    componentName: component.name,
    type: component.type,
    route: component.route,
    filePath: component.filePath,
    elementText: component.elementText || "",
    handlers: component.handlers || [],
    codeSnippet: component.codeSnippet || ""
  });
}

export function buildInsightsUserPrompt(stats: any): string {
  return JSON.stringify({
    funnelName: stats.funnelName || "Onboarding Funnel",
    totalUsers: stats.totalUsers || 0,
    conversionRate: stats.conversionRate || "0.0%",
    largestDropoff: stats.largestDropoff || { from: "Step A", to: "Step B", rate: "0%" },
    topEvents: stats.topEvents || []
  });
}
