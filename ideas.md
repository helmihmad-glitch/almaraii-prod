# Direction artistique — Dashboard Production

## Approches envisagées

### Approche 1 — Atelier Signal
Une interface de pilotage industrielle claire, éditoriale et chaleureuse : fond ivoire, encre profonde, orange signal et bleus de contrôle. L’objectif est de rendre les chiffres immédiatement lisibles sans donner une impression de logiciel administratif générique.

**Probability:** 0.07

### Approche 2 — Control Room Graphite
Un cockpit sombre et dense, inspiré des salles de contrôle et de la supervision temps réel, avec contrastes élevés et accents lumineux.

**Probability:** 0.03

### Approche 3 — Bulletin Opérations
Une esthétique de rapport imprimé modernisé : papier clair, repères typographiques, lignes fines, tableaux structurés et touches de couleur restreintes.

**Probability:** 0.09

## Approche retenue — Atelier Signal

### Design Movement
Modernisme industriel éditorial, inspiré des tableaux de suivi d’usine, des carnets d’atelier et de la signalétique de production contemporaine.

### Core Principles
1. **La lecture avant la décoration :** chaque écran doit répondre rapidement à « où en sommes-nous ? » et « que faut-il surveiller ? ».
2. **Une hiérarchie asymétrique :** un rail latéral stable, une zone de synthèse forte, puis des cartes de détail qui respirent.
3. **Des signaux maîtrisés :** l’orange identifie l’attention opérationnelle, le bleu structure les données, le vert confirme une situation saine.
4. **Une matière discrète :** ombres douces, trame papier et bordures fines donnent de la profondeur sans surcharger les graphiques.

### Color Philosophy
Le fond ivoire réduit la fatigue visuelle sur les longues sessions. L’encre bleu-noir évoque la précision et la fiabilité. Le corail orange est une couleur de signal : elle attire l’œil vers l’objectif, les écarts et les actions. Le bleu ardoise sert de repère stable pour les indicateurs et les catégories.

### Layout Paradigm
Un rail latéral vertical pour le contexte et la navigation, puis une composition en « feuille de production » : bandeau de période, objectif mensuel mis en scène comme une jauge, indicateurs alignés sur une ligne de mesure, et un grand graphe de tendance ancré à gauche. Les détails opérationnels apparaissent dans une colonne secondaire, plutôt que dans une grille uniforme.

### Signature Elements
- Une trame de micro-points inspirée du papier millimétré, visible dans les zones de fond.
- Des étiquettes capitales compactes avec petit repère orange, comme des panneaux de ligne.
- Une jauge de progression horizontale épaisse, terminée par un marqueur « aujourd’hui ».

### Interaction Philosophy
Les filtres de mois et de ligne doivent être immédiats, réversibles et visibles. Les boutons ont des états nets, les cartes réagissent par un léger déplacement plutôt que par des effets lumineux. Les éléments non disponibles sont explicitement signalés au lieu de faire semblant d’être actifs.

### Animation
Les cartes entrent avec un décalage très court de 40 ms, uniquement via opacité et translation verticale. Les jauges se remplissent une seule fois à l’arrivée. Les infobulles et menus restent rapides, sous 220 ms. Les transitions d’état ne dépassent pas 180 ms et respectent `prefers-reduced-motion`.

### Typography System
**Space Grotesk** pour les titres, les valeurs et les repères de navigation : géométrique, technique, mais moins froide qu’une police système. **IBM Plex Sans** pour les libellés, les tableaux et les textes d’aide. Les chiffres importants utilisent une graisse 600/700 et un interlettrage légèrement resserré.

### Brand Essence
**Almaraïi Production Pulse** est le poste de pilotage visuel des équipes de production qui veulent décider à partir des écarts réels, pas seulement consulter des feuilles de calcul.

Personnalité : **précise, pragmatique, rassurante**.

### Brand Voice
Les titres sont directs et orientés décision. Les CTA décrivent une action concrète, jamais une promesse vague. Les microcopies indiquent la période, la source et le niveau de confiance.

Exemple de titre : « La cadence tient l’objectif — surveiller les rebuts ».

Exemple de CTA : « Voir le détail de la ligne ».

### Wordmark & Logo
Un monogramme abstrait « AP » construit comme deux bandes de convoyeur qui se croisent, sans écrire le nom en toutes lettres. Le symbole apparaît dans le rail latéral et dans le favicon à taille visible.

### Signature Brand Color
**Orange Signal #F06B3C** — un orange terre cuite, énergique mais suffisamment mat pour rester crédible dans un contexte industriel.
