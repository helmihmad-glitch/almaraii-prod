import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` ne se connecte pas à la base : seules les commandes
// `migrate`, `push` et `studio` exigent une URL réellement joignable.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
