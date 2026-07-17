# Camping de Sagnat — App réservations

Application interne de gestion des arrivées. Mobile-first (iPad Safari).

---

## Architecture de sécurité

- **Firebase Auth** : contrôle l'accès à l'app
- **Firestore** (région EU) : stocke les données
- **Chiffrement AES-GCM 256** : données personnelles chiffrées avant envoi à Firebase
- **La clé de chiffrement** vit uniquement en mémoire — jamais stockée
- **EmailJS** : envoi des notes de séjour + avenants + copie automatique au camping

---

## Mise en place

### 1. Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → Créer un projet
2. Firestore Database → Créer → **Region: `europe-west1`** → Mode production
3. Rules → coller le contenu de `firestore.rules` → Publier
4. Authentication → Email/Password → Activer
5. Authentication → Users → Ajouter un utilisateur
6. Project Settings → Your apps → Web app → copier `firebaseConfig`

### 2. EmailJS

1. [emailjs.com](https://www.emailjs.com) → compte gratuit
2. Email Services → Add New Service → Gmail (ou SMTP)
3. Email Templates → Create New Template :
   - **To Email** : `{{to_email}}`
   - **Reply To** : `{{reply_to}}`
   - **Subject** : `{{subject}}`
   - **Body (HTML)** : `{{{html_body}}}` ← triple accolades obligatoires
4. Copier Public Key, Service ID, Template ID

### 3. Remplir `js/config.js`

Remplacer chaque `"REMPLACER"` par vos vraies valeurs.
`nbPrises: 43` est déjà configuré.

### 4. GitHub + Pages

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TON_USERNAME/camping-sagnat.git
git push -u origin main
```

Settings → Pages → Source: main → Save.

### 5. Premier lancement

1. Ouvrir l'URL sur l'iPad
2. Safari → Partager → Sur l'écran d'accueil
3. Se connecter avec l'email/mot de passe Firebase
4. Choisir une phrase de chiffrement forte (la même pour tous les appareils)

---

## Utilisation

| Action | Comment |
|--------|---------|
| Nouvelle arrivée | `+ Nouvelle arrivée` → remplir → Enregistrer |
| Note de séjour | Ouvrir le séjour → `Générer la note de séjour` → Envoyer |
| Modifier un séjour | Ouvrir → `Modifier le séjour` → nouvelles dates → `Générer l'avenant` |
| Départ | Ouvrir → `Procéder au départ` → Confirmer |
| Anonymisation auto | 3 jours après le départ, données perso effacées automatiquement |
| Stats | `Statistiques` → choisir une période |

---

## Structure

```
camping-sagnat/
├── index.html          # App (toutes les vues)
├── css/style.css       # Styles
├── js/
│   ├── config.js       # ← À remplir (Firebase + EmailJS + tarifs)
│   ├── crypto.js       # Chiffrement AES-GCM
│   ├── db.js           # Firestore
│   ├── email.js        # EmailJS + HTML notes/avenants
│   └── app.js          # Logique UI
├── firestore.rules     # À copier dans Firebase Console
└── README.md
```

---

## À faire

- [ ] Forfait distinct pour les tentes (constante dans `config.js`)
- [ ] SIREN sur les documents si applicable (`config.js` → `siren`)
