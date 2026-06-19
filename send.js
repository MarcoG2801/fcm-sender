const express = require("express");
const cors = require("cors");
const { db, messaging } = require("./firebase");

const app = express();
app.use(cors());
app.use(express.json());

/**
 * INVIO PUSH A TUTTI GLI UTENTI DI UN CENTRO
 */
app.post("/send-notification", async (req, res) => {
  try {
    const { centroId, title, body } = req.body;

    if (!centroId) {
      return res.status(400).json({ error: "centroId mancante" });
    }

    // 🔍 1. prendi utenti del centro
    const snapshot = await db
      .collection("users")
      .where("centriIds", "array-contains", centroId)
      .get();

    if (snapshot.empty) {
      return res.json({ message: "Nessun utente trovato" });
    }

    // 🔑 2. estrai token
    const tokens = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) tokens.push(data.token);
    });

    if (tokens.length === 0) {
      return res.json({ message: "Nessun token disponibile" });
    }

    // 📲 3. invio push multicast (max 500 token per volta)
    const message = {
      notification: {
        title: title || "Notifica",
        body: body || "Hai una nuova comunicazione",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    res.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * HEALTHCHECK
 */
app.get("/", (req, res) => {
  res.send("Push server running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));