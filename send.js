const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const renderSecretPath = '/etc/secrets/service-account.json';
const localSecretPath = './serviceAccountKey.json';

let serviceAccountData;

try {
  if (fs.existsSync(renderSecretPath)) {
    // Forza la lettura del file grezzo da Render (Evita la cache di require)
    const rawData = fs.readFileSync(renderSecretPath, 'utf8');
    serviceAccountData = JSON.parse(rawData);
    console.log("✅ Secret File di Render letto con successo via fs.readFileSync.");
  } else if (fs.existsSync(localSecretPath)) {
    const rawData = fs.readFileSync(localSecretPath, 'utf8');
    serviceAccountData = JSON.parse(rawData);
    console.log("🏠 File locale (Sviluppo) letto con successo.");
  } else {
    throw new Error("Nessun file di credenziali trovato nei percorsi specificati.");
  }

  // Inizializzazione esplicita passando l'oggetto certificato
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountData)
  });
  
  console.log("🚀 Firebase Admin SDK inizializzato correttamente!");

} catch (err) {
  console.error("❌ ERRORE CRITICO INIZIALIZZAZIONE FIREBASE:", err.message);
  // Stampiamo le prime righe del path per capire cosa sta vedendo il server (senza mostrare la chiave privata)
  if (fs.existsSync(renderSecretPath)) {
     const testRead = fs.readFileSync(renderSecretPath, 'utf8').substring(0, 100);
     console.log("Anteprima del file su Render per debug: ", testRead);
  }
  process.exit(1);
}

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