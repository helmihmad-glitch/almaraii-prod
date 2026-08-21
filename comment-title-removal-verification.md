# Vérification du retrait du titre des commentaires

La page publique, ouverte après propagation avec un paramètre de cache distinct, ne contient plus le texte « Commentaires de la journée ». Au premier rendu, le registre est encore en chargement ; une vérification après chargement confirme la conservation des lignes de commentaire et des boutons de modification.

Le contrôle direct du dernier bundle public confirme l’absence du titre et la présence de l’action de modification. Une session navigateur a néanmoins reçu un ancien bundle mis en cache. Après propagation complète, une session fraîche confirme que le titre est absent, tandis que les deux lignes de commentaires DG3 et DG4 ainsi que leurs boutons de modification sont toujours visibles.
