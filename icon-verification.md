# Vérification de l’icône de plateforme

La référence fournie présente une tuile noire aux angles arrondis, contenant un pictogramme blanc de tableau de bord composé de trois panneaux et d’un petit panneau inférieur droit.

L’icône intégrée reprend ce langage visuel monochrome : fond noir, panneaux blancs arrondis, absence de texte et contraste adapté aux petits formats. Elle est déclarée à la fois comme favicon, icône Apple et icône de plateforme (`VITE_APP_LOGO`).

Lors du premier contrôle de la page publique après checkpoint, la balise favicon servie référençait encore l’ancien logo Almaraïi. Après la propagation du déploiement, une requête publique sans cache a confirmé que les balises `icon` et `apple-touch-icon` pointent vers `/manus-storage/almaraii-dashboard-platform-icon_b0a08a86.png`.
