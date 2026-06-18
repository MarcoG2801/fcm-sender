const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors');

const app = express();

// Abilita i CORS per permettere a Flutter Web (e ad altre piattaforme) di comunicare con il backend
app.use(cors());

// Middleware per fare il parsing dei body in formato JSON
app.use(express.json());

// Configurazione del percorso del Secret File
// In produzione su Render leggerà il file da '/etc/secrets/'
// In locale cercherà il file 'firebase-service-account.json' nella stessa cartella del progetto
const secretPath = process.env.NODE_ENV === 'production' 
  ? '/etc/secrets/service-account.json' 
  : path.join(__dirname, 'service-account.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(secretPath)
  });
  console.log("Firebase Admin inizializzato con successo tramite Secret File.");
} catch (error) {
  console.error("Errore durante l'inizializzazione di Firebase Admin:", error);
}

const db = admin.firestore();

/**
 * POST /api/send-notification-by-centro
 * Invia una notifica push multicast a tutti gli utenti legati a uno specifico centroId
 */
app.post('/api/send-notification-by-centro', async (req, res) => {
    const { centroId, title, body } = req.body;

    // Validazione dei dati in ingresso
    if (!centroId || !title || !body) {
        return res.status(400).json({ 
            error: 'Campi mancanti: centroId, title e body sono richiesti nel body della richiesta.' 
        });
    }

    try {
        // 1. Recupera i documenti della collezione 'users' dove l'array 'centriIds' contiene il centroId richiesto
        const usersSnapshot = await db.collection('users')
            .where('centriIds', 'array-contains', centroId)
            .get();

        if (usersSnapshot.empty) {
            return res.status(404).json({ 
                message: `Nessun utente trovato associato al centroId: ${centroId}` 
            });
        }

        // 2. Estrai i token dei dispositivi (campo 'token' nel documento di Firestore)
        const tokens = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.token && typeof userData.token === 'string') {
                tokens.push(userData.token);
            }
        });

        // Se nessun utente tra quelli trovati possiede un token FCM registrato
        if (tokens.length === 0) {
            return res.status(404).json({ 
                message: 'Trovati utenti associati al centro, ma nessuno possiede un token dispositivo valido.' 
            });
        }

        // 3. Prepara la struttura del messaggio Multicast per Firebase Cloud Messaging
        const message = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens, // Array contenente la stringa/stringhe dei token dei dispositivi
        };

        // 4. Invia le notifiche push
        const response = await admin.messaging().sendEachForMulticast(message);
        
        console.log(`Notifiche inviate. Successi: ${response.successCount}, Fallimenti: ${response.failureCount}`);

        return res.status(200).json({
            message: 'Operazione di invio completata.',
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error("Errore interno durante il recupero o l'invio delle notifiche:", error);
        return res.status(500).json({ 
            error: 'Errore interno del server.', 
            dettagli: error.message 
        });
    }
});

// Gestione della porta dinamica (richiesta per il corretto avvio su Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
});