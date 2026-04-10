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
    cache.promise = mongoose.connect(uri, { bufferCommands: false, dbName: "card-max" });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
