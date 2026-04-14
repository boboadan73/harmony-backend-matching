const express = require("express");
const router = express.Router();
const { container } = require("../config/db");

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

router.post("/phone-login", async (req, res) => {
  try {
    const phone = req.body.phone || req.body.phoneNumber;
    const eventId = String(req.body.eventId || "").trim();

    if (!phone || !eventId) {
      return res.status(400).json({
        message: "phone and eventId are required",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    const querySpec = {
      query: "SELECT TOP 1 * FROM c WHERE c.phoneNumber = @phoneNumber AND c.eventId = @eventId",
      parameters: [
        { name: "@phoneNumber", value: normalizedPhone },
        { name: "@eventId", value: eventId },
      ],
    };

    const { resources } = await container.items
      .query(querySpec, { enableCrossPartitionQuery: true })
      .fetchAll();

    const participant = resources[0];

    if (!participant) {
      return res.status(404).json({
        message: "Participant not found",
      });
    }

    return res.json({
      ok: true,
      participantId: participant.id,
      docId: participant.id,
      eventId: participant.eventId,
      phoneNumber: normalizePhone(participant.phoneNumber),
      name: participant.name || "",
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
});

module.exports = router;
