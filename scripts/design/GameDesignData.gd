class_name GameDesignData
extends RefCounted
## Master Game Design, Balancing, Onboarding, Species, Spells, Buildings, Elemental Weapons &
## Adaptive Mastery Catalog for Genesis Bastion — Godot 4.3 Edition.
##
## All functions accept `lang: String = "en"` (`"en"` English default, `"fr"` French 2nd option)
## and dynamically return localized strings, Nano Banana portrait paths (`res://assets/portraits/*.png`),
## Gemini TTS voiceover paths (`res://assets/audio/tts/en/*.wav` vs `res://assets/audio/tts/*.wav`),
## and Blender 5.0 `.glb` model paths (`res://assets/models/*.glb`).


## Normalizes language string to `"en"` (default) or `"fr"`.
static func _norm_lang(lang: String) -> String:
	var clean: String = lang.strip_edges().to_lower()
	if clean.begins_with("fr"):
		return "fr"
	return "en"


## Helper to select English (default) or French (2nd choice) text.
static func _tr(lang: String, en_text: String, fr_text: String) -> String:
	if _norm_lang(lang) == "fr":
		return fr_text if not fr_text.is_empty() else en_text
	return en_text if not en_text.is_empty() else fr_text


## Builds the `res://` path to a Gemini TTS `.wav` voiceover for the given key and language.
static func get_tts_voice_path(voice_key: String, lang: String = "en") -> String:
	if _norm_lang(lang) == "fr":
		return "res://assets/audio/tts/%s.wav" % voice_key
	return "res://assets/audio/tts/en/%s.wav" % voice_key


## Returns the localized 7-Act Interactive Onboarding specification for `act_num` (`1..7`).
static func get_onboarding_act(act_num: int, lang: String = "en") -> Dictionary:
	var n: int = clampi(act_num, 1, 7)
	var is_fr: bool = (_norm_lang(lang) == "fr")

	match n:
		1:
			var vkey1 := "act1_aldric"
			return {
				"act_num": 1,
				"actNumber": 1,
				"id": "act_1_awakening",
				"title": _tr(lang, "Act 1 — Awakening at the Bastion & Bearings", "Acte 1 — Réveil au Bastion & Repères"),
				"subtitle": _tr(lang, "Master your Hero movement and the 3D tactical camera", "Prendre en main son Héros et la caméra tactique 3D"),
				"speaker_name": "Commander Aldric",
				"speakerName": "Commander Aldric",
				"speaker_title": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"speakerTitle": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"emotion_label": _tr(lang, "🧭 Benevolent Mentor", "🧭 Mentor Bienveillant"),
				"emotionLabel": _tr(lang, "🧭 Benevolent Mentor", "🧭 Mentor Bienveillant"),
				"portrait_path": "res://assets/portraits/aldric_neutral.png",
				"portraitPath": "res://assets/portraits/aldric_neutral.png",
				"voice_key": vkey1,
				"voiceKey": vkey1,
				"tts_path": get_tts_voice_path(vkey1, lang),
				"ttsPath": get_tts_voice_path(vkey1, lang),
				"quote": _tr(
					lang,
					"Awake at last, Guardian! The Sanctuary of Genesis Bastion still holds, but out in the mists, the island's wild fauna is already mutating. Move toward the golden beacon and use R or F to rotate your tactical camera.",
					"Enfin réveillé, Gardien ! Le Sanctuaire de Genesis Bastion tient encore debout, mais au-delà des brumes, la faune sauvage de l'île commence déjà à muter. Avance jusqu'au fanal doré pour dégourdir tes jambes et orienter ta caméra."
				),
				"instruction_text": _tr(
					lang,
					"Walk to the golden beacon near the campfire with WASD and rotate the tactical camera with [R] / [F] or Right-Click drag.",
					"Déplacez-vous jusqu'au fanal doré près du feu de camp avec ZQSD et orientez la caméra tactique avec [R] / [F] ou Clic Droit."
				),
				"why_it_matters": _tr(
					lang,
					"The central Sanctuary regenerates your HP. Camera rotation [R]/[F] is completely independent from [E] harvesting/interaction.",
					"Le Sanctuaire central régénère vos PV. La rotation caméra [R]/[F] est totalement indépendante de la touche d'interaction [E]."
				),
				"objective": _tr(lang, "Reach the Golden Beacon near the Bastion (0, 12)", "Rejoindre le Fanal Doré devant le Bastion (0, 12)"),
				"key_hints": _tr(lang, "[WASD] Move • [R/F] or [Right-Click] Rotate Camera • [Wheel] Zoom", "[ZQSD] Déplacer • [R/F] ou [Clic Droit] Tourner Caméra • [Molette] Zoom"),
				"keys": ["WASD", "R / F", "Mouse Wheel"] if not is_fr else ["ZQSD", "R / F", "Molette"],
				"target_pos": Vector3(0.0, 0.0, 12.0),
				"eco_paused": true,
			}
		2:
			var vkey2 := "act2_aldric"
			return {
				"act_num": 2,
				"actNumber": 2,
				"id": "act_2_combat_dash",
				"title": _tr(lang, "Act 2 — The Art of Combat, Sprint & Adaptation", "Acte 2 — L'Art du Combat, de l'Esquive & de l'Adaptation"),
				"subtitle": _tr(lang, "Strike enemies, toggle Auto/Active combat [C], and gain adaptive mastery", "Frapper dans l'arc de fente, basculer le mode [C] et gagner en maîtrise"),
				"speaker_name": "Commander Aldric",
				"speakerName": "Commander Aldric",
				"speaker_title": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"speakerTitle": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"emotion_label": _tr(lang, "⚔️ Martial Instructor", "⚔️ Instructeur Martial"),
				"emotionLabel": _tr(lang, "⚔️ Martial Instructor", "⚔️ Instructeur Martial"),
				"portrait_path": "res://assets/portraits/aldric_combat.png",
				"portraitPath": "res://assets/portraits/aldric_combat.png",
				"voice_key": vkey2,
				"voiceKey": vkey2,
				"tts_path": get_tts_voice_path(vkey2, lang),
				"ttsPath": get_tts_voice_path(vkey2, lang),
				"quote": _tr(
					lang,
					"Watch out! A stray Goblin and a marauding Wolf are prowling near our perimeter. Draw your runic blade, strike in a wide arc, and sprint with Shift! Each creature you slay grants up to 1% mastery with diminishing returns.",
					"En garde ! Un Gobelin égaré et un Orc maraudeur rôdent aux abords du camp. Dégaine ta lame runique, frappe dans l'arc de fente et utilise Shift pour esquiver leurs coups avant de choisir ton premier don d'adaptation !"
				),
				"instruction_text": _tr(
					lang,
					"Slay nearby hostile creatures with [Left-Click / Space] or spells [1–4], sprint with [Shift], or toggle Auto-Battler Mode with [C].",
					"Éliminez les créatures hostiles proches avec [Clic Gauche / Espace] ou les sorts [1–4], sprintez avec [Shift], ou activez le mode Auto avec [C]."
				),
				"why_it_matters": _tr(
					lang,
					"Each kill grants XP and adaptive species mastery (+1.0% kills 1–5, +0.5% kills 6–15, capped at +15%) without runaway power creep.",
					"Chaque élimination rapporte de l'XP et une maîtrise adaptative (+1.0% kills 1–5, +0.5% kills 6–15, plafonné à +15%) sans déséquilibrer la survie."
				),
				"objective": _tr(lang, "Slay 2 hostile creatures and test your spells [1–4]", "Éliminer 2 créatures hostiles et tester vos sorts [1–4]"),
				"key_hints": _tr(lang, "[Left-Click/Space] Strike • [1–4] Cast Spells • [Shift] Sprint • [C] Combat Mode", "[Clic Gauche/Espace] Frapper • [1–4] Sorts • [Shift] Sprint • [C] Mode Combat"),
				"keys": ["Left-Click / Space", "1-4", "Shift", "C"] if not is_fr else ["Clic Gauche / Espace", "1-4", "Shift", "C"],
				"target_pos": Vector3(14.0, 0.0, 10.0),
				"eco_paused": true,
			}
		3:
			var vkey3 := "act3_aldric"
			return {
				"act_num": 3,
				"actNumber": 3,
				"id": "act_3_rescue_harvest",
				"title": _tr(lang, "Act 3 — First Rescue & Resource Harvesting", "Acte 3 — Premier Sauvetage & Récolte de Ressources"),
				"subtitle": _tr(lang, "Free a caged survivor and harvest Wood, Stone, and Mana Crystal with [E]", "Libérer un survivant en cage et récolter Bois, Pierre et Cristal avec [E]"),
				"speaker_name": "Commander Aldric",
				"speakerName": "Commander Aldric",
				"speaker_title": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"speakerTitle": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"emotion_label": _tr(lang, "🛠️ Bastion Tactician", "🛠️ Tacticien du Bastion"),
				"emotionLabel": _tr(lang, "🛠️ Bastion Tactician", "🛠️ Tacticien du Bastion"),
				"portrait_path": "res://assets/portraits/aldric_neutral.png",
				"portraitPath": "res://assets/portraits/aldric_neutral.png",
				"voice_key": vkey3,
				"voiceKey": vkey3,
				"tts_path": get_tts_voice_path(vkey3, lang),
				"ttsPath": get_tts_voice_path(vkey3, lang),
				"quote": _tr(
					lang,
					"Do you hear that call to the south-east? One of our survivors is locked in a cage! Press E near cages or resource nodes to free allies and harvest Wood, Stone, and Mana Crystal without ever rotating your camera.",
					"Tu entends cet appel au sud-est ? Un de nos survivants est enfermé dans une cage ! Va briser ses chaînes avec E et récolte du Bois et du Cristal : nous ne tiendrons jamais cette île sans alliés."
				),
				"instruction_text": _tr(
					lang,
					"Approach a Resource Node (Wood, Stone, Crystal) or Survivor Cage and press [E] to harvest or rescue.",
					"Approchez-vous d'un gisement (Bois, Pierre, Cristal) ou d'une Cage de Survivant et appuyez sur [E] pour récolter ou libérer."
				),
				"why_it_matters": _tr(
					lang,
					"Pressing [E] strictly harvests resources or interacts with cages/shrines—it never rotates the camera.",
					"La touche [E] sert exclusivement à récolter ou interagir avec les cages et autels, sans jamais faire tourner la caméra."
				),
				"objective": _tr(lang, "Harvest resources or free a survivor Cage with [E]", "Récolter des ressources ou libérer une Cage avec [E]"),
				"key_hints": _tr(lang, "[E] Harvest / Rescue Survivor • [WASD] Move", "[E] Récolter / Libérer Survivant • [ZQSD] Se déplacer"),
				"keys": ["E", "WASD"] if not is_fr else ["E", "ZQSD"],
				"target_pos": Vector3(22.0, 0.0, 18.0),
				"eco_paused": true,
			}
		4:
			var vkey4 := "act4_aldric"
			return {
				"act_num": 4,
				"actNumber": 4,
				"id": "act_4_fortify_bastion",
				"title": _tr(lang, "Act 4 — Fortifying the Bastion & Elemental Forge", "Acte 4 — Fortifier le Bastion & Forge Élémentaire"),
				"subtitle": _tr(lang, "Erect Watchtowers, Mana Wells, Palisades, and forge Elemental Weapons", "Bâtir Tours de Guet, Puits de Mana, Palissades et forger des Armes Élémentaires"),
				"speaker_name": "Commander Aldric",
				"speakerName": "Commander Aldric",
				"speaker_title": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"speakerTitle": _tr(lang, "Master Biologist & Runic Blacksmith", "Maître Biologiste & Forgeron Runique"),
				"emotion_label": _tr(lang, "🏰 Master Builder", "🏰 Maître Bâtisseur"),
				"emotionLabel": _tr(lang, "🏰 Master Builder", "🏰 Maître Bâtisseur"),
				"portrait_path": "res://assets/portraits/aldric_scholar.png",
				"portraitPath": "res://assets/portraits/aldric_scholar.png",
				"voice_key": vkey4,
				"voiceKey": vkey4,
				"tts_path": get_tts_voice_path(vkey4, lang),
				"ttsPath": get_tts_voice_path(vkey4, lang),
				"quote": _tr(
					lang,
					"Excellent work! Open the Bastion Architect panel with H to erect an Amber Watchtower or Mana Well, and open the Weapon Forge with K to craft the Emerald Scythe that protects peaceful herbivore prey!",
					"Excellent travail ! Utilise maintenant nos réserves pour ériger une Tour de Guet avec H et forger une Arme Élémentaire avec K avant que la faune sauvage ne s'éveille."
				),
				"instruction_text": _tr(
					lang,
					"Press [H] to open the Bastion Build Menu (`watchtower`, `mana_well`, `palisade`, `gene_lab`) and [K] for the Elemental Weapon Forge.",
					"Appuyez sur [H] pour ouvrir le Menu Construction du Bastion et sur [K] pour la Forge d'Armes Élémentaires."
				),
				"why_it_matters": _tr(
					lang,
					"Watchtowers defend the Sanctuary, while the Emerald Scythe prevents your AoE spells from accidentally slaying peaceful Deer and Hares.",
					"Les Tours de Guet défendent le Sanctuaire, tandis que la Faux d'Émeraude empêche vos sorts de zone de tuer les Biches et Lapins paisibles."
				),
				"objective": _tr(lang, "Construct a Bastion building [H] or forge an Elemental Weapon [K]", "Construire un bâtiment du Bastion [H] ou forger une Arme Élémentaire [K]"),
				"key_hints": _tr(lang, "[H] Bastion Build Modal • [K] Elemental Weapon Forge • [G] Conway Grid", "[H] Menu Bâtiments • [K] Forge d'Armes • [G] Grille de Conway"),
				"keys": ["H", "K", "G"],
				"target_pos": Vector3(0.0, 0.0, 0.0),
				"eco_paused": true,
			}
		5:
			var vkey5 := "act5_kaelen"
			return {
				"act_num": 5,
				"actNumber": 5,
				"id": "act_5_scout_recon",
				"title": _tr(lang, "Act 5 — Deep Wilderness Recon & Emerging Threats", "Acte 5 — Éclaireurs Hors-Frontière & Menaces Émergentes"),
				"subtitle": _tr(lang, "Track Conway fertility bursts, Abyssal Land-Sharks, and Tunnel Moles", "Surveiller la fertilité de Conway, les Requins Marcheurs et les Taupes Géantes"),
				"speaker_name": "Scout Chief Kaelen",
				"speakerName": "Scout Chief Kaelen",
				"speaker_title": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"speakerTitle": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"emotion_label": _tr(lang, "🦅 Wilderness Tracker", "🦅 Pisteur des Terres Sauvages"),
				"emotionLabel": _tr(lang, "🦅 Wilderness Tracker", "🦅 Pisteur des Terres Sauvages"),
				"portrait_path": "res://assets/portraits/kaelen_scout.png",
				"portraitPath": "res://assets/portraits/kaelen_scout.png",
				"voice_key": vkey5,
				"voiceKey": vkey5,
				"tts_path": get_tts_voice_path(vkey5, lang),
				"ttsPath": get_tts_voice_path(vkey5, lang),
				"quote": _tr(
					lang,
					"Chief Scout Kaelen reporting! Conway's cellular grid is pulsing across the island: where 2 to 5 adults gather in fertile cells, diploid offspring gestate and inherit ±10% genetic mutations. Watch the beaches and subterranean tunnels!",
					"Ici Kaelen, cheffe des Éclaireurs ! L'automate de Conway bat désormais à plein régime : là où 2 à 5 adultes se rassemblent, de nouvelles lignées mutantes naissent. Surveille les plages et les galeries souterraines !"
				),
				"instruction_text": _tr(
					lang,
					"Press [G] to inspect the 3D Conway Fertility Grid overlay and watch the Minimap for emerging Abyssal Sharks and Tunnel Moles.",
					"Appuyez sur [G] pour inspecter la Grille de Fertilité 3D de Conway et surveillez la Minimap pour repérer les Requins et Taupes Géantes."
				),
				"why_it_matters": _tr(
					lang,
					"Each species breeds at its own biological gestation pace (4.5s for Goblins vs 58.0s for Sovereign Dragons) and re-immigrates from hidden refuges if wiped out.",
					"Chaque espèce se reproduit selon sa propre gestation (4.5s pour les Gobelins contre 58.0s pour les Dragons) et ré-immigre depuis ses refuges cachés."
				),
				"objective": _tr(lang, "Explore the wilderness and toggle the Conway Grid [G]", "Explorer les terres sauvages et afficher la Grille de Conway [G]"),
				"key_hints": _tr(lang, "[G] Toggle 3D Conway Grid • [Tab] Biological Codex • [J] Toggle Blender .glb / Procedural", "[G] Grille 3D de Conway • [Tab] Codex Biologique • [J] Basculer Modèles Blender .glb / Procédural"),
				"keys": ["G", "Tab", "J"],
				"target_pos": Vector3(38.0, 0.0, -28.0),
				"eco_paused": false,
			}
		6:
			var vkey6 := "act6_kaelen"
			return {
				"act_num": 6,
				"actNumber": 6,
				"id": "act_6_patient_zero",
				"title": _tr(lang, "Act 6 — Sovereign Dragons & Trophic Balance", "Acte 6 — Dragons Souverains & Équilibre Trophique"),
				"subtitle": _tr(lang, "Respect peaceful Sovereign Dragons and protect Herbivore Prey herds", "Respecter les Dragons Souverains paisibles et préserver le Gibier Herbivore"),
				"speaker_name": "Scout Chief Kaelen",
				"speakerName": "Scout Chief Kaelen",
				"speaker_title": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"speakerTitle": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"emotion_label": _tr(lang, "🚨 Patient Zero Alert!", "🚨 Alerte Patient Zéro !"),
				"emotionLabel": _tr(lang, "🚨 Patient Zero Alert!", "🚨 Alerte Patient Zéro !"),
				"portrait_path": "res://assets/portraits/kaelen_shocked.png",
				"portraitPath": "res://assets/portraits/kaelen_shocked.png",
				"voice_key": vkey6,
				"voiceKey": vkey6,
				"tts_path": get_tts_voice_path(vkey6, lang),
				"ttsPath": get_tts_voice_path(vkey6, lang),
				"quote": _tr(
					lang,
					"Red alert in the volcanic highlands! Remember: Sovereign Dragons are peaceful apex guardians—never strike a Dragon first, or the entire Dragon species will unleash Dragon Wrath against our Bastion! Meanwhile, intercept hostile mutants early!",
					"Alerte rouge sur les crêtes volcaniques ! Souviens-toi : les Dragons Souverains sont des gardiens paisibles — ne les attaque jamais en premier, ou toute leur espèce déchaînera le Courroux Draconique sur notre Bastion !"
				),
				"instruction_text": _tr(
					lang,
					"Hunt hostile mutant lineages while sparing Sovereign Dragons and maintaining Glimmer Elk & Meadow Hare populations.",
					"Traquez les lignées mutantes hostiles tout en épargnant les Dragons Souverains et en préservant les troupeaux de Biches et Lapins."
				),
				"why_it_matters": _tr(
					lang,
					"Overhunting Glimmer Elk and Meadow Hares triggers a Prey Crisis (-50% HP regeneration) until you reintroduce them at the Gene Lab.",
					"Surexploiter les Biches et les Lapins déclenche une Crise du Gibier (-50% régénération PV) jusqu'à leur réintroduction au Bio-Laboratoire."
				),
				"objective": _tr(lang, "Eliminate hostile mutants without provoking Sovereign Dragons", "Éliminer les mutants hostiles sans provoquer les Dragons Souverains"),
				"key_hints": _tr(lang, "[1–4] Cast Spells • [Tab] Inspect Species Genomes • [K] Equip Emerald Scythe", "[1–4] Lancer Sorts • [Tab] Inspecter Génomes • [K] Équiper Faux d'Émeraude"),
				"keys": ["1-4", "Tab", "K"],
				"target_pos": Vector3(-42.0, 0.0, -36.0),
				"eco_paused": false,
			}
		_:
			var vkey7 := "act7_kaelen"
			return {
				"act_num": 7,
				"actNumber": 7,
				"id": "act_7_eden_relics",
				"title": _tr(lang, "Act 7 — The 3 Ancient Relics & Solar Aegis Dome", "Acte 7 — Les 3 Reliques Anciennes & Dôme Égide Solaire"),
				"subtitle": _tr(lang, "Recover 3 Relic Fragments in the wilds and deploy the Solar Aegis Dome [V]", "Récupérer les 3 Fragments de Relique et déployer le Dôme Égide Solaire [V]"),
				"speaker_name": "Scout Chief Kaelen",
				"speakerName": "Scout Chief Kaelen",
				"speaker_title": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"speakerTitle": _tr(lang, "Chief of Deep-Wilderness Scouts", "Cheffe des Éclaireurs Hors-Frontière"),
				"emotion_label": _tr(lang, "🏆 Victorious Strategist", "🏆 Stratège Victorieux"),
				"emotionLabel": _tr(lang, "🏆 Victorious Strategist", "🏆 Stratège Victorieux"),
				"portrait_path": "res://assets/portraits/kaelen_proud.png",
				"portraitPath": "res://assets/portraits/kaelen_proud.png",
				"voice_key": vkey7,
				"voiceKey": vkey7,
				"tts_path": get_tts_voice_path(vkey7, lang),
				"ttsPath": get_tts_voice_path(vkey7, lang),
				"quote": _tr(
					lang,
					"Your mastery of the island is complete! Recover the 3 Ancient Relic Fragments from the glowing monoliths in the deep wilds, then press V at the Sanctuary to deploy the Solar Aegis Dome and sanctify the island!",
					"Ta maîtrise de l'île est totale ! Récupère les 3 Fragments de Reliques Anciennes auprès des monolithes sacrés dans les terres sauvages, puis appuie sur V au Sanctuaire pour déployer le Dôme Égide Solaire !"
				),
				"instruction_text": _tr(
					lang,
					"Collect all 3 Ancient Relic Fragments with [E] at the glowing Monoliths, then press [V] to deploy the Solar Aegis Dome!",
					"Récupérez les 3 Fragments de Relique avec [E] près des Monolithes sacrés, puis appuyez sur [V] pour déployer le Dôme Égide Solaire !"
				),
				"why_it_matters": _tr(
					lang,
					"Assembling all 3 Eden Relic Fragments unlocks the golden Solar Aegis Dome [V] to pacify the island and advance to the next archipelago tier.",
					"Assembler les 3 Fragments de Relique débloque le Dôme Égide Solaire [V] pour pacifier l'île et passer à l'île suivante de l'archipel."
				),
				"objective": _tr(lang, "Recover 3/3 Ancient Relics [E] & Deploy the Solar Aegis Dome [V]", "Récupérer 3/3 Reliques Anciennes [E] & Déployer le Dôme Égide Solaire [V]"),
				"key_hints": _tr(lang, "[E] Collect Relic Fragment • [V] Solar Aegis Dome • [O] Settings / Language EN-FR", "[E] Récolter Relique • [V] Dôme Égide Solaire • [O] Paramètres / Langue EN-FR"),
				"keys": ["E", "V", "O"],
				"target_pos": Vector3(0.0, 0.0, -52.0),
				"eco_paused": false,
			}


## Returns all 7 localized Onboarding Acts as an Array.
static func get_all_onboarding_acts(lang: String = "en") -> Array:
	var acts: Array = []
	for i in range(1, 8):
		acts.append(get_onboarding_act(i, lang))
	return acts


## Returns speaker, portrait, localized quote, and TTS `.wav` path for the 8 narrative alert events.
static func get_alert_presentation(alert_key: String, lang: String = "en") -> Dictionary:
	match alert_key:
		"alert_dragon_wrath":
			return {
				"key": "alert_dragon_wrath",
				"speaker_name": _tr(lang, "Ignis — Sovereign of the Caldera", "Ignis — Souverain de la Caldeira"),
				"emotion_label": _tr(lang, "🐉 Draconic Wrath (90s)", "🐉 Courroux Draconique (90s)"),
				"portrait_path": "res://assets/portraits/specimen_dragon_sovereign.png",
				"voice_key": "alert_dragon_wrath",
				"tts_path": get_tts_voice_path("alert_dragon_wrath", lang),
				"quote": _tr(
					lang,
					"What madness! You struck a peaceful Sovereign Dragon! Now the entire Dragon brood descends from the caldera in Draconic Wrath!",
					"Quelle folie ! Tu as osé frapper un Dragon Souverain paisible ! Toute la couvée draconique descend désormais de la caldeira dans un Courroux vengeur !"
				),
			}
		"alert_shark_landing":
			return {
				"key": "alert_shark_landing",
				"speaker_name": _tr(lang, "Specimen: Abyssal Land-Shark", "Spécimen : Requin Marcheur des Abysses"),
				"emotion_label": _tr(lang, "🦈 Amphibious Predator", "🦈 Prédateur Amphibie"),
				"portrait_path": "res://assets/portraits/specimen_land_shark.png",
				"voice_key": "alert_shark_landing",
				"tts_path": get_tts_voice_path("alert_shark_landing", lang),
				"quote": _tr(
					lang,
					"Alert on the outer beaches! Abyssal Land-Sharks are emerging from the ocean surf on muscular fins!",
					"Alerte sur les plages extérieures ! Des Requins Marcheurs des Abysses émergent de l'océan sur leurs nageoires musclées !"
				),
			}
		"alert_mole_eruption":
			return {
				"key": "alert_mole_eruption",
				"speaker_name": _tr(lang, "Specimen: Giant Tunnel Mole", "Spécimen : Taupe Géante Fouisseuse"),
				"emotion_label": _tr(lang, "🐾 Subterranean Eruption", "🐾 Éruption Souterraine"),
				"portrait_path": "res://assets/portraits/specimen_giant_mole.png",
				"voice_key": "alert_mole_eruption",
				"tts_path": get_tts_voice_path("alert_mole_eruption", lang),
				"quote": _tr(
					lang,
					"The ground is trembling! Giant Tunnel Moles are breaching our defenses from deep underground galleries!",
					"Le sol tremble ! Des Taupes Géantes Fouisseuses percent nos lignes depuis les galeries souterraines profondes !"
				),
			}
		"alert_prey_crisis":
			return {
				"key": "alert_prey_crisis",
				"speaker_name": "Scout Chief Kaelen",
				"emotion_label": _tr(lang, "🦌 Trophic Collapse!", "🦌 Effondrement Trophique !"),
				"portrait_path": "res://assets/portraits/kaelen_shocked.png",
				"voice_key": "alert_prey_crisis",
				"tts_path": get_tts_voice_path("alert_prey_crisis", lang),
				"quote": _tr(
					lang,
					"Warning! Herbivore prey populations have collapsed! Reintroduce Glimmer Elk and Meadow Hares at the Gene Lab or our HP regeneration will plummet!",
					"Attention ! Les troupeaux d'herbivores se sont effondrés ! Réintroduis des Biches et des Lapins au Bio-Laboratoire ou notre régénération chutera !"
				),
			}
		"alert_relic_found":
			return {
				"key": "alert_relic_found",
				"speaker_name": "Commander Aldric",
				"emotion_label": _tr(lang, "🏛️ Ancient Relic Recovered", "🏛️ Relique Ancienne Récupérée"),
				"portrait_path": "res://assets/portraits/aldric_scholar.png",
				"voice_key": "alert_relic_found",
				"tts_path": get_tts_voice_path("alert_relic_found", lang),
				"quote": _tr(
					lang,
					"Magnificent! An Ancient Relic Fragment resonates with the Sanctuary core! Gather all 3 fragments to deploy the Solar Aegis Dome!",
					"Magnifique ! Un Fragment de Relique Ancienne entre en résonance avec le cœur du Sanctuaire ! Rassemble les 3 fragments pour déployer le Dôme Égide Solaire !"
				),
			}
		"alert_island_victory":
			return {
				"key": "alert_island_victory",
				"speaker_name": "Commander Aldric",
				"emotion_label": _tr(lang, "🛡️ Solar Aegis Deployed!", "🛡️ Dôme Égide Solaire Déployé !"),
				"portrait_path": "res://assets/portraits/aldric_scholar.png",
				"voice_key": "alert_island_victory",
				"tts_path": get_tts_voice_path("alert_island_victory", lang),
				"quote": _tr(
					lang,
					"The Solar Aegis Dome illuminates the entire island! All wild mutations are pacified—Genesis Bastion stands triumphant!",
					"Le Dôme Égide Solaire illumine toute l'île ! Toutes les mutations sauvages sont pacifiées — Genesis Bastion triomphe !"
				),
			}
		"alert_gameover_requiem":
			return {
				"key": "alert_gameover_requiem",
				"speaker_name": "Commander Aldric",
				"emotion_label": _tr(lang, "💀 Requiem of the Bastion", "💀 Requiem du Bastion"),
				"portrait_path": "res://assets/portraits/aldric_combat.png",
				"voice_key": "alert_gameover_requiem",
				"tts_path": get_tts_voice_path("alert_gameover_requiem", lang),
				"quote": _tr(
					lang,
					"The Sanctuary has fallen to the wild tide... Will you rise again from Level 1 on Island #1 in true Roguelike fashion, or invoke Sanctuary Grace?",
					"Le Sanctuaire est tombé sous la marée sauvage... Vas-tu repartir à zéro au Niveau 1 sur l'Île #1 en vrai Roguelike, ou invoquer la Grâce du Sanctuaire ?"
				),
			}
		_:
			return {
				"key": "alert_patient_zero",
				"speaker_name": _tr(lang, "Specimen: Patient Zero", "Spécimen : Patient Zéro"),
				"emotion_label": _tr(lang, "🧬 Apex Mutant Spotted", "🧬 Mutant Apex Repéré"),
				"portrait_path": "res://assets/portraits/specimen_fire_troll.png",
				"voice_key": "alert_patient_zero",
				"tts_path": get_tts_voice_path("alert_patient_zero", lang),
				"quote": _tr(
					lang,
					"Scout alert! A high-fitness mutant lineage has emerged in a fertile Conway sector—intercept the juvenile before it matures!",
					"Alerte Éclaireur ! Une lignée mutante à haute fitness vient d'émerger dans un secteur fertile de Conway — intercepte le juvénile avant sa maturité !"
				),
			}


## Returns the complete 10-Species Ecological & Genetic Catalog (`Dictionary` keyed by species ID).
## Each species entry defines:
## - `id`, `name`, `clade`, `is_prey`, `is_peaceful_dragon`, `aggression`, `gestation_sec`,
##   `maturation_sec`, `min_population`, `base_hp`, `base_speed`, `base_damage`,
##   `model_file`, `model_path`, `tint_color`, `description`, `habitat_label`.
static func get_species_catalog(lang: String = "en") -> Dictionary:
	return {
		"glimmer_elk": {
			"id": "glimmer_elk",
			"legacy_id": "deer",
			"name": _tr(lang, "Glimmer Elk", "Cerf Luminescent (Biche)"),
			"clade": "herbivore_prey",
			"is_prey": true,
			"is_peaceful_dragon": false,
			"aggression": 0.0,
			"gestation_sec": 15.0,
			"maturation_sec": 17.0,
			"min_population": 4,
			"base_hp": 58.0,
			"base_speed": 8.2,
			"base_damage": 0.0,
			"xp_reward": 20,
			"food_yield": 35,
			"model_file": "deer.glb",
			"model_path": "res://assets/models/deer.glb",
			"tint_color": Color(0.85, 0.62, 0.38),
			"habitat_label": _tr(lang, "Sylvan Glades", "Clairières Sylvestres"),
			"description": _tr(
				lang,
				"Peaceful herbivore grazer that enriches local Conway fertility. Flees danger; if overhunted, camp HP regeneration drops by 50%.",
				"Herbivore paisible qui enrichit la fertilité locale de Conway. Fuit le danger ; s'il s'éteint, la régénération PV du camp chute de 50%."
			),
		},
		"meadow_hare": {
			"id": "meadow_hare",
			"legacy_id": "rabbit",
			"name": _tr(lang, "Meadow Hare", "Lièvre des Prairies"),
			"clade": "herbivore_prey",
			"is_prey": true,
			"is_peaceful_dragon": false,
			"aggression": 0.0,
			"gestation_sec": 7.5,
			"maturation_sec": 9.5,
			"min_population": 5,
			"base_hp": 26.0,
			"base_speed": 9.5,
			"base_damage": 0.0,
			"xp_reward": 14,
			"food_yield": 18,
			"model_file": "rabbit.glb",
			"model_path": "res://assets/models/rabbit.glb",
			"tint_color": Color(0.95, 0.92, 0.86),
			"habitat_label": _tr(lang, "Emerald Meadows", "Prairies d'Émeraude"),
			"description": _tr(
				lang,
				"Swift, high-fertility herbivore prey (7.5s gestation). Sustains the island's trophic chain and Bastion rations.",
				"Petit herbivore véloce à gestation rapide (7.5s). Maintient la chaîne trophique de l'île et les réserves de rations."
			),
		},
		"beach_crab": {
			"id": "beach_crab",
			"legacy_id": "crab",
			"name": _tr(lang, "Reef Carapace Crab", "Crabe Carapace des Récifs"),
			"clade": "crustacean",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.42,
			"gestation_sec": 11.0,
			"maturation_sec": 14.0,
			"min_population": 3,
			"base_hp": 64.0,
			"base_speed": 5.4,
			"base_damage": 8.0,
			"xp_reward": 28,
			"food_yield": 8,
			"model_file": "goblin.glb",
			"model_path": "res://assets/models/goblin.glb",
			"tint_color": Color(0.92, 0.42, 0.28),
			"habitat_label": _tr(lang, "Sandy Shorelines", "Rivages Sablonneux"),
			"description": _tr(
				lang,
				"Territorial coastal scavenger with a hardened shell. Patrols the beaches and defends tidal mineral deposits.",
				"Charognard côtier territorial doté d'une carapace durcie. Patrouille les plages et défend les gisements minéraux."
			),
		},
		"scavenger_goblin": {
			"id": "scavenger_goblin",
			"legacy_id": "goblin",
			"name": _tr(lang, "Scavenger Goblin", "Gobelin Pillard"),
			"clade": "goblinoid",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.75,
			"gestation_sec": 4.5,
			"maturation_sec": 12.0,
			"min_population": 4,
			"base_hp": 46.0,
			"base_speed": 6.9,
			"base_damage": 7.5,
			"xp_reward": 30,
			"food_yield": 0,
			"model_file": "goblin.glb",
			"model_path": "res://assets/models/goblin.glb",
			"tint_color": Color(0.42, 0.79, 0.28),
			"habitat_label": _tr(lang, "Forest Burrows", "Terriers Forestiers"),
			"description": _tr(
				lang,
				"Fast-breeding swarm raider (4.5s gestation). Quickly overpopulates fertile Conway cells and mutates rapidly if left unchecked.",
				"Pillard grégaire à reproduction ultra-rapide (4.5s de gestation). Surpeuple vite les cellules fertiles de Conway."
			),
		},
		"forest_wolf": {
			"id": "forest_wolf",
			"legacy_id": "wolf",
			"name": _tr(lang, "Timber Pack Wolf", "Loup Sylvestre"),
			"clade": "canid",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.82,
			"gestation_sec": 13.0,
			"maturation_sec": 15.0,
			"min_population": 3,
			"base_hp": 68.0,
			"base_speed": 8.6,
			"base_damage": 11.5,
			"xp_reward": 40,
			"food_yield": 0,
			"model_file": "wolf.glb",
			"model_path": "res://assets/models/wolf.glb",
			"tint_color": Color(0.55, 0.62, 0.72),
			"habitat_label": _tr(lang, "Deep Timberlands", "Forêts Profondes"),
			"description": _tr(
				lang,
				"Relentless pack predator that hunts both herbivore prey and the Hero. Excels at high-speed flanking maneuvers.",
				"Prédateur de meute implacable qui chasse aussi bien le gibier herbivore que le Héros."
			),
		},
		"sky_harpy": {
			"id": "sky_harpy",
			"legacy_id": "vulture",
			"name": _tr(lang, "Crag Vulture-Harpy", "Vautour-Harpie des Cimes"),
			"clade": "avian",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.52,
			"gestation_sec": 15.0,
			"maturation_sec": 17.0,
			"min_population": 3,
			"base_hp": 56.0,
			"base_speed": 9.2,
			"base_damage": 10.5,
			"xp_reward": 42,
			"food_yield": 0,
			"model_file": "vulture.glb",
			"model_path": "res://assets/models/vulture.glb",
			"tint_color": Color(0.68, 0.45, 0.84),
			"habitat_label": _tr(lang, "Windy Crags", "Falaises Escarpées"),
			"description": _tr(
				lang,
				"Aerial dive predator nesting on high cliffs. Cross-breeds lightning and winged-leap traits in highland zones.",
				"Rapace plongeur nichant sur les falaises. Transmet des gènes de bond ailé et de vitesse dans les hautes terres."
			),
		},
		"abyssal_shark": {
			"id": "abyssal_shark",
			"legacy_id": "shark",
			"name": _tr(lang, "Abyssal Land-Shark", "Requin Marcheur des Abysses"),
			"clade": "abyssal",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.86,
			"gestation_sec": 22.0,
			"maturation_sec": 24.0,
			"min_population": 2,
			"base_hp": 118.0,
			"base_speed": 7.8,
			"base_damage": 17.0,
			"xp_reward": 65,
			"food_yield": 0,
			"model_file": "shark.glb",
			"model_path": "res://assets/models/shark.glb",
			"tint_color": Color(0.18, 0.58, 0.68),
			"habitat_label": _tr(lang, "Abyssal Reefs & Beaches", "Récifs Abyssaux & Plages"),
			"description": _tr(
				lang,
				"Amphibious apex predator that storms the island's beaches from the ocean depths on muscular fins.",
				"Prédateur amphibie qui débarque des profondeurs océaniques sur les plages de l'île grâce à ses nageoires musclées."
			),
		},
		"tunnel_mole": {
			"id": "tunnel_mole",
			"legacy_id": "giant_mole",
			"name": _tr(lang, "Giant Tunnel Mole", "Taupe Géante Fouisseuse"),
			"clade": "subterranean",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.76,
			"gestation_sec": 20.0,
			"maturation_sec": 22.0,
			"min_population": 2,
			"base_hp": 132.0,
			"base_speed": 5.8,
			"base_damage": 15.5,
			"xp_reward": 62,
			"food_yield": 0,
			"model_file": "giant_mole.glb",
			"model_path": "res://assets/models/giant_mole.glb",
			"tint_color": Color(0.56, 0.38, 0.24),
			"habitat_label": _tr(lang, "Subterranean Galleries", "Galeries Souterraines"),
			"description": _tr(
				lang,
				"Armored subterraneanexcavator with seismic claws that erupts directly inside mid-island sectors.",
				"Fouisseur blindé aux griffes sismiques qui jaillit directement des galeries souterraines au cœur de l'île."
			),
		},
		"carrion_beetle": {
			"id": "carrion_beetle",
			"legacy_id": "troll",
			"name": _tr(lang, "Armored Magma Troll-Beetle", "Colosse Cuirassé de Magma"),
			"clade": "colossus",
			"is_prey": false,
			"is_peaceful_dragon": false,
			"aggression": 0.56,
			"gestation_sec": 28.0,
			"maturation_sec": 32.0,
			"min_population": 2,
			"base_hp": 168.0,
			"base_speed": 4.9,
			"base_damage": 21.0,
			"xp_reward": 78,
			"food_yield": 0,
			"model_file": "troll.glb",
			"model_path": "res://assets/models/troll.glb",
			"tint_color": Color(0.75, 0.36, 0.22),
			"habitat_label": _tr(lang, "Volcanic Basalt Slopes", "Pentes de Basalte Volcanique"),
			"description": _tr(
				lang,
				"Heavy osteo-plated juggernaut with slow gestation (28s) but massive vitality and pyroclastic resilience.",
				"Colosse à carapace ostéo-dermique doté d'une lente gestation (28s) mais d'une vitalité et d'une puissance colossales."
			),
		},
		"sovereign_dragon": {
			"id": "sovereign_dragon",
			"legacy_id": "dragon",
			"name": _tr(lang, "Sovereign Dragon", "Dragon Souverain"),
			"clade": "draconic_apex",
			"is_prey": false,
			"is_peaceful_dragon": true,
			"aggression": 0.08,
			"gestation_sec": 58.0,
			"maturation_sec": 50.0,
			"min_population": 2,
			"base_hp": 340.0,
			"base_speed": 7.5,
			"base_damage": 34.0,
			"xp_reward": 160,
			"food_yield": 0,
			"model_file": "dragon.glb",
			"model_path": "res://assets/models/dragon.glb",
			"tint_color": Color(0.92, 0.24, 0.16),
			"habitat_label": _tr(lang, "Volcanic Caldera Peaks", "Crêtes de la Caldeira Volcanique"),
			"description": _tr(
				lang,
				"Peaceful ancient sovereign (58s gestation). Never attacks first—unless provoked by the player, triggering 90s of collective Dragon Wrath!",
				"Souverain ancestral paisible (gestation 58s). N'attaque jamais en premier — sauf s'il est provoqué, déclenchant 90s de Courroux Draconique !"
			),
		},
	}


## Resolves any species ID (including legacy aliases like `"deer"`, `"rabbit"`, `"goblin"`, `"dragon"`)
## to its full localized dictionary entry.
static func get_species_spec(species_id: String, lang: String = "en") -> Dictionary:
	var catalog: Dictionary = get_species_catalog(lang)
	if catalog.has(species_id):
		return catalog[species_id]
	var alias_map: Dictionary = {
		"deer": "glimmer_elk",
		"rabbit": "meadow_hare",
		"crab": "beach_crab",
		"goblin": "scavenger_goblin",
		"wolf": "forest_wolf",
		"vulture": "sky_harpy",
		"shark": "abyssal_shark",
		"giant_mole": "tunnel_mole",
		"troll": "carrion_beetle",
		"orc": "carrion_beetle",
		"lion": "forest_wolf",
		"dragon": "sovereign_dragon",
	}
	var mapped: String = alias_map.get(species_id, "scavenger_goblin")
	return catalog.get(mapped, catalog["scavenger_goblin"])


## Returns the 4 Active / Auto-Cast 3D Spells (`runic_bolt`, `frost_nova`, `flame_wave`, `nature_thorns`)
## with `+8%/lvl` balanced damage scaling (`level_scaling = 0.08`).
static func get_spells_catalog(lang: String = "en") -> Array:
	return [
		{
			"id": "runic_bolt",
			"slot": 1,
			"key": "1",
			"icon": "⚡",
			"name": _tr(lang, "Runic Lightning Bolt", "Éclair Runique en Chaîne"),
			"category": _tr(lang, "Chain Arcane Bolt", "Foudre Arcanique"),
			"base_damage": 28.0,
			"base_cooldown": 2.4,
			"base_range": 14.0,
			"level_scaling": 0.08,
			"max_level": 5,
			"color": Color(0.28, 0.86, 0.98),
			"description": _tr(
				lang,
				"Strikes the nearest hostile creature with a high-voltage runic bolt that arcs across nearby pack members.",
				"Frappe l'ennemi hostile le plus proche d'un éclair runique haute tension qui rebondit sur la meute."
			),
			"scaling_desc": _tr(lang, "+8% damage and +4% range per level.", "+8% dégâts et +4% portée par niveau."),
		},
		{
			"id": "frost_nova",
			"slot": 2,
			"key": "2",
			"icon": "❄️",
			"name": _tr(lang, "Cryogenic Frost Nova", "Nova Cryogénique"),
			"category": _tr(lang, "AoE Freeze & Slow", "Gel & Ralentissement de Zone"),
			"base_damage": 32.0,
			"base_cooldown": 4.2,
			"base_range": 9.5,
			"level_scaling": 0.08,
			"max_level": 5,
			"slow_factor": 0.5,
			"slow_duration": 3.5,
			"color": Color(0.0, 0.82, 0.88),
			"description": _tr(
				lang,
				"Unleashes a ring of sub-zero frost around the Hero, damaging and slowing hostile creatures by 50% for 3.5s.",
				"Libère un anneau de givre absolu autour du Héros, blessant et ralentissant les hostiles de 50% pendant 3.5s."
			),
			"scaling_desc": _tr(lang, "+8% frost damage and +4% radius per level.", "+8% dégâts de givre et +4% rayon par niveau."),
		},
		{
			"id": "flame_wave",
			"slot": 3,
			"key": "3",
			"icon": "🔥",
			"name": _tr(lang, "Pyroclastic Flame Wave", "Vague Pyroclastique"),
			"category": _tr(lang, "Solar & Magma Surge", "Déferlante Solaire & Magma"),
			"base_damage": 42.0,
			"base_cooldown": 5.0,
			"base_range": 10.5,
			"level_scaling": 0.08,
			"max_level": 5,
			"burn_dps": 8.0,
			"burn_duration": 3.0,
			"color": Color(1.0, 0.32, 0.05),
			"description": _tr(
				lang,
				"Erupts a wave of volcanic fire that scorches dense monster packs and inflicts lingering burn damage.",
				"Déchaîne une vague de feu volcanique qui calcine les meutes denses et inflige une brûlure continue."
			),
			"scaling_desc": _tr(lang, "+8% fire damage and -4% cooldown per level.", "+8% dégâts de feu et -4% recharge par niveau."),
		},
		{
			"id": "nature_thorns",
			"slot": 4,
			"key": "4",
			"icon": "🌿",
			"name": _tr(lang, "Sylvan Bramble Vortex", "Vortex de Ronces Sylvestres"),
			"category": _tr(lang, "Orbital Thorns & Life Drain", "Ronces Orbitales & Drain"),
			"base_damage": 24.0,
			"base_cooldown": 3.8,
			"base_range": 7.5,
			"level_scaling": 0.08,
			"max_level": 5,
			"lifesteal_ratio": 0.30,
			"color": Color(0.22, 0.92, 0.38),
			"description": _tr(
				lang,
				"Summons razor-sharp emerald brambles that slice nearby enemies and restore 30% of damage dealt as Hero HP.",
				"Invoque des ronces d'émeraude acérées qui tranchent les ennemis proches et restaurent 30% des dégâts en PV."
			),
			"scaling_desc": _tr(lang, "+8% damage and +2% lifesteal per level.", "+8% dégâts et +2% drain de vie par niveau."),
		},
	]


## Computes the exact spell statistics at `level` (`1..5`) using the `+8%/lvl` progression curve.
static func get_spell_stats_at_level(spell_id: String, level: int = 1, lang: String = "en") -> Dictionary:
	var spells: Array = get_spells_catalog(lang)
	var found: Dictionary = spells[0]
	for sp in spells:
		if sp["id"] == spell_id:
			found = sp
			break
	var lvl: int = clampi(level, 1, int(found.get("max_level", 5)))
	var steps: int = lvl - 1
	var scale_mult: float = 1.0 + float(steps) * float(found.get("level_scaling", 0.08))
	var dmg: float = roundf(float(found["base_damage"]) * scale_mult)
	var rng: float = snappedf(float(found["base_range"]) * (1.0 + float(steps) * 0.04), 0.1)
	var cd: float = snappedf(maxf(1.0, float(found["base_cooldown"]) * pow(0.96, steps)), 0.05)

	var result: Dictionary = found.duplicate(true)
	result["level"] = lvl
	result["damage"] = dmg
	result["range"] = rng
	result["cooldown"] = cd
	return result


## Returns the 4 Bastion Buildings (`watchtower`, `mana_well`, `palisade`, `gene_lab`)
## with Wood, Stone, and Mana Crystal costs and tactical effects.
static func get_buildings_catalog(lang: String = "en") -> Array:
	return [
		{
			"id": "watchtower",
			"icon": "🏹",
			"hotkey": "1",
			"name": _tr(lang, "Amber Watchtower", "Tour de Guet d'Ambre"),
			"max_level": 3,
			"cost_wood": 30,
			"cost_stone": 20,
			"cost_crystal": 10,
			"cost": {"wood": 30, "stone": 20, "crystal": 10},
			"pad_offset": Vector3(11.0, 0.0, 9.0),
			"fire_range": 34.0,
			"fire_damage": 18.0,
			"fire_interval": 1.35,
			"description": _tr(
				lang,
				"Automatically fires runic bolts at hostile creatures approaching the Bastion perimeter (34m range).",
				"Tire automatiquement des carreaux runiques sur les créatures hostiles approchant du Bastion (portée 34m)."
			),
			"effect_desc": _tr(
				lang,
				"+18 auto-turret damage / 1.35s (+25% per level).",
				"+18 dégâts de tourelle auto / 1.35s (+25% par niveau)."
			),
		},
		{
			"id": "mana_well",
			"icon": "💎",
			"hotkey": "2",
			"name": _tr(lang, "Astral Mana Well", "Puits de Mana Astral"),
			"max_level": 3,
			"cost_wood": 20,
			"cost_stone": 25,
			"cost_crystal": 20,
			"cost": {"wood": 20, "stone": 25, "crystal": 20},
			"pad_offset": Vector3(-11.0, 0.0, 9.0),
			"cooldown_reduction": 0.12,
			"hp_regen_bonus": 2.5,
			"description": _tr(
				lang,
				"Radiates harmonic ley-energy across the island, accelerating Hero spell cooldowns by 12% and regenerating +2.5 HP/s.",
				"Irradie une énergie tellurique qui accélère la recharge des sorts de 12% et régénère +2.5 PV/s par niveau."
			),
			"effect_desc": _tr(
				lang,
				"-12% spell cooldowns & +2.5 HP/s regeneration per level.",
				"-12% temps de recharge des sorts & +2.5 PV/s par niveau."
			),
		},
		{
			"id": "palisade",
			"icon": "🛡️",
			"hotkey": "3",
			"name": _tr(lang, "Thorny Runic Palisade", "Palissade d'Épines Runiques"),
			"max_level": 3,
			"cost_wood": 35,
			"cost_stone": 30,
			"cost_crystal": 5,
			"cost": {"wood": 35, "stone": 30, "crystal": 5},
			"pad_offset": Vector3(11.0, 0.0, -9.0),
			"bastion_max_hp_bonus": 250.0,
			"thorns_damage": 12.0,
			"description": _tr(
				lang,
				"Reinforces the Sanctuary ramparts (+250 Bastion Max HP) and reflects 12 thorn damage to attacking packs.",
				"Renforce les remparts du Sanctuaire (+250 PV Max au Bastion) et renvoie 12 dégâts d'épines aux assaillants."
			),
			"effect_desc": _tr(
				lang,
				"+250 Bastion HP & 12 reflected thorn damage per level.",
				"+250 PV au Bastion & 12 dégâts d'épines renvoyés par niveau."
			),
		},
		{
			"id": "gene_lab",
			"icon": "🧬",
			"hotkey": "4",
			"name": _tr(lang, "Darwinian Gene Lab", "Bio-Laboratoire Darwinien"),
			"max_level": 3,
			"cost_wood": 25,
			"cost_stone": 20,
			"cost_crystal": 25,
			"cost": {"wood": 25, "stone": 20, "crystal": 25},
			"pad_offset": Vector3(-11.0, 0.0, -9.0),
			"mastery_gain_mult": 1.25,
			"prey_reintroduce_enabled": true,
			"description": _tr(
				lang,
				"Analyzes mutant genomes (+25% faster mastery & XP) and enables reintroducing Glimmer Elk & Meadow Hares if extinct.",
				"Analyse les génomes mutants (+25% XP et maîtrise) et permet de réintroduire les Biches et Lapins en cas d'extinction."
			),
			"effect_desc": _tr(
				lang,
				"+25% XP/Mastery rate & unlocks Herbivore Prey Reintroduction.",
				"+25% gain d'XP/Maîtrise & débloque la Réintroduction du Gibier."
			),
		},
	]


## Returns a specific building dictionary scaled for `current_level`.
static func get_building_spec(building_id: String, current_level: int = 0, lang: String = "en") -> Dictionary:
	var buildings: Array = get_buildings_catalog(lang)
	var base: Dictionary = buildings[0]
	for b in buildings:
		if b["id"] == building_id:
			base = b
			break
	var lvl: int = clampi(current_level, 0, int(base["max_level"]))
	var scale: float = 1.0 + float(lvl) * 0.45
	var spec: Dictionary = base.duplicate(true)
	spec["current_level"] = lvl
	spec["is_maxed"] = (lvl >= int(base["max_level"]))
	spec["cost_wood"] = int(roundf(float(base["cost_wood"]) * scale))
	spec["cost_stone"] = int(roundf(float(base["cost_stone"]) * scale))
	spec["cost_crystal"] = int(roundf(float(base["cost_crystal"]) * scale))
	spec["cost"] = {
		"wood": spec["cost_wood"],
		"stone": spec["cost_stone"],
		"crystal": spec["cost_crystal"],
	}
	return spec


## Returns the 3 Elemental Weapons (`frost_blade`, `inferno_greatblade`, `emerald_scythe`)
## with balanced `+10%–12%` base damage bonus and `+15%` target clade bonus.
static func get_weapons_catalog(lang: String = "en") -> Array:
	return [
		{
			"id": "frost_blade",
			"icon": "❄️",
			"hotkey": "1",
			"name": _tr(lang, "Cryo-Runic Frostblade", "Lame de Givre Cryo-Runique"),
			"element": "frost",
			"base_damage_bonus": 0.10,
			"target_clade": "abyssal",
			"target_species": ["abyssal_shark", "scavenger_goblin"],
			"target_clade_bonus": 0.15,
			"slow_on_hit": 0.35,
			"protects_prey": false,
			"cost_wood": 25,
			"cost_stone": 15,
			"cost_crystal": 20,
			"cost": {"wood": 25, "stone": 15, "crystal": 20},
			"color": Color(0.0, 0.85, 0.96),
			"description": _tr(
				lang,
				"+10% base damage, chills hit targets (-35% speed), and deals +15% bonus damage vs Abyssal Sharks & Goblins.",
				"+10% dégâts de base, ralentit les cibles touchées (-35% vitesse) et inflige +15% contre les Requins et Gobelins."
			),
		},
		{
			"id": "inferno_greatblade",
			"icon": "🔥",
			"hotkey": "2",
			"name": _tr(lang, "Solar Inferno Greatblade", "Espadon Solaire Ignis"),
			"element": "fire",
			"base_damage_bonus": 0.12,
			"target_clade": "colossus",
			"target_species": ["carrion_beetle", "tunnel_mole", "forest_wolf"],
			"target_clade_bonus": 0.15,
			"burn_dps": 6.0,
			"protects_prey": false,
			"cost_wood": 20,
			"cost_stone": 30,
			"cost_crystal": 25,
			"cost": {"wood": 20, "stone": 30, "crystal": 25},
			"color": Color(1.0, 0.36, 0.08),
			"description": _tr(
				lang,
				"+12% base damage, ignites enemies (6 DPS), and deals +15% bonus damage vs Armored Trolls, Tunnel Moles & Wolves.",
				"+12% dégâts de base, embrase les ennemis (6 DPS) et inflige +15% contre les Colosses, Taupes Géantes et Loups."
			),
		},
		{
			"id": "emerald_scythe",
			"icon": "🌿",
			"hotkey": "3",
			"name": _tr(lang, "Sylvan Emerald Scythe (Prey Aegis)", "Faux d'Émeraude Sylvestre (Égide du Gibier)"),
			"element": "nature",
			"base_damage_bonus": 0.11,
			"target_clade": "avian",
			"target_species": ["sky_harpy", "beach_crab"],
			"target_clade_bonus": 0.15,
			"lifesteal_bonus": 0.08,
			"protects_prey": true,
			"cost_wood": 30,
			"cost_stone": 15,
			"cost_crystal": 20,
			"cost": {"wood": 30, "stone": 15, "crystal": 20},
			"color": Color(0.22, 0.94, 0.44),
			"description": _tr(
				lang,
				"+11% base damage, +8% lifesteal, +15% vs Harpies & Crabs, and SPARES all peaceful Glimmer Elk & Meadow Hares from accidental AoE kills!",
				"+11% dégâts de base, +8% drain de vie, +15% contre Harpies & Crabes, et ÉPARGNE toutes les Biches et Lapins des dégâts de zone !"
			),
		},
	]


## Lookup helper for an Elemental Weapon by `weapon_id`.
static func get_weapon_spec(weapon_id: String, lang: String = "en") -> Dictionary:
	var weapons: Array = get_weapons_catalog(lang)
	for w in weapons:
		if w["id"] == weapon_id:
			return w
	return weapons[0]


## Giom's Phase 11 Balanced Diminishing-Returns Mastery Formula (`<= 1%` per monster):
## - Kills 1..5   : `+1.0%` (`0.01`) per monster (`0.01` to `0.05`)
## - Kills 6..15  : `+0.5%` (`0.005`) per monster (`0.055` to `0.10`)
## - Kills 16..35 : `+0.25%` (`0.0025`) per monster (`0.1025` to `0.15`)
## - Hard cap     : `0.15` (`+15.0%` maximum bonus per species or mutation).
static func compute_mastery_bonus(kills: int) -> float:
	var k: int = maxi(0, kills)
	if k <= 0:
		return 0.0
	var tier1: float = float(mini(k, 5)) * 0.01
	var tier2: float = float(maxi(0, mini(k - 5, 10))) * 0.005
	var tier3: float = float(maxi(0, k - 15)) * 0.0025
	return snappedf(minf(0.15, tier1 + tier2 + tier3), 0.0005)


## Returns the mastery bonus as a percentage (`0.0` to `15.0`).
static func compute_mastery_bonus_pct(kills: int) -> float:
	return snappedf(compute_mastery_bonus(kills) * 100.0, 0.1)


## Computes adaptive damage resistance (`0.0` to `0.10` elemental, `0.06` physical) from hits taken.
static func compute_resistance_bonus(hits: int, is_physical: bool = false) -> float:
	var h: int = maxi(0, hits)
	if h <= 0:
		return 0.0
	if is_physical:
		var p1: float = float(mini(h, 5)) * 0.004
		var p2: float = float(maxi(0, h - 5)) * 0.002
		return snappedf(minf(0.06, p1 + p2), 0.001)
	var e1: float = float(mini(h, 6)) * 0.005
	var e2: float = float(maxi(0, mini(h - 6, 16))) * 0.0025
	var e3: float = float(maxi(0, h - 22)) * 0.0015
	return snappedf(minf(0.10, e1 + e2 + e3), 0.001)


## Returns the catalog of Passive Counter-Adaptation Cards for Level-Up modals.
static func get_passive_upgrades_catalog(lang: String = "en") -> Array:
	return [
		{
			"id": "patient_zero_tracker",
			"icon": "🎯",
			"name": _tr(lang, "Patient Zero Tracker", "Traqueur de Patient Zéro"),
			"category": _tr(lang, "Genetic Hunt", "Traque Génétique"),
			"description": _tr(
				lang,
				"+10% sprint speed, +10% melee cleave damage, and +12% damage vs mutated lineages.",
				"+10% vitesse de course, +10% dégâts de fente et +12% dégâts contre les lignées mutantes."
			),
			"bonus": {"speed_mult": 1.10, "melee_mult": 1.10, "mutant_mult": 1.12},
		},
		{
			"id": "juvenile_purge",
			"icon": "🧬",
			"name": _tr(lang, "Juvenile Purge & Conway Drain", "Purge Juvénile & Drain de Conway"),
			"category": _tr(lang, "Conway Ecology", "Écologie Conway"),
			"description": _tr(
				lang,
				"Slaying a mutant drains local Conway fertility by 12% and grants +12% damage against Juvenile creatures.",
				"Tuer un mutant draine 12% de fertilité locale de Conway et confère +12% dégâts contre les Juvéniles."
			),
			"bonus": {"juvenile_mult": 1.12, "melee_mult": 1.08},
		},
		{
			"id": "amber_blood_vigor",
			"icon": "❤️",
			"name": _tr(lang, "Regenerating Amber Blood", "Sang d'Ambre Régénérant"),
			"category": _tr(lang, "Survival", "Survie"),
			"description": _tr(
				lang,
				"+20 Max HP, instant heal for 30 HP, and +1.5 HP/s passive regeneration in the deep wilderness.",
				"+20 PV Maximum, soin immédiat de 30 PV et régénération passive de +1.5 PV/s en terres sauvages."
			),
			"bonus": {"max_hp_add": 20.0, "instant_heal": 30.0, "regen_add": 1.5},
		},
		{
			"id": "pyrophage_aegis",
			"icon": "🛡️",
			"name": _tr(lang, "Pyrophage & Cryo Aegis", "Égide Pyrophage & Cryo"),
			"category": _tr(lang, "Counter-Mutation", "Contre-Mutation"),
			"description": _tr(
				lang,
				"Reduces all elemental & predator damage taken by 8% and widens melee cleave arc by +0.6m.",
				"Réduit de 8% tous les dégâts reçus et élargit l'arc de fente de mêlée de +0.6m."
			),
			"bonus": {"damage_reduction": 0.08, "cleave_range_add": 0.6},
		},
	]


## Draws `count` (default 3) localized Level-Up choices combining spell upgrades and passive cards.
static func get_level_up_choices(
	spell_levels: Dictionary = {},
	chosen_passives: Array = [],
	lang: String = "en",
	count: int = 3
) -> Array:
	var choices: Array = []
	var spells: Array = get_spells_catalog(lang)
	for sp in spells:
		var sid: String = sp["id"]
		var cur_lvl: int = int(spell_levels.get(sid, 1))
		if cur_lvl < int(sp.get("max_level", 5)):
			var next_lvl: int = cur_lvl + 1
			var next_stats: Dictionary = get_spell_stats_at_level(sid, next_lvl, lang)
			choices.append({
				"id": sid,
				"card_type": "spell",
				"icon": sp["icon"],
				"name": "%s (%s %d)" % [sp["name"], _tr(lang, "Lv.", "Niv."), next_lvl],
				"category": _tr(lang, "3D Spell Upgrade", "Amélioration Sort 3D"),
				"description": "%s -> %s: %d | %s: %.1fs" % [
					sp["scaling_desc"],
					_tr(lang, "Damage", "Dégâts"),
					int(next_stats["damage"]),
					_tr(lang, "Cooldown", "Recharge"),
					float(next_stats["cooldown"]),
				],
				"next_level": next_lvl,
			})

	var passives: Array = get_passive_upgrades_catalog(lang)
	for p in passives:
		if not chosen_passives.has(p["id"]) or choices.size() < count:
			choices.append({
				"id": p["id"],
				"card_type": "passive",
				"icon": p["icon"],
				"name": p["name"],
				"category": p["category"],
				"description": p["description"],
				"bonus": p["bonus"],
			})

	if choices.size() > count:
		choices.resize(count)
	return choices
