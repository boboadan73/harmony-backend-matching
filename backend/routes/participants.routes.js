const express = require("express");
const router = express.Router();
const { container } = require("../config/db");
const crypto = require("crypto");

function cleanText(text) {
  if (text === null || text === undefined) return "";
  return String(text).trim().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  if (!value) return "";

  let s = String(value).trim();

  if (s.endsWith(".0")) s = s.slice(0, -2);

  s = s.replace(/[^\d+]/g, "");

  if (s.startsWith("+972")) s = "0" + s.slice(4);
  else if (s.startsWith("972")) s = "0" + s.slice(3);

  if (s.length === 9 && !s.startsWith("0")) s = "0" + s;

  return s;
}

function mapParticipant(participant) {
  if (!participant) return null;

  return {
    id: participant.id,
    eventId: participant.eventId || null,
    rowNumber: participant.rowNumber || 0,
    name: participant.name || "",

    phoneNumber: normalizePhone(participant.phoneNumber),
    phone: normalizePhone(participant.phoneNumber),

    jobTitle: participant.jobTitle || "",
    job: participant.jobTitle || "",

    academicResume: participant.academicResume || "",
    academic: participant.academicResume || "",

    professionalResume: participant.professionalResume || "",
    professional: participant.professionalResume || "",

    personalResume: participant.personalResume || "",
    personal: participant.personalResume || "",

    iWantToMeet: participant.iWantToMeet || "",

    photoUrl: participant.photoUrl || "",
    image: participant.photoUrl || "",

    rawData: participant.rawData || {},
    hidden: Boolean(participant.hidden),

    saved: participant.saved || [],
    met: participant.met || [],
    skipped: participant.skipped || [],
  };
}

// 🔥 FIXED
async function getParticipantById(id, eventId) {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.id = @id AND c.eventId = @eventId",
    parameters: [
      { name: "@id", value: String(id).trim() },
      { name: "@eventId", value: String(eventId).trim() },
    ],
  };

  const { resources } = await container.items
    .query(querySpec, { enableCrossPartitionQuery: true })
    .fetchAll();

  return resources[0] || null;
}

async function replaceParticipant(participant) {
  const { resource } = await container
    .item(participant.id, participant.eventId)
    .replace(participant);

  return resource;
}

async function getParticipantsByIds(ids) {
  if (!ids || !ids.length) return [];

  const querySpec = {
    query: "SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.id)",
    parameters: [{ name: "@ids", value: ids }],
  };

  const { resources } = await container.items
    .query(querySpec, { enableCrossPartitionQuery: true })
    .fetchAll();

  return resources;
}

// ===== UPDATE PROFILE =====
router.put("/:id", async (req, res) => {
  try {
    const eventId = req.body.eventId || req.query.eventId;

    const participant = await getParticipantById(req.params.id, eventId);
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const fieldMap = {
      name: "name",
      job: "jobTitle",
      jobTitle: "jobTitle",
      academic: "academicResume",
      academicResume: "academicResume",
      professional: "professionalResume",
      professionalResume: "professionalResume",
      personal: "personalResume",
      personalResume: "personalResume",
      image: "photoUrl",
      photoUrl: "photoUrl",
      iWantToMeet: "iWantToMeet",
    };

    for (const [bodyField, docField] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyField)) {
        participant[docField] = cleanText(req.body[bodyField]);
      }
    }

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Profile updated",
      participant: mapParticipant(updated),
      refreshMatches: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ===== SAVE =====
router.post("/:id/save/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;
    const eventId = req.body.eventId || req.query.eventId;

    const participant = await getParticipantById(id, eventId);
    const target = await getParticipantById(targetId, eventId);

    if (!participant || !target)
      return res.status(404).json({ message: "Participant not found" });

    participant.saved = participant.saved || [];
    participant.met = participant.met || [];
    participant.skipped = participant.skipped || [];

    // remove from others
    participant.met = participant.met.filter((x) => x !== targetId);
    participant.skipped = participant.skipped.filter((x) => x !== targetId);

    if (!participant.saved.includes(targetId)) {
      participant.saved.push(targetId);
    }

    const updated = await replaceParticipant(participant);

    return res.json({ saved: updated.saved });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ===== MET =====
router.post("/:id/met/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;
    const eventId = req.body.eventId || req.query.eventId;

    const participant = await getParticipantById(id, eventId);
    const target = await getParticipantById(targetId, eventId);

    if (!participant || !target)
      return res.status(404).json({ message: "Participant not found" });

    participant.saved = participant.saved || [];
    participant.met = participant.met || [];
    participant.skipped = participant.skipped || [];

    participant.saved = participant.saved.filter((x) => x !== targetId);
    participant.skipped = participant.skipped.filter((x) => x !== targetId);

    if (!participant.met.includes(targetId)) {
      participant.met.push(targetId);
    }

    const updated = await replaceParticipant(participant);

    return res.json({ met: updated.met });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

// ===== SKIPPED =====
router.post("/:id/skipped/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;
    const eventId = req.body.eventId || req.query.eventId;

    const participant = await getParticipantById(id, eventId);

    if (!participant)
      return res.status(404).json({ message: "Participant not found" });

    participant.saved = participant.saved || [];
    participant.met = participant.met || [];
    participant.skipped = participant.skipped || [];

    participant.saved = participant.saved.filter((x) => x !== targetId);
    participant.met = participant.met.filter((x) => x !== targetId);

    if (!participant.skipped.includes(targetId)) {
      participant.skipped.push(targetId);
    }

    const updated = await replaceParticipant(participant);

    return res.json({ skipped: updated.skipped });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
