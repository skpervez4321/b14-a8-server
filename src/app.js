import express from "express";
import cors from "cors";
import { ObjectId } from "mongodb";
import { EVENT_TYPES } from "./constants.js";
import { isObjectId, validateEvent } from "./validate.js";

const toJson = (doc) => (doc ? { ...doc, _id: String(doc._id) } : doc);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createApp({ getDb, auth, clientOrigins = [] }) {
  const app = express();
  const { requireAuth } = auth;

  app.use(
    cors({
      origin: clientOrigins.length ? clientOrigins : true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (req, res) => res.json({ ok: true, service: "Seba Shongi API" }));
  app.get("/health", (req, res) => res.json({ ok: true }));
  app.get("/event-types", (req, res) => res.json(EVENT_TYPES));

  // Public: upcoming events only (past events are never returned here).
  app.get("/events", async (req, res) => {
    const db = await getDb();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 0), 50);
    const filter = { eventDate: { $gte: new Date() } };

    const type = String(req.query.type ?? "").trim();
    if (type && EVENT_TYPES.includes(type)) filter.eventType = type;

    const search = String(req.query.search ?? "").trim().slice(0, 60);
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [{ title: pattern }, { location: pattern }];
    }

    let cursor = db.collection("events").find(filter).sort({ eventDate: 1 });
    if (limit) cursor = cursor.limit(limit);
    res.json((await cursor.toArray()).map(toJson));
  });

  // Private: events created by the logged-in user.
  app.get("/my-events", requireAuth, async (req, res) => {
    const db = await getDb();
    const events = await db
      .collection("events")
      .find({ createdBy: req.user.email })
      .sort({ eventDate: 1 })
      .toArray();
    res.json(events.map(toJson));
  });

  // Private: events the logged-in user joined, soonest first.
  app.get("/my-joined", requireAuth, async (req, res) => {
    const db = await getDb();
    const joins = await db.collection("joins").find({ userEmail: req.user.email }).toArray();
    if (!joins.length) return res.json([]);

    const ids = joins.map((join) => new ObjectId(join.eventId));
    const events = await db.collection("events").find({ _id: { $in: ids } }).toArray();
    const byId = new Map(events.map((event) => [String(event._id), event]));

    const result = joins
      .map((join) => {
        const live = byId.get(join.eventId);
        const event = live ? toJson(live) : { _id: join.eventId, ...join.event };
        return { ...event, joinedAt: join.joinedAt };
      })
      .sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    res.json(result);
  });

  // Public: one event (details page). Includes how many people joined.
  app.get("/events/:id", async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: "Event not found." });
    const db = await getDb();
    const event = await db.collection("events").findOne({ _id: new ObjectId(req.params.id) });
    if (!event) return res.status(404).json({ message: "Event not found." });
    const joinedCount = await db.collection("joins").countDocuments({ eventId: req.params.id });
    res.json({ ...toJson(event), joinedCount });
  });

  app.post("/events", requireAuth, async (req, res) => {
    const { errors, data } = validateEvent(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ message: "Check the form.", errors });

    const db = await getDb();
    const doc = {
      ...data,
      createdBy: req.user.email,
      creatorName: req.user.name,
      creatorImage: req.user.image,
      createdAt: new Date(),
    };
    const result = await db.collection("events").insertOne(doc);
    res.status(201).json(toJson({ ...doc, _id: result.insertedId }));
  });

  app.put("/events/:id", requireAuth, async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: "Event not found." });
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    const existing = await db.collection("events").findOne({ _id });
    if (!existing) return res.status(404).json({ message: "Event not found." });
    if (existing.createdBy !== req.user.email)
      return res.status(403).json({ message: "You can only update your own events." });

    const { errors, data } = validateEvent(req.body, new Date(existing.eventDate));
    if (Object.keys(errors).length) return res.status(400).json({ message: "Check the form.", errors });

    await db.collection("events").updateOne({ _id }, { $set: { ...data, updatedAt: new Date() } });
    res.json(toJson({ ...existing, ...data }));
  });

  app.delete("/events/:id", requireAuth, async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: "Event not found." });
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    const existing = await db.collection("events").findOne({ _id });
    if (!existing) return res.status(404).json({ message: "Event not found." });
    if (existing.createdBy !== req.user.email)
      return res.status(403).json({ message: "You can only delete your own events." });

    await db.collection("events").deleteOne({ _id });
    await db.collection("joins").deleteMany({ eventId: req.params.id });
    res.json({ deleted: true });
  });

  app.get("/events/:id/join-status", requireAuth, async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: "Event not found." });
    const db = await getDb();
    const join = await db
      .collection("joins")
      .findOne({ eventId: req.params.id, userEmail: req.user.email });
    res.json({ joined: Boolean(join) });
  });

  app.post("/events/:id/join", requireAuth, async (req, res) => {
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: "Event not found." });
    const db = await getDb();
    const event = await db.collection("events").findOne({ _id: new ObjectId(req.params.id) });
    if (!event) return res.status(404).json({ message: "Event not found." });
    if (new Date(event.eventDate).getTime() <= Date.now())
      return res.status(400).json({ message: "This event has already ended." });

    const join = {
      eventId: req.params.id,
      userEmail: req.user.email,
      userName: req.user.name,
      userImage: req.user.image,
      event: {
        title: event.title,
        thumbnail: event.thumbnail,
        location: event.location,
        eventType: event.eventType,
        eventDate: event.eventDate,
      },
      joinedAt: new Date(),
    };
    try {
      await db.collection("joins").insertOne(join);
    } catch (error) {
      if (error?.code === 11000)
        return res.status(409).json({ message: "You have already joined this event." });
      throw error;
    }
    res.status(201).json({ joined: true });
  });

  app.use((req, res) => res.status(404).json({ message: "Route not found." }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ message: "Something went wrong on the server." });
  });

  return app;
}
