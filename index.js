import "dotenv/config";
import { MongoClient } from "mongodb";
import { createApp } from "./src/create-app.js"
import { createAuth } from "./src/auth.js";

const authUrl = process.env.AUTH_URL;
if (!authUrl) console.warn("AUTH_URL is missing. Set it to your client site address in .env");

let dbPromise;
function getDb() {
  if (!dbPromise) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing in .env");
    dbPromise = (async () => {
      const client = await new MongoClient(process.env.MONGODB_URI).connect();
      const db = client.db(process.env.MONGODB_DB || "seba_shongi");
      await db.collection("events").createIndex({ eventDate: 1 });
      await db.collection("events").createIndex({ createdBy: 1 });
      await db.collection("joins").createIndex({ eventId: 1, userEmail: 1 }, { unique: true });
      await db.collection("joins").createIndex({ userEmail: 1 });
      return db;
    })().catch((error) => {
      dbPromise = undefined; // let the next request try again
      throw error;
    });
  }
  return dbPromise;
}

const clientOrigins = (process.env.CLIENT_URLS || authUrl || "")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const app = createApp({
  getDb,
  auth: createAuth({ authUrl, jwksUrl: process.env.JWKS_URL }),
  clientOrigins,
});

export default app;

// On Vercel the platform runs the app for us. Everywhere else, listen on a port.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
