import { ObjectId } from "mongodb";
import { EVENT_TYPES } from "./constants.js";

export function isObjectId(id) {
  return typeof id === "string" && ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Returns { errors: {field: message}, data } for create / update event bodies.
// previousDate (Date) lets an unchanged date pass on update even if it is now in the past.
export function validateEvent(body = {}, previousDate = null) {
  const errors = {};
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const eventType = String(body.eventType ?? "").trim();
  const thumbnail = String(body.thumbnail ?? "").trim();
  const location = String(body.location ?? "").trim();
  const eventDate = new Date(body.eventDate);

  if (title.length < 3 || title.length > 100) errors.title = "Title must be 3 to 100 characters.";
  if (description.length < 10 || description.length > 2000)
    errors.description = "Description must be 10 to 2000 characters.";
  if (!EVENT_TYPES.includes(eventType)) errors.eventType = "Choose a valid event type.";
  if (!isHttpUrl(thumbnail)) errors.thumbnail = "Thumbnail must be a valid http or https link.";
  if (location.length < 3 || location.length > 120)
    errors.location = "Location must be 3 to 120 characters.";

  if (Number.isNaN(eventDate.getTime())) {
    errors.eventDate = "Choose a valid date and time.";
  } else {
    const unchanged = previousDate && previousDate.getTime() === eventDate.getTime();
    if (!unchanged && eventDate.getTime() <= Date.now())
      errors.eventDate = "Event date must be in the future.";
  }

  return { errors, data: { title, description, eventType, thumbnail, location, eventDate } };
}
