const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');
const cors = require('cors'); // Consigliato per evitare blocchi dall'app Flutter Web

const app = express();
app.use(express.json());
app.use(cors()); // Abilita i permessi di comunicazione cross-origin

// Recuperiamo la stringa delle credenziali dalle variabili d'ambiente
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountRaw) {
  console.error("ERRORE: La variabile FIREBASE_SERVICE_ACCOUNT non è configurata!");
  process.exit(1);
}

// Convertiamo la stringa JSON in un oggetto JavaScript
const serviceAccount = JSON.parse(serviceAccountRaw);

// Inizializza l'app Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Endpoint per inviare le notifiche
app.post('/api/send-notification', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const tokens = [];

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.token) {
        tokens.push(userData.token);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ success: false, message: 'Nessun token trovato nel DB.' });
    }

    const title = req.body.title || 'Ciao Utente!';
    const body = req.body.body || 'Nuova notifica!';

    const message = {
      notification: { title, body },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sezione: 'profilo'
      },
      tokens: tokens 
    };

    const response = await getMessaging().sendEachForMulticast(message);
    
    res.status(200).json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount
    });

  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});