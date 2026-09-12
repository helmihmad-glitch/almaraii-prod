// Applique les migrations Drizzle à la base Postgres pendant le build Vercel.
//
// Le build est l’endroit naturel pour cela : il s’exécute une seule fois par
// déploiement, avec accès aux variables d’environnement du projet, contrairement
// aux fonctions serverless qui démarrent en parallèle à chaque requête.
//
// Sans URL de base de données (build local, aperçu sans base connectée), le
// script ne fait rien et laisse le build se terminer normalement.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

if (!databaseUrl) {
  console.warn("[Migrate] Aucune base de données configurée (DATABASE_URL) : migrations ignorées.");
  process.exit(0);
}

try {
  const db = drizzle(neon(databaseUrl));
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[Migrate] Migrations appliquées avec succès.");
} catch (error) {
  console.error("[Migrate] Échec de l’application des migrations :", error);
  process.exit(1);
}
