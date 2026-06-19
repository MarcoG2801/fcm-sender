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

    // 🔍 1. Prendi gli utenti che appartengono al centro
    const userSnapshot = await db
      .collection("users")
      .where("centriIds", "array-contains", centroId)
      .get();

    if (userSnapshot.empty) {
      return res.json({ message: "Nessun utente trovato per questo centro" });
    }

    // Mappatura per tenere traccia di quale token appartiene a quale documento Firestore (ci serve per la cancellazione)
    const tokenMapping = []; // Array di oggetti: { token: string, userRef: DocumentReference, deviceDocId: string }
    const tokens = [];       // Array di sole stringhe token per il multicast di FCM

    // 🔑 2. Recupera i token dalle sotto-collezioni di ciascun utente in parallelo
    const tokenPromises = userSnapshot.docs.map(async (userDoc) => {
      const tokensSnapshot = await userDoc.ref.collection("tokens").get();
      
      tokensSnapshot.forEach((tokenDoc) => {
        const tokenData = tokenDoc.data();
        if (tokenData.fcmToken) {
          tokens.push(tokenData.fcmToken);
          tokenMapping.push({
            token: tokenData.fcmToken,
            userRef: userDoc.ref,
            deviceDocId: tokenDoc.id // Questo è il deviceId usato come ID del documento
          });
        }
      });
    });

    // Attendiamo che tutte le letture delle sotto-collezioni siano completate
    await Promise.all(tokenPromises);

    if (tokens.length === 0) {
      return res.json({ message: "Nessun token disponibile per gli utenti di questo centro" });
    }

    // 📲 3. Invio push multicast
    const message = {
      notification: {
        title: title || "Notifica",
        body: body || "Hai una nuova comunicazione",
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    // 🧹 4. Pulizia automatica dei token non più validi (Disinstallazioni o Scadenze)
    if (response.failureCount > 0) {
      const deletionPromises = [];

      response.responses.forEach((res, index) => {
        if (!res.success) {
          const error = res.error;
          // Controlla se l'errore indica un token non più valido
          if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered"
          ) {
            const obsoleteTokenData = tokenMapping[index];
            
            // Riferimento al documento del dispositivo obsoleto da eliminare
            const expiredTokenRef = obsoleteTokenData.userRef
              .collection("tokens")
              .doc(obsoleteTokenData.deviceDocId);

            deletionPromises.push(expiredTokenRef.delete());
            console.log(`[PULIZIA] Rimozione token obsoleto del dispositivo: ${obsoleteTokenData.deviceDocId}`);
          }
        }
      });

      // Esegui tutte le eliminazioni in parallelo senza bloccare la risposta principale
      if (deletionPromises.length > 0) {
        Promise.all(deletionPromises).catch((err) => 
          console.error("Errore durante la pulizia dei token obsoleti:", err)
        );
      }
    }

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