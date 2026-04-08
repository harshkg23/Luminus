import { MongoClient } from "mongodb";

type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

const g = global as GlobalWithMongo;

function createClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing environment variable: "MONGODB_URI"');
  }

  if (process.env.NODE_ENV === "development") {
    if (!g._mongoClientPromise) {
      g._mongoClientPromise = new MongoClient(uri).connect();
    }
    return g._mongoClientPromise;
  }

  return new MongoClient(uri).connect();
}

const clientPromise: Promise<MongoClient> = Promise.resolve().then(createClientPromise);

export default clientPromise;
