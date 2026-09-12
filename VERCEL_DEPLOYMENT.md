# Déploiement Vercel

Le projet contient désormais `vercel.json`. Il force Vercel à construire l’application avec `pnpm build` et à servir le répertoire **`dist/public`**, qui contient le vrai frontend Vite (`index.html` et ses assets). Le fichier `dist/index.js` est seulement le bundle Node/Express : il ne doit jamais être sélectionné comme répertoire de sortie, car il affiche du JavaScript brut dans le navigateur.

## Réglages du projet Vercel

| Réglage | Valeur |
|---|---|
| Framework preset | Other |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Output directory | `dist/public` |
| Node.js | 22.x |

Ne renseignez pas `dist` ou `dist/index.js` comme **Output Directory**. Après le prochain import GitHub, lancez un nouveau déploiement afin que Vercel utilise `vercel.json`.

## Variables d’environnement

Ajoutez dans Vercel les mêmes variables que celles du projet actuel, sans jamais committer leurs valeurs : `DATABASE_URL`, `JWT_SECRET`, `COMMENT_EDIT_PASSWORD`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY`, `OWNER_OPEN_ID` et `OWNER_NAME`.

Les chemins `/api/trpc/*`, `/api/oauth/callback` et `/manus-storage/*` sont relayés explicitement vers l’unique fonction `api/index.js`, qui restitue le chemin initial à Express. Les mutations `POST` tRPC restent donc dirigées vers la fonction Node ; elles ne sont jamais envoyées vers le frontend statique. Les autres URL sont renvoyées vers le frontend afin que les routes React fonctionnent après actualisation.

### `api/index.js` : fichier généré, mais committé

Le code source de la fonction vit dans `server/_core/vercelEntry.ts`. `pnpm build` le compile avec esbuild (`--bundle --packages=external`) en un unique fichier autonome `api/index.js`, sans aucun import relatif restant à résoudre au démarrage (c’est ce qui provoquait auparavant `ERR_MODULE_NOT_FOUND: server/_core/app`).

**`api/index.js` doit rester committé dans Git**, même s’il est généré : Vercel vérifie que le fichier ciblé par `functions` dans `vercel.json` existe déjà dans le dépôt cloné *avant* d’exécuter `buildCommand` (sinon : erreur `unmatched-function-pattern`). Le contenu committé n’a pas besoin d’être à jour à chaque commit — le `buildCommand` de Vercel régénère toujours `api/index.js` avec `pnpm build` avant d’empaqueter la fonction — mais le fichier doit exister pour que Vercel accepte la configuration.

## Import Excel et logo

L’import Excel téléverse désormais le fichier directement vers le stockage avant son traitement : le fichier ne passe donc plus dans le corps de la fonction Vercel, limité à 4,5 Mo.

`BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` ne sont disponibles que sur l’hébergement Manus — sur Vercel, activez plutôt **Vercel Blob** :

1. Dans le tableau de bord Vercel → votre projet → onglet **Storage** → **Create Database** → **Blob** → connectez-le au projet.
2. Vercel ajoute automatiquement les variables nécessaires au projet (selon la version : soit `BLOB_READ_WRITE_TOKEN`, soit `BLOB_STORE_ID` associé à un jeton OIDC injecté automatiquement) — aucune valeur à copier manuellement.
3. **Redéployez après avoir connecté le store** : Vercel n’applique les nouvelles variables qu’aux déploiements suivants, jamais à un déploiement déjà en cours d’exécution (Deployments → menu **⋯** du déploiement le plus récent → **Redeploy**). Dès que `BLOB_READ_WRITE_TOKEN` ou `BLOB_STORE_ID` est présent, `server/storage.ts` l’utilise automatiquement, pour l’import Excel (upload direct navigateur → Blob via `/api/blob-upload`) comme pour le fichier Excel synchronisé.

Sans Forge ni Vercel Blob configuré, le stockage retombe sur le système de fichiers local, qui ne fonctionne qu’en développement (le système de fichiers d’une fonction Vercel est en lecture seule).

Le logo et le favicon utilisent une URL publique dédiée afin d’être visibles depuis Vercel, sans dépendre d’un chemin relatif `/manus-storage` sur votre domaine Vercel.
