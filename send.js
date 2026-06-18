// Importa i moduli specifici necessari dall'SDK v11+/v12+
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const serviceAccount = require('./service-account.json');

// Inizializza l'app utilizzando la sintassi modulare moderna
initializeApp({
  credential: cert(serviceAccount)
});

// Sostituisci con il Token FCM che hai copiato dalla console di Flutter
const targetDeviceToken = 'fNsOx7dDRU2N76-MmeZXlH:APA91bGWUQg9gV-KHYvR4mEOlWqj7Yj8DN9yWa-dC7xRTacHIs5r-eDjhZ5qvygs6J1VdJBWk97slpQATqQQWv8QEi0m49jEZGeAKvJZWUfu7LPHQl5b9D0';

const message = {
  notification: {
    title: 'Ciao Utente!',
    body: 'Funziona! Questa è una notifica mirata inviata con la sintassi corretta.'
  },
  data: {
    click_action: 'FLUTTER_NOTIFICATION_CLICK',
    userId: '12345',
    sezione: 'profilo'
  },
  token: targetDeviceToken
};

// Invia il messaggio usando getMessaging()
getMessaging().send(message)
  .then((response) => {
    console.log('Notifica inviata con successo:', response);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Errore durante l\'invio:', error);
    process.exit(1);
  });