const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- INIZIALIZZAZIONE SICURA DI FIREBASE ---
const secretFilePath = path.join(__dirname, 'serviceAccountKey.json');

try {
  if (fs.existsSync(secretFilePath)) {
    // Se il file esiste (sia in locale che tramite Secret File di Render)
    const serviceAccount = require(secretFilePath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK inizializzato correttamente tramite file JSON.");
  } else {
    // Alternativa di emergenza: se decidi in futuro di usare una stringa nelle variabili d'ambiente
    if (process.env.FIREBASE_CONFIG) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin SDK inizializzato tramite variabile d'ambiente.");
    } else {
      throw new Error("File serviceAccountKey.json mancante e nessuna variabile d'ambiente trovata.");
    }
  }
} catch (error) {
  console.error("Errore critico durante l'inizializzazione di Firebase:", error.message);
  process.exit(1); // Blocca l'app se Firebase non può partire
}

const db = admin.firestore();
// -------------------------------------------

// Endpoint per inviare le notifiche (rimane invariato)
app.post('/api/send-notification', async (req, res) => {
  const { centroId, title, body } = req.body;

  if (!centroId || !title || !body) {
    return res.status(400).json({ error: 'Campi mancanti.' });
  }

  try {
    const usersSnapshot = await db.collection('users')
      .where('centriIds', 'array-contains', centroId)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ message: 'Nessun utente trovato per questo centro.' });
    }

    const tokens = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.token) {
        tokens.push(userData.token);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ message: 'Nessun token valido trovato.' });
    }

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      message: `Inviate con successo a ${response.successCount} dispositivi.`
    });

  } catch (error) {
    console.error("Errore invio:", error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});