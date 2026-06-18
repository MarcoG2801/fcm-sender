const express = require('require'); // Nota: se usi commonjs mantieni express così
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { getFirestore } = require('firebase-admin/firestore');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors()); // Abilita i permessi di comunicazione cross-origin (fondamentale per Flutter Web)

// Percorso di default in cui Render salva i "Secret Files"
const serviceAccountPath = '/etc/secrets/service-account.json';
let serviceAccount;

try {
  // Legge il file in modo sincrono all'avvio del server
  const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountRaw);
  console.log("✅ File service-account.json caricato e letto con successo.");
} catch (err) {
  console.error("❌ ERRORE CRITICO: Impossibile leggere il file service-account.json su Render!", err);
  process.exit(1); // Blocca l'avvio del server in caso di errore di autenticazione
}

// Inizializza l'app Firebase Admin con le credenziali del file segreto
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Endpoint aggiornato per inviare le notifiche filtrate per centro estivo
app.post('/api/send-notification', async (req, res) => {
  try {
    const { centroId, title, body } = req.body;

    // Controllo validità del parametro inviato da Flutter
    if (!centroId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Il parametro centroId è obbligatorio nel body della richiesta.' 
      });
    }

    // Eseguiamo la query su Firestore filtrando per il centro estivo specifico
    // NOTA: Usa .where('centriIds', 'array-contains', centroId) se nel tuo DB 'centriIds' è un Array []
    const usersSnapshot = await db.collection('users')
      .where('centriIds', '==', centroId)
      .get();

    const tokens = [];

    // Estraiamo i token dei soli utenti che appartengono a quel centro
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.token) {
        tokens.push(userData.token);
      }
    });

    // Se nessun utente soddisfa i criteri, restituiamo un errore 404
    if (tokens.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `Nessun token trovato per il centroId: ${centroId}` 
      });
    }

    const notificationTitle = title || 'Ciao Utente!';
    const notificationBody = body || 'Nuova notifica!';

    // Costruzione del messaggio Multicast per l'invio in blocco (fino a 500 token alla volta)
    const message = {
      notification: { 
        title: notificationTitle, 
        body: notificationBody 
      },
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        sezione: 'profilo',
        centroId: centroId
      },
      tokens: tokens 
    };

    // Invio effettivo tramite Firebase Cloud Messaging (FCM)
    const response = await getMessaging().sendEachForMulticast(message);
    
    console.log(`Notifiche inviate. Successi: ${response.successCount}, Fallimenti: ${response.failureCount}`);

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

// Porta dinamica richiesta da Render o fallback sulla 3000 locale
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});