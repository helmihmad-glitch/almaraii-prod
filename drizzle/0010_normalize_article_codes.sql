-- Codes article en majuscules, sans espaces autour : la saisie les normalise
-- désormais ainsi, et une même référence enregistrée « dg3 » d'un côté et
-- « DG3 » de l'autre tenait deux stocks séparés. Ne touche que les lignes
-- encore hors norme (aucun effet si toutes le sont déjà).
UPDATE "silo_production_entries" SET "article" = upper(btrim("article")) WHERE "article" <> upper(btrim("article"));
--> statement-breakpoint
UPDATE "silo_shipments" SET "article" = upper(btrim("article")) WHERE "article" <> upper(btrim("article"));
--> statement-breakpoint
UPDATE "production_records" SET "article" = upper(btrim("article")) WHERE "article" <> upper(btrim("article"));
