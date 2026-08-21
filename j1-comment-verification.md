# Vérification visuelle — commentaires Production J-1

Les rendus desktop (1440 × 1100) et mobile (375 × 812) confirment que la carte **Production J-1** affiche une zone « Commentaires de la journée ». Chaque ligne de production de la veille présente son observation (ou l’état vide explicite) et un bouton d’édition. La liste est volontairement défilable pour conserver une hauteur de carte maîtrisée lorsque plusieurs lignes sont présentes ; le bouton d’édition reste disponible sur chaque entrée visible.

La vérification navigateur automatisée confirme également le refus avec mot de passe incorrect et l’ouverture de la fenêtre d’édition après autorisation.

La version publiée a été vérifiée après chargement complet du registre : elle affiche la production J-1, les lignes du 19 août et l’état synchronisé du tableau de bord. Les contrôles interactifs d’édition sont validés par le scénario navigateur automatisé de sauvegarde puis restauration avec mot de passe.

Après le checkpoint final, la version publique a bien chargé les données de production mais la zone de commentaires n’était pas encore visible dans la page servie par le domaine. La vérification de propagation doit donc rester ouverte jusqu’à ce que le domaine public reflète le checkpoint `65a520af`.

Le diagnostic de la session navigateur a confirmé que le DOM du domaine public ne contenait pas encore `.daily-comments` et chargeait l’actif `index-C3om-Coj.js`, tandis qu’une requête distincte vers le domaine recevait l’actif plus récent contenant le libellé des commentaires. Il s’agit donc d’une propagation/cache d’actifs à confirmer, et non d’un échec du build local.

Une session fraîche ouverte après propagation confirme la version publiée : la carte Production J-1 rend « Commentaires de la journée », les trois lignes DG5, DG4 et DG3 du 19 août, ainsi que les trois boutons « Modifier le commentaire ». La publication est donc visible sur le domaine public.

Sur cette même version publiée, l’action « Modifier le commentaire de DG5 » a été ouverte sans modifier de donnée : elle affiche bien la fenêtre « Autoriser la modification du commentaire », avec champ de mot de passe, boutons Annuler et Continuer. La protection demandée est donc effective avant tout accès à l’éditeur.

Le compactage visuel a été vérifié en local à 1440 × 900 et 375 × 812. La carte conserve la lecture du total, des articles, des commentaires et des actions d’édition ; la liste des commentaires reste défilable lorsque les trois lignes de la veille sont présentes. Les styles inline accidentellement diffusés par l’éditeur visuel ont été retirés au profit d’une seule règle CSS sur la carte.

La dernière vérification du domaine public a confirmé la version publiée après chargement : elle affiche la carte Production J-1 compacte, les commentaires de la veille, y compris le commentaire renseigné de DG3, ainsi que les boutons de modification. La publication est active.
