# Rapports de mission — suivi pourboires

PWA mobile-first (iPhone) pour le suivi individuel des interventions aéroportuaires et des pourboires. App perso mono-utilisateur, distincte de l'extracteur de planning : elle consomme les rapports générés ailleurs pour produire des statistiques.

## Stack

| Couche | Techno |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS v4 |
| PWA | vite-plugin-pwa |
| Cache local | IndexedDB (Dexie) |
| Backend / BDD | Supabase (PostgreSQL) |

## Architecture de persistance

Source de vérité distante (Supabase). IndexedDB sert de cache de session et de file d'écritures hors-ligne pour absorber les micro-coupures réseau en zone aéroport. Chaque mission reçoit un UUID généré côté client à la saisie, ce qui rend les écritures idempotentes (`upsert`) et élimine les doublons en cas de retry. La purge WebKit 7 jours est sans effet : la vérité vit côté serveur.

## Installation

1. Cloner et installer
   ```
   npm install
   ```
2. Créer un projet sur supabase.com, puis dans **SQL Editor** exécuter `supabase/schema.sql`.
3. Créer ton compte unique : **Authentication → Users → Add user**. Couper les inscriptions publiques : **Authentication → Providers → Email → Enable signups = off**.
4. Copier `.env.example` en `.env.local` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Settings → API).
5. Lancer
   ```
   npm run dev
   ```

## Déploiement

`npm run build` génère `dist/`. Héberger sur Netlify, Vercel ou GitHub Pages. Définir les variables d'environnement `VITE_*` côté plateforme de build.

> GitHub Pages : configurer `base` dans `vite.config.js` si le dépôt n'est pas servi à la racine du domaine.

## Installation iOS (PWA)

Safari → Partager → « Sur l'écran d'accueil ». L'app s'ouvre en plein écran (`display: standalone`). La session Supabase persiste localement ; une reconnexion occasionnelle peut être requise après inactivité prolongée.

## Sécurité

- `anon key` exposée dans le bundle (normal) ; l'isolation repose sur RLS PostgreSQL (`auth.uid() = user_id`).
- Ne jamais committer la `service_role key` ni `.env.local`.
