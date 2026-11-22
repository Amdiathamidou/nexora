# NEXORA — Plateforme intelligente de gestion du courrier et des circuits administratifs

## Architecture Technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4 (mode clair & mode sombre), Vite.
- **Backend** : Express (`server.ts`) avec isolation multi-entreprise par JWT / cookie HttpOnly.
- **Base de données** : SQLite persistante sur disque (`data/nexora.db` via `better-sqlite3`, mode WAL, clés étrangères activées).
- **Stockage documentaire** : Fichiers chiffrés d'accès côté serveur dans `data/uploads/<companyId>/` avec contrôle de confinement des chemins et permissions.
- **Intelligence Artificielle & OCR** : `@google/genai` (`gemini-4-hydrogen`) exécuté exclusivement côté serveur (`/api/ai/analyze`).
- **Notifications & E-mails départementaux** : `nodemailer` (si SMTP configuré) + journal persistant `email_logs` garantissant que dès qu'un agent reçoit un courrier, le chef de son département reçoit automatiquement un e-mail.

## Variables d'environnement

Voir `.env.example` :
- `GEMINI_API_KEY` : Clé API Gemini côté serveur pour la lecture OCR, l'extraction et les résumés.
- `APP_URL` : URL publique de l'application.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` *(optionnels)* : Configuration SMTP pour l'envoi réseau des e-mails. Sans SMTP, les e-mails sont consignés et consultables dans *Notifications & E-mails*.

## Commandes

- `npm install` : Installer les dépendances.
- `npm run dev` : Lancer le serveur full-stack sur le port `3000`.
- `npm run build` : Générer le bundle frontend dans `dist/`.
- `npm start` : Démarrer le serveur en production (`node server.ts`).
- `npm run lint` : Vérifier les types TypeScript (`tsc --noEmit`).

## Environnement de démonstration (NEXORA DEMO GROUP — Cotonou, Bénin)

Des boutons de connexion directe par rôle sont disponibles sur la page de connexion (`Admin`, `Président`, `Responsable Finances`, `Responsable Juridique`, `Secrétariat Central`, `Agent Finances`, `Super Admin NEXORA`).
