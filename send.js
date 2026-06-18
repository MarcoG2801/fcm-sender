const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Definizione del percorso del Secret File di Render
const renderSecretPath = '/etc/secrets/service-account.json';
const localSecretPath = './serviceAccountKey.json';

let serviceAccount;

// Controlla se il file esiste nel percorso dei Secret Files di Render
if (fs.existsSync(renderSecretPath)) {
  serviceAccount = require(renderSecretPath);
  console.log("Inizializzazione Firebase con il Secret File di Render.");
} else if (fs.existsSync(localSecretPath)) {
  serviceAccount = require(localSecretPath);
  console.log("Inizializzazione Firebase con il file locale (Sviluppo).");
} else {
  console.error("ERRORE: File delle credenziali Firebase non trovato!");
  process.exit(1); // Blocca l'applicazione se manca il file
}

// Inizializzazione Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Il resto del tuo endpoint rimane identico ---
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
      if (userData.token) tokens.push(userData.token);
    });

    if (tokens.length === 0) {
      return res.status(404).json({ message: 'Nessun token FCM trovato.' });
    }

    const message = {
      notification: { title, body },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      message: `Notifiche inviate a ${response.successCount} dispositivi.`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});