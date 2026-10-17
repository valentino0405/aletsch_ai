import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {
  serverSelectionTimeoutMS: 3000,
  connectTimeoutMS: 3000,
  socketTimeoutMS: 4000,
};

let client: MongoClient;
let clientPromise: Promise<MongoClient> | null = null;

function createClientPromise(): Promise<MongoClient> | null {
  if (!uri) return null;

  if (process.env.NODE_ENV === "development") {
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect().catch((err) => {
        // Reset promise on error so subsequent requests can retry
        globalWithMongo._mongoClientPromise = undefined;
        throw err;
      });
    }
    return globalWithMongo._mongoClientPromise;
  } else {
    client = new MongoClient(uri, options);
    return client.connect();
  }
}

clientPromise = createClientPromise();

export default clientPromise;

export async function getDb(): Promise<Db> {
  const currentPromise = clientPromise || createClientPromise();
  if (!currentPromise) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
  }
  const client = await currentPromise;
  const dbName = process.env.MONGODB_DB || "aletsch_ai";
  return client.db(dbName);
}

export async function getDbOrNull(): Promise<Db | null> {
  try {
    return await getDb();
  } catch (error) {
    console.warn("MongoDB connection failed or unavailable, using fallback:", (error as any)?.message || error);
    return null;
  }
}

