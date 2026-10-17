export function generateTrackingCode(events: {name: string, recommendedEvent: string}[]) {
  const code = `
// Auto-generated PostHog Tracking Instrumentation
import posthog from 'posthog-js';

// Initialize PostHog (Put this in your root layout/provider)
export function initAnalytics() {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_placeholder', {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      autocapture: false, // We use explicit tracking from AST mapping
    });
  }
}

// Auto-Mapped Tracked Events
export const TrackingEvents = {
${events.map(e => `  ${e.recommendedEvent.toUpperCase()}: '${e.recommendedEvent}',`).join("\n")}
};

// Reusable Track Function for identified components
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    posthog.capture(eventName, properties);
  }
}
`;
  return code.trim();
}
