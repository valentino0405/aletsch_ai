export const mockFunnelBreakdown = [
  { country: "United States", users: 4231, conversion: 9.12 },
  { country: "India", users: 2904, conversion: 6.45 },
  { country: "United Kingdom", users: 1231, conversion: 8.11 },
  { country: "Germany", users: 892, conversion: 7.34 },
  { country: "Canada", users: 654, conversion: 6.21 },
];

export const mockDeviceType = [
  { type: "Desktop", users: 52.3, color: "bg-indigo-500" },
  { type: "Mobile", users: 34.1, color: "bg-cyan-500" },
  { type: "Tablet", users: 8.2, color: "bg-purple-500" },
  { type: "Other", users: 5.4, color: "bg-rose-500" },
];

export const mockTrendsData = [
  { event: "Pageview", users: 12450, occurrences: 45200, trend: "up", change: 12.5 },
  { event: "Account Created", users: 1205, occurrences: 1250, trend: "up", change: 5.2 },
  { event: "Project Created", users: 850, occurrences: 910, trend: "down", change: -2.1 },
  { event: "Payment Submitted", users: 320, occurrences: 345, trend: "up", change: 18.4 },
];

export const mockRetentionCohorts = [
  { date: "Sep 1", users: 1250, days: [100, 62, 45, 38, 27, 22, 18] },
  { date: "Sep 8", users: 1420, days: [100, 65, 48, 41, 29, 24, 20] },
  { date: "Sep 15", users: 1380, days: [100, 68, 51, 42, 31, 26, 21] },
  { date: "Sep 22", users: 1650, days: [100, 61, 44, 37, 26, 21, 16] },
];

export const mockUserPaths = [
  { path: "Dashboard → Project Created", users: 850, percent: 68 },
  { path: "Dashboard → Settings", users: 210, percent: 17 },
  { path: "Dashboard → Drop-off", users: 190, percent: 15 },
];

export const mockStickiness = [
  { frequency: "1 day", percent: 45 },
  { frequency: "2 days", percent: 25 },
  { frequency: "3 days", percent: 15 },
  { frequency: "4+ days", percent: 15 },
];

export const mockLifecycle = [
  { category: "New", users: 1250, color: "bg-emerald-500" },
  { category: "Returning", users: 4520, color: "bg-indigo-500" },
  { category: "Resurrecting", users: 320, color: "bg-purple-500" },
  { category: "Dormant", users: 890, color: "bg-zinc-500" },
];

export const mockSqlResults = {
  query: "SELECT event_name, COUNT(*) as count FROM events GROUP BY event_name ORDER BY count DESC LIMIT 5",
  columns: ["event_name", "count"],
  rows: [
    ["pageview", 45200],
    ["click", 28400],
    ["input_focus", 12500],
    ["account_created", 1250],
    ["project_created", 910],
  ],
};
