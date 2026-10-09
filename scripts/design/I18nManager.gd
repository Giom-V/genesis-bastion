class_name I18nManager
extends Node
## Centralized Bilingual Localization Engine (`🇬🇧 English` default `"en"`, `🇫🇷 Français` 2nd option `"fr"`)
## for Genesis Bastion — Godot 4.3 Edition.
##
## Responsibilities:
## - Maintains the active language state (`current_language = "en"` by default, `"fr"` as 2nd option).
## - Emits `language_changed(new_lang: String)` whenever the language is switched in real time from the
##   Settings Menu `[O]` or via code, allowing `HUDController`, `AudioDirector`, `PlayerCharacter`, and
##   `MainGame` to refresh all labels and Gemini TTS voiceover paths immediately.
## - Provides both instance helper `tr_text(en_text, fr_text)` and static helpers
##   `tr_static(lang, en_text, fr_text)` / `tr_auto(en_text, fr_text)`.

signal language_changed(new_lang: String)

const SUPPORTED_LANGUAGES: Array[String] = ["en", "fr"]

static var _active_language: String = "en"

## Current language code (`"en"` default, `"fr"` 2nd choice).
var current_language: String = "en"


func _init() -> void:
	current_language = _active_language


func _ready() -> void:
	current_language = _active_language
	print("[I18nManager] Initialized with default language: %s" % current_language.to_upper())


## Normalizes any language code string into `"en"` (default) or `"fr"`.
static func normalize_lang(lang: String) -> String:
	var clean: String = lang.strip_edges().to_lower()
	if clean.begins_with("fr"):
		return "fr"
	return "en"


## Returns the current instance language (`"en"` default, `"fr"` 2nd choice).
func get_language() -> String:
	return current_language


## Static accessor for the active language across RefCounted data modules.
static func get_active_language() -> String:
	return _active_language


## Sets the active language (`"en"` or `"fr"`) and emits `language_changed` if changed.
func set_language(lang: String) -> void:
	var target: String = normalize_lang(lang)
	var changed: bool = (target != current_language) or (target != _active_language)
	current_language = target
	_active_language = target
	if changed:
		print("[I18nManager] Language switched to %s" % current_language.to_upper())
		language_changed.emit(current_language)


## Static mutator for headless tests or static callers.
static func set_active_language(lang: String) -> void:
	_active_language = normalize_lang(lang)


## Toggles between `"en"` and `"fr"` and returns the newly selected language code.
func toggle_language() -> String:
	var next_lang: String = "fr" if current_language == "en" else "en"
	set_language(next_lang)
	return current_language


## Returns `fr_text` when `current_language == "fr"`, otherwise `en_text` (default `"en"`).
func tr_text(en_text: String, fr_text: String) -> String:
	if current_language == "fr":
		return fr_text if not fr_text.is_empty() else en_text
	return en_text if not en_text.is_empty() else fr_text


## Static translation helper parameterized by `lang` (`"en"` or `"fr"`).
static func tr_static(lang: String, en_text: String, fr_text: String) -> String:
	if normalize_lang(lang) == "fr":
		return fr_text if not fr_text.is_empty() else en_text
	return en_text if not en_text.is_empty() else fr_text


## Static translation helper using `_active_language`.
static func tr_auto(en_text: String, fr_text: String) -> String:
	return tr_static(_active_language, en_text, fr_text)
