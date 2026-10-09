# Genesis Bastion — Godot 4.3 Engine Edition (`v0.14.0-godot4-engine-edition`)

Bienvenue dans l'édition **Godot 4.3 Engine** de **Genesis Bastion** (branche `godot-4-engine`), portée intégralement depuis le prototype Three.js vers une architecture native **Godot 4.3 GDScript** avec export **HTML5 / WebAssembly** en direct sur le port **`5175`**.

---

## 🌐 Accès Direct aux 3 Éditions en Parallèle

| Édition | URL Live | Branche Git | Technologie |
| :--- | :--- | :--- | :--- |
| **1. Godot 4.3 Engine Edition (NOUVEAU)** | **`http://giom-us.c.googlers.com:5175/`** | **`godot-4-engine`** | **Godot 4.3 (`GDScript` + `WebAssembly` + `.glb`)** |
| **2. Three.js + Blender 5.0 3D (`.glb`)** | `http://giom-us.c.googlers.com:5173/` | `blender-3d-models` / `main` | Three.js WebGL2 + 14 modèles `.glb` low-poly |
| **3. Three.js Classique Procédural** | `http://giom-us.c.googlers.com:5174/` | `v0.9-classic-procedural` | Three.js WebGL2 Procédural |

---

## 🏗️ Architecture Modulaire Godot 4.3 (`res://`)

- **`project.godot` & `export_presets.cfg`** : Configuration Godot 4.3 (`gl_compatibility` pour performances maximales Desktop & WebGL2/WebAssembly, `1440x900`, scène principale `res://scenes/Main.tscn`).
- **`scripts/core/GameConfig.gd` (`class_name GameConfig`)** : Configuration centralisée (dimensions de l'île, automate de Conway `32x32`, génétique diploïde, courbe de maîtrise à rendement décroissant `<= 1%/monstre`, chemins `res://assets/...`).
- **`scripts/core/MainGame.gd` & `scenes/Main.tscn`** : Orchestrateur principal assemblant l'environnement 3D (`WorldEnvironment`, ciel procédural, soleil directionnel, Glow/Bloom), le terrain insulaire, l'automate de Conway, l'écosystème génétique, le Gardien, l'essaim de créatures, le directeur audio et le HUD.
- **`scripts/design/I18nManager.gd` & `scripts/design/GameDesignData.gd`** :
  - Moteur bilingue temps réel avec **Anglais par défaut (`"en"`)** et **Français en 2e choix (`"fr"`)**.
  - Catalogue des 7 Actes d'Onboarding, des 10 espèces darwiniennes, des 4 sorts 3D (`+8%/niv`), des 4 bâtiments du Bastion, des 3 armes élémentaires (`+10%–12%` base, `+15%` clade), et de la formule de maîtrise équilibrée (`compute_mastery_bonus(kills)` : `+1%` kills 1–5, `+0.5%` kills 6–15, `+0.25%` kills 16–35, plafond `+15%`).
- **`scripts/ecosystem/ConwayGrid.gd` & `scripts/ecosystem/GeneticEcosystem.gd`** :
  - Grille cellulaire de Conway `32x32` pilotant la fertilité locale de l'île.
  - Génomes diploïdes (`speed_gene`, `hp_gene`, `strength_gene`, `aggression_score`, `size_gene`), croisement parental avec mutation `±10%`, files de gestation par espèce (`4.5s` gobelins à `58s` dragons), protection anti-extinction avec ré-immigration, Courroux du Dragon Souverain (`provoke_dragon_species()`), invasions de Requins Marcheurs et Taupes Géantes, et équilibre du gibier herbivore.
- **`scripts/world/ModelLoader.gd` & `scripts/world/IslandTerrain.gd`** :
  - Chargement des **14 modèles 3D `.glb` Blender 5.0** (`res://assets/models/*.glb`) avec bascule instantanée `[J]` vers les maillages procéduraux Godot.
  - Terrain 3D `ArrayMesh` coloré par biome avec grille de hauteur bilinéaire $O(1)$ (`257x257` `PackedFloat32Array`), océan animé, Sanctuaire central, arbres/rochers/cristaux récoltables, cages de survivants, 3 Monolithes de Reliques et Sanctuaires d'Armes.
- **`scripts/entities/PlayerCharacter.gd` & `scripts/entities/EnemySwarmManager.gd`** :
  - Gardien `CharacterBody3D` avec caméra orbitale découplée (**`[R]` / `[F]`** ou Clic Droit pour tourner la caméra ; **`[E]`** dédié exclusivement à la récolte et aux interactions), mode de combat `[C]` (Auto Vampire Survivors vs Actif `[1-4]`), et bulles contextuelles bilingues.
  - Gestionnaire d'essaim 3D avec LOD d'animation (`> 48m`) et culling (`> 95m`) pour **60 FPS**.
- **`scripts/audio/AudioDirector.gd`** :
  - Crossfade adaptatif des pistes **Lyria 3** (`explore_lyria.wav`, `combat_lyria.wav`, `requiem_gameover_lyria.wav`).
  - **30 doublages vocaux Gemini TTS bilingues** (`15` Anglais dans `res://assets/audio/tts/en/*.wav` par défaut + `15` Français dans `res://assets/audio/tts/*.wav` pour Commandant Aldric `Fenrir` et Archiviste Kaelen `Kore`).
  - Synthétiseur SFX temps réel via `AudioStreamGenerator`.
- **`scripts/ui/HUDController.gd`** :
  - Interface `CanvasLayer` bilingue EN/FR avec bouton **`⚙️ Settings [O]`**, sélecteur de langue et de voix en direct, mixeur audio, bannière d'Onboarding en 7 Actes avec portraits Nano Banana (`res://assets/portraits/*.png`), Minimap 2D (`Control._draw()`), et modales tactiques (`[O]`, `[H]`, `[K]`, `[V]`, `[Tab]`, `[X]`).

---

## 🚀 Commandes CLI (Exécution Native, Test Headless `--dry-run` & Export WebAssembly)

```bash
# 1. Importer les ressources 3D (.glb) et audio (.wav) en mode headless
/usr/local/google/home/giom/.gemini/jetski/scratch/godot-bin/Godot_v4.3-stable_linux.x86_64 \
  --headless --path /usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion-godot --import

# 2. Exécuter la suite de vérification Headless Godot 4.3 (Terrain O(1), Conway, Génétique, Maîtrise <=1%, Bilingue EN/FR, Scène 3D)
/usr/local/google/home/giom/.gemini/jetski/scratch/godot-bin/Godot_v4.3-stable_linux.x86_64 \
  --headless --path /usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion-godot \
  -s res://scripts/headless_dry_run.gd

# 3. Exporter en HTML5 / WebAssembly vers build/web/index.html
/usr/local/google/home/giom/.gemini/jetski/scratch/godot-bin/Godot_v4.3-stable_linux.x86_64 \
  --headless --path /usr/local/google/home/giom/.gemini/jetski/scratch/genesis-bastion-godot \
  --export-release "Web" build/web/index.html

# 4. Servir le build WebAssembly Godot 4.3 sur le port 5175
python3 serve_godot_web.py --port 5175
```
