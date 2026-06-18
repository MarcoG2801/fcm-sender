const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors()); // Previene i blocchi CORS su Flutter Web

// Percorso in cui Render salva il Secret File
const serviceAccountPath = '/etc/secrets/service-account.json';
let serviceAccount;

try {
  const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountRaw);
  console.log("✅ Credenziali service-account.json lette con successo.");
} catch (err) {
  console.error("❌ ERRORE CRITICO: File di configurazione assente su Render!", err);
  process.exit(1);
}

// Inizializzazione Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

app.post('/api/send-notification', async (req, res) => {
  try {
    const { centroId, title, body } = req.body;

    if (!centroId) {
      return res.status(400).json({ success: false, message: 'Parametro centroId mancante.' });
    }

    const tokens = [];

    // --- STRATEGIA 1: Cerca se centriIds è salvato come stringa singola ---
    const snapshotString = await db.collection('users')
      .where('centriIds', '==', centroId)
      .get();

    snapshotString.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken && !tokens.includes(data.fcmToken)) {
        tokens.push(data.fcmToken);
      }
    });

    // --- STRATEGIA 2: Cerca se centriIds è salvato come Array (Lista) ---
    const snapshotArray = await db.collection('users')
      .where('centriIds', 'array-contains', centroId)
      .get();

    snapshotArray.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken && !tokens.includes(data.fcmToken)) {
        tokens.push(data.fcmToken);
      }
    });

    // Se l'array finale dei token è ancora vuoto
    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Nessun utente trovato con un fcmToken valido per il centro: ${centroId}`
      });
    }

    // Configurazione del messaggio FCM
    const message = {
      notification: {
        title: title || 'Notifica Centro',
        body: body || 'Nuovo messaggio disponibile.'
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sezione: 'profilo',
        centroId: centroId
      },
      tokens: tokens
    };

    // Invio multicast (supporta liste fino a 500 token simultanei)
    const response = await getMessaging().sendEachForMulticast(message);
    
    console.log(`[FCM] Inviate. Successi: ${response.successCount}, Falliti: ${response.failureCount}`);

    return res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });

  } catch (error) {
    console.error('Errore interno del server:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});