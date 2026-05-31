/**
 * MongoDB connection helper for Next.js API routes.
 * Reuses existing connection in development (hot reload safe).
 */
import mongoose from "mongoose";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Use global to preserve connection across Next.js hot reloads in dev
declare global {
  var _mongooseCache: MongooseCache;
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null };
global._mongooseCache = cache;

export async function dbConnect(): Promise<typeof mongoose> {
  // Check at call-time, not module-load time — Next.js evaluates modules
  // during `next build` when env vars may not be present yet.
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not defined");
  }

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
      dbName: "card-max",
      // Pool tuning: keep more connections ready, hold warm sockets between
      // requests.  minPoolSize prevents the driver from closing all sockets
      // during brief idle periods — the next request reuses them immediately.
      maxPoolSize: 10,
      minPoolSize: 2,
      // Fail fast on cold-start rather than hanging for the default 30 s.
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
    });
  }

  cache.conn = await cache.promise;
  const dbName = cache.conn.connection.db?.databaseName ?? "unknown";
  console.log(`[db] Connected to MongoDB — database: "${dbName}"`);
  return cache.conn;
}
