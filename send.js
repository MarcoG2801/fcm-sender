const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const cors = require('cors'); // <-- 1. Importa CORS

const app = express();

app.use(cors()); // <-- 2. Abilita CORS per tutte le richieste (permette a Flutter Web di connettersi)
app.use(express.json());

// Percorso del Secret File impostato su Render
// In locale cercherà il file nella stessa cartella, su Render lo cercherà in /etc/secrets/
const secretPath = process.env.NODE_ENV === 'production' 
  ? '/etc/secrets/service-account.json' 
  : path.join(__dirname, 'service-account.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(secretPath)
  });
  console.log("Firebase Admin inizializzato con successo tramite Secret File.");
} catch (error) {
  console.error("Errore durante l'inizializzazione di Firebase:", error);
}

const db = admin.firestore();

// Endpoint per inviare le notifiche ai membri di un centro specifico
app.post('/api/send-notification-by-centro', async (req, res) => {
    const { centroId, title, body } = req.body;

    if (!centroId || !title || !body) {
        return res.status(400).json({ error: 'Campi mancanti: centroId, title e body sono richiesti.' });
    }

    try {
        // 1. Cerca gli utenti che contengono il centroId nell'array 'centriIds'
        const usersSnapshot = await db.collection('users')
            .where('centriIds', 'array-contains', centroId)
            .get();

        if (usersSnapshot.empty) {
            return res.status(404).json({ message: 'Nessun utente trovato per questo centro.' });
        }

        // 2. Estrai i token FCM validi
        const tokens = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.token) {
                tokens.push(userData.token);
            }
        });

        if (tokens.length === 0) {
            return res.status(404).json({ message: 'Nessun token dispositivo trovato per gli utenti di questo centro.' });
        }

        // 3. Costruisci il messaggio Multicast per inviare a più token contemporaneamente
        const message = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens, // Array di stringhe (i token recuperati)
        };

        // 4. Invia tramite Firebase Messaging
        const response = await admin.messaging().sendEachForMulticast(message);
        
        return res.status(200).json({
            message: 'Processo di invio completato.',
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error("Errore durante l'invio della notifica:", error);
        return res.status(500).json({ error: 'Errore interno del server.', dettagli: error.message });
    }
});

// Porta dinamica richiesta da Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server in esecuzione sulla porta ${PORT}`);
});