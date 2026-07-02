# Camping de Sagnat — App réservations

Application interne de gestion des arrivées. Mobile-first (iPad Safari).

---

## Architecture de sécurité

- **Firebase Auth** : contrôle l'accès à l'app (email + mot de passe)
- **Firestore** (région EU) : stocke les données
- **Chiffrement AES-GCM 256** : les données personnelles (nom, plaque, email, tel) sont chiffrées *avant* d'être envoyées à Firebase. Même Anthropic/Google ne peut pas les lire.
- **La clé de chiffrement** n'est jamais stockée nulle part — elle vit en mémoire pendant la session, dérivée de la phrase secrète.
- **EmailJS** : envoi des notes de séjour (+ copie automatique au camping pour archivage 10 ans RGPD)

---

## Mise en place — étape par étape

### 1. Firebase

1. Aller sur [console.firebase.google.com](https://console.firebase.google.com)
2. **Créer un projet** → choisir un nom (ex: `camping-sagnat`)
3. **Firestore Database** → Créer → **Region: `europe-west1`** → Mode production
4. **Rules** → coller le contenu de `firestore.rules` → Publier
5. **Authentication** → Sign-in method → Email/Password → Activer
6. **Authentication → Users** → Ajouter un utilisateur (ex: `camping.sagnat@gmail.com` + mot de passe fort)
7. **Project Settings** (roue dentée) → Your apps → `</>` Web → Enregistrer → copier l'objet `firebaseConfig`

### 2. EmailJS

1. Créer un compte sur [emailjs.com](https://www.emailjs.com)
2. **Email Services** → Add New Service → Gmail → connecter avec `camping.sagnat@gmail.com`
3. **Email Templates** → Create New Template :
   - **To Email** : `{{to_email}}`
   - **Reply To** : `{{reply_to}}`
   - **Subject** : `{{subject}}`
   - **Body** (HTML) : `{{{html_body}}}` ← **triple accolades** obligatoires pour le HTML
4. Sauvegarder → noter le **Template ID**
5. **Account → General** → copier la **Public Key**
6. **Email Services** → copier le **Service ID**

> **Limite gratuite** : 200 emails/mois. Upgrade à ~$9/mois si besoin.

### 3. Remplir `js/config.js`

Ouvrir `js/config.js` et remplacer chaque `"REMPLACER"` :

```js
export const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "camping-sagnat.firebaseapp.com",
  projectId:         "camping-sagnat",
  storageBucket:     "camping-sagnat.firebasestorage.app",
  messagingSenderId: "123456789",
  appId:             "1:123...",
};

export const emailjsConfig = {
  publicKey:  "abc123...",
  serviceId:  "service_xxx",
  templateId: "template_xxx",
};
```

> ✅ Ces clés sont **safe dans un repo public** : la sécurité Firebase vient des Firestore Rules (authentification obligatoire), pas du secret des clés.

### 4. GitHub + GitHub Pages

```bash
# Dans le dossier camping-sagnat/
git init
git add .
git commit -m "init"
git remote add origin https://github.com/TON_USERNAME/camping-sagnat.git
git push -u origin main
```

Puis dans GitHub : **Settings → Pages → Source: main branch / root** → Save.

L'app sera disponible sur : `https://TON_USERNAME.github.io/camping-sagnat/`

### 5. Premier lancement

1. Ouvrir l'URL sur l'iPad
2. **Safari → Partager → Sur l'écran d'accueil** (installe comme une app)
3. Se connecter avec l'email/mot de passe Firebase créé à l'étape 1
4. Choisir une **phrase de chiffrement** forte (ex: une phrase mémorisable)
   - Cette phrase ne peut pas être récupérée si oubliée
   - Toutes les personnes utilisant l'app doivent utiliser la **même phrase**
5. À la première connexion, le sel cryptographique est généré et stocké dans Firebase

---

## Utilisation quotidienne

**Arrivée d'un client :**
→ `+ Nouvelle arrivée` → remplir les infos → `Enregistrer`

**Envoi de la note de séjour :**
→ Ouvrir le séjour → `Générer & envoyer la note de séjour`
→ L'email part au client + une copie au camping (archive)

**Départ d'un client :**
→ Ouvrir le séjour → `Procéder au départ` → Confirmer
→ Les données personnelles sont anonymisées dans Firebase, les données financières sont conservées

**Stats :**
→ `Statistiques` → choisir une période → nuitées, revenu brut, taxe de séjour

---

## Structure des fichiers

```
camping-sagnat/
├── index.html          # App shell (toutes les vues)
├── css/
│   └── style.css       # Styles (palette Camping de Sagnat)
├── js/
│   ├── config.js       # ← À remplir (Firebase + EmailJS)
│   ├── crypto.js       # Chiffrement AES-GCM (Web Crypto API)
│   ├── db.js           # Firestore CRUD
│   ├── email.js        # EmailJS + génération HTML note de séjour
│   └── app.js          # Logique UI complète
├── firestore.rules     # Rules à copier dans la console Firebase
└── README.md
```

---

## À faire plus tard

- [ ] Forfait distinct pour les tentes (constante dans `config.js`)
- [ ] SIREN sur les notes de séjour si applicable
- [ ] Connexion avec le site du camping (quand le site existera)
