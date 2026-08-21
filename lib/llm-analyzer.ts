import OpenAI from "openai";

// Using OpenRouter to access free LLM models
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000", // Required for OpenRouter
    "X-Title": "Aletsch AI",
  },
});

export async function analyzeComponentsWithLLM(components: any[]) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn("No OPENROUTER_API_KEY found. Falling back to simple heuristic mapping.");
    return fallbackHeuristics(components);
  }

  try {
    const prompt = `
      I have parsed a React codebase and extracted the following interactive components (Buttons, Forms, and Page Layouts):
      ${JSON.stringify(components, null, 2)}
      
      Your task:
      1. Map these components into a logical user conversion funnel (Array of steps).
      2. Identify the 3 highest risk drop-off points (Insights).
      3. Recommend tracking events for these components.
      
      Respond in strict JSON format matching this schema exactly:
      {
        "funnelSteps": [ { "order": 1, "name": "Step Name", "targetSelector": "Component/Selector" } ],
        "insights": [ { "title": "...", "description": "...", "recommendation": "...", "type": "opportunity" | "critical" | "behavior" } ],
        "componentsWithEvents": [ { "name": "...", "recommendedEvent": "..." } ]
      }
    `;

    const response = await openai.chat.completions.create({
      // We are using a free model from OpenRouter as requested
      model: "mistralai/mistral-7b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const resultStr = response.choices[0].message.content;
    if (resultStr) {
      return JSON.parse(resultStr);
    }
  } catch (error) {
    console.error("LLM Analysis Failed, using fallback:", error);
  }

  return fallbackHeuristics(components);
}

function fallbackHeuristics(components: any[]) {
  return {
    funnelSteps: [
      { order: 1, name: "Landing Page", targetSelector: "PageLayout" },
      { order: 2, name: "User Registration", targetSelector: "SignUpForm" },
      { order: 3, name: "Dashboard Entry", targetSelector: "DashboardLayout" }
    ],
    insights: [
      { 
        title: "Registration Friction", 
        description: "A large number of users might drop off at SignUpForm.",
        recommendation: "Consider adding Google/GitHub OAuth.",
        type: "critical"
      }
    ],
    componentsWithEvents: components.map(c => ({
      ...c,
      recommendedEvent: \`\${c.type?.toLowerCase().replace(' ', '_') || 'event'}_\${c.name.toLowerCase().replace('.tsx', '')}\`
    }))
  };
}
