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

Les chemins `/api/trpc/*`, `/api/oauth/callback` et `/manus-storage/*` sont relayés explicitement vers l’unique fonction `api/index.ts`, qui restitue le chemin initial à Express. L’application Express est chargée à la première requête et les modules serveur sont explicitement inclus dans la fonction. Si ce chargement échoue, la route renvoie un objet d’erreur tRPC JSON, et non une page HTML. Les mutations `POST` tRPC restent donc dirigées vers la fonction Node ; elles ne sont jamais envoyées vers le frontend statique. Les autres URL sont renvoyées vers le frontend afin que les routes React fonctionnent après actualisation.

## Import Excel et logo

L’import Excel téléverse désormais le fichier directement vers le stockage avant son traitement : le fichier ne passe donc plus dans le corps de la fonction Vercel, limité à 4,5 Mo. Les variables `BUILT_IN_FORGE_API_URL` et `BUILT_IN_FORGE_API_KEY` restent indispensables dans Vercel pour générer ces liens temporaires de téléversement et synchroniser le fichier Excel.

Le logo et le favicon utilisent une URL publique dédiée afin d’être visibles depuis Vercel, sans dépendre d’un chemin relatif `/manus-storage` sur votre domaine Vercel.
