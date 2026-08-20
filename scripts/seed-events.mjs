// Quick seed script - run with: node scripts/seed-events.mjs
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://credence_user:credence1234@healthify-shard-00-00.0guz1.mongodb.net:27017,healthify-shard-00-01.0guz1.mongodb.net:27017,healthify-shard-00-02.0guz1.mongodb.net:27017/sql_noir?ssl=true&replicaSet=atlas-y5oqu3-shard-0&authSource=admin&appName=HEALTHIFY";
const DB_NAME = process.env.MONGODB_DB || "aletsch_ai";

const client = new MongoClient(MONGODB_URI);

async function seed() {
  await client.connect();
  const db = client.db(DB_NAME);

  // 1. Find the first project
  const project = await db.collection("projects").findOne({});
  if (!project) {
    console.log("❌ No projects found. Connect a repository first in the UI.");
    process.exit(1);
  }
  const projectId = project._id.toString();
  console.log(`✅ Found project: "${project.name}" (${projectId})`);

  // 2. Seed fake events
  const events = [
    { eventName: "page_view", category: "Pageview", path: "/" },
    { eventName: "page_view", category: "Pageview", path: "/sign-up" },
    { eventName: "button_clicked", category: "Interaction", path: "/sign-up" },
    { eventName: "sign_up_completed", category: "Conversion", path: "/dashboard" },
    { eventName: "page_view", category: "Pageview", path: "/dashboard" },
    { eventName: "repository_connected", category: "Conversion", path: "/repositories" },
    { eventName: "page_view", category: "Pageview", path: "/repositories" },
    { eventName: "analysis_started", category: "System", path: "/instrumentation" },
    { eventName: "form_submitted", category: "Form", path: "/sign-in" },
    { eventName: "user_logged_in", category: "System", path: "/sign-in" },
  ];

  const users = ["alice@test.com", "bob@test.com", "carol@test.com", "dave@test.com", "eve@test.com"];

  const eventDocs = [];
  for (const ev of events) {
    for (const userId of users.slice(0, Math.ceil(Math.random() * users.length))) {
      eventDocs.push({
        projectId,
        eventName: ev.eventName,
        category: ev.category,
        path: ev.path,
        userId,
        sessionId: `sess_${userId.split("@")[0]}_001`,
        occurrences: Math.floor(Math.random() * 5) + 1,
        firstSeen: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
  }

  await db.collection("events").deleteMany({ projectId, userId: { $in: users } });
  await db.collection("events").insertMany(eventDocs);
  console.log(`✅ Inserted ${eventDocs.length} test events`);

  // 3. Seed fake sessions
  const sessionDocs = users.map(userId => ({
    projectId,
    userId,
    sessionId: `sess_${userId.split("@")[0]}_001`,
    startedAt: new Date(Date.now() - Math.random() * 10 * 60 * 1000).toISOString(),
    lastActivityAt: new Date().toISOString(),
    eventCount: Math.floor(Math.random() * 10) + 2,
    exitPath: ["/dashboard", "/repositories", "/instrumentation", "/sign-up"][Math.floor(Math.random() * 4)],
  }));

  await db.collection("sessions").deleteMany({ projectId, userId: { $in: users } });
  await db.collection("sessions").insertMany(sessionDocs);
  console.log(`✅ Inserted ${sessionDocs.length} test sessions`);

  await client.close();
  console.log("\n🚀 Done! Refresh your dashboard — you should now see real stats.");
}

seed().catch(err => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
