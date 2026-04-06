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

  if (s.endsWith(".0")) {
    s = s.slice(0, -2);
  }

  s = s.replace(/[^\d+]/g, "");

  if (s.startsWith("+972")) {
    s = "0" + s.slice(4);
  } else if (s.startsWith("972")) {
    s = "0" + s.slice(3);
  }

  if (s.length === 9 && !s.startsWith("0")) {
    s = "0" + s;
  }

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
};
}

async function getParticipantById(id) {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: String(id).trim() }],
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

async function getParticipantByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  const querySpec = {
    query: "SELECT * FROM c WHERE c.phoneNumber = @phone",
    parameters: [{ name: "@phone", value: normalizedPhone }],
  };

  const { resources } = await container.items
    .query(querySpec, { enableCrossPartitionQuery: true })
    .fetchAll();

  if (resources.length) {
    return resources[0];
  }

  const allQuery = { query: "SELECT * FROM c" };
  const { resources: allParticipants } = await container.items
    .query(allQuery, { enableCrossPartitionQuery: true })
    .fetchAll();

  return (
    allParticipants.find(
      (participant) =>
        normalizePhone(participant.phoneNumber) === normalizedPhone
    ) || null
  );
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

// Get all participants
router.get("/", async (req, res) => {
  try {
    const querySpec = { query: "SELECT * FROM c" };
    const { resources } = await container.items
      .query(querySpec, { enableCrossPartitionQuery: true })
      .fetchAll();

    return res.json(resources.map(mapParticipant));
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get participants",
      error: error.message,
    });
  }
});

// Get participant by phone
router.get("/phone/:phone", async (req, res) => {
  try {
    const participant = await getParticipantByPhone(req.params.phone);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// Get participant by row number
router.get("/number/:num", async (req, res) => {
  try {
    const rowNumber = parseInt(req.params.num, 10);

    if (isNaN(rowNumber)) {
      return res.status(400).json({ message: "Invalid row number" });
    }

    const querySpec = {
      query: "SELECT TOP 1 * FROM c WHERE c.rowNumber = @rowNumber",
      parameters: [{ name: "@rowNumber", value: rowNumber }],
    };

    const { resources } = await container.items
      .query(querySpec, { enableCrossPartitionQuery: true })
      .fetchAll();

    const participant = resources[0];

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

// Create participant
router.post("/", async (req, res) => {
  try {
    const body = req.body;

    const newParticipant = {
      id: crypto.randomUUID(),
      eventId: body.eventId || "",
      rowNumber: body.rowNumber || 0,
      name: body.name || "",
      phoneNumber: normalizePhone(body.phoneNumber || ""),
      jobTitle: body.jobTitle || "",
      academicResume: body.academicResume || "",
      professionalResume: body.professionalResume || "",
      personalResume: body.personalResume || "",
      iWantToMeet: body.iWantToMeet || "",
      photoUrl: body.photoUrl || "",
      rawData: body.rawData || {},
      hidden: false,
      saved: [],
      met: [],
    };

    await container.items.create(newParticipant);

    return res.status(201).json({
      participant: mapParticipant(newParticipant),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Create participant failed",
      error: error.message,
    });
  }
});

// Update participant profile
router.put("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const fieldMap = {
      name: "name",
      jobTitle: "jobTitle",
      academicResume: "academicResume",
      professionalResume: "professionalResume",
      personalResume: "personalResume",
      iWantToMeet: "iWantToMeet",
      photoUrl: "photoUrl",
    };

    for (const [bodyField, docField] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyField)) {
        participant[docField] = cleanText(req.body[bodyField]);
      }
    }

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Profile updated successfully",
      participant: mapParticipant(updated),
      refreshMatches: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Update profile failed",
      error: error.message,
    });
  }
});

// Hide / unhide participant profile
router.patch("/:id/privacy", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.hidden = Boolean(req.body.hidden);

    const updated = await replaceParticipant(participant);

    return res.json({
      message: participant.hidden
        ? "Profile hidden successfully"
        : "Profile is visible again",
      participant: mapParticipant(updated),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Privacy update failed",
      error: error.message,
    });
  }
});

// Delete participant personal data
router.delete("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.name = "";
    participant.jobTitle = "";
    participant.academicResume = "";
    participant.professionalResume = "";
    participant.personalResume = "";
    participant.iWantToMeet = "";
    participant.photoUrl = "";
    participant.hidden = true;

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Participant data removed successfully",
      participant: mapParticipant(updated),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Delete participant data failed",
      error: error.message,
    });
  }
});

// Get saved list ids
router.get("/:id/saved", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({ saved: participant.saved || [] });
  } catch (error) {
    return res.status(500).json({
      message: "Get saved failed",
      error: error.message,
    });
  }
});

// Get saved full data
router.get("/:id/saved/full", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const savedIds = participant.saved || [];
    const savedParticipants = await getParticipantsByIds(savedIds);

    return res.json(savedParticipants.map(mapParticipant));
  } catch (error) {
    return res.status(500).json({
      message: "Get saved full failed",
      error: error.message,
    });
  }
});

// Get met list ids
router.get("/:id/met", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json({ met: participant.met || [] });
  } catch (error) {
    return res.status(500).json({
      message: "Get met failed",
      error: error.message,
    });
  }
});

// Get met full data
router.get("/:id/met/full", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const metIds = participant.met || [];
    const metParticipants = await getParticipantsByIds(metIds);

    return res.json(metParticipants.map(mapParticipant));
  } catch (error) {
    return res.status(500).json({
      message: "Get met full failed",
      error: error.message,
    });
  }
});

// Save participant
router.post("/:id/save/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    if (id === targetId) {
      return res.status(400).json({ message: "Cannot save yourself" });
    }

    const participant = await getParticipantById(id);
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const targetParticipant = await getParticipantById(targetId);
    if (!targetParticipant) {
      return res.status(404).json({ message: "Target participant not found" });
    }

    participant.saved = participant.saved || [];

    if (!participant.saved.includes(targetId)) {
      participant.saved.push(targetId);
    }

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Saved successfully",
      saved: updated.saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Save failed",
      error: error.message,
    });
  }
});

// Unsave participant
router.delete("/:id/save/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    const participant = await getParticipantById(id);
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.saved = (participant.saved || []).filter(
      (item) => item !== targetId
    );

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Removed from saved successfully",
      saved: updated.saved,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unsave failed",
      error: error.message,
    });
  }
});

// Mark met
router.post("/:id/met/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    if (id === targetId) {
      return res.status(400).json({ message: "Cannot mark yourself as met" });
    }

    const participant = await getParticipantById(id);
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    const targetParticipant = await getParticipantById(targetId);
    if (!targetParticipant) {
      return res.status(404).json({ message: "Target participant not found" });
    }

    participant.met = participant.met || [];

    if (!participant.met.includes(targetId)) {
      participant.met.push(targetId);
    }

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Met saved successfully",
      met: updated.met,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Met failed",
      error: error.message,
    });
  }
});

// Unmark met
router.delete("/:id/met/:targetId", async (req, res) => {
  try {
    const { id, targetId } = req.params;

    const participant = await getParticipantById(id);
    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    participant.met = (participant.met || []).filter(
      (item) => item !== targetId
    );

    const updated = await replaceParticipant(participant);

    return res.json({
      message: "Removed from met successfully",
      met: updated.met,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unmet failed",
      error: error.message,
    });
  }
});

// Get participant by id
router.get("/:id", async (req, res) => {
  try {
    const participant = await getParticipantById(req.params.id);

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    return res.json(mapParticipant(participant));
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;