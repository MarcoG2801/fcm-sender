const express = require('express');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');
const cors = require('cors'); // Consigliato per evitare blocchi dall'app Flutter Web

const app = express();
app.use(express.json());
app.use(cors()); // Abilita i permessi di comunicazione cross-origin

// Recuperiamo la stringa delle credenziali dalle variabili d'ambiente
const serviceAccountPath = '/etc/secrets/service-account.json'; // Percorso di default dei Secret Files su Render
let serviceAccount;

try {
  const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountRaw);
} catch (err) {
  console.error("ERRORE: Impossibile leggere il file service-account.json!", err);
  process.exit(1);
}
// Convertiamo la stringa JSON in un oggetto JavaScript
const serviceAccount = JSON.parse(serviceAccountRaw);

// Inizializza l'app Firebase Admin
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Endpoint aggiornato per inviare le notifiche filtrate per centro estivo
app.post('/api/send-notification', async (req, res) => {
  try {
    const { centroId, title, body } = req.body;

    if (!centroId) {
      return res.status(400).json({ success: false, message: 'Il parametro centroId è obbligatorio.' });
    }

    // Eseguiamo una query filtrando per il centro estivo specifico
    // Nota: usa .where('centriIds', 'array-contains', centroId) se centriIds è un array nel DB
    const usersSnapshot = await db.collection('users')
      .where('centriIds', 'array-contains', centroId)
      .get();

    const tokens = [];

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.token) {
        tokens.push(userData.token);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ success: false, message: 'Nessun token trovato per questo centro estivo.' });
    }

    const notificationTitle = title || 'Ciao Utente!';
    const notificationBody = body || 'Nuova notifica!';

    const message = {
      notification: { title: notificationTitle, body: notificationBody },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sezione: 'profilo',
        centroId: centroId // Può essere utile lato client
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
    console.error('Errore durante l\'invio delle notifiche:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});