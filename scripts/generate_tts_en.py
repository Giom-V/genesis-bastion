#!/usr/bin/env python3
"""
Module: scripts/generate_tts_en.py
Description:
  Generates all 15 English Gemini TTS voiceovers (`public/assets/audio/tts/en/*.wav`)
  for Genesis Bastion (Phase 13 Bilingual Localization: English default, French 2nd).
  Uses Commander Aldric (`Fenrir`) and Outrider Scout Chief Kaelen (`Kore`) personas.

Usage:
  python3 scripts/generate_tts_en.py --dry-run
  python3 scripts/generate_tts_en.py
"""

import argparse
import logging
import os
import shutil
import subprocess
import sys
from typing import Dict, List

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [TTS-EN] %(message)s",
)
logger = logging.getLogger("generate_tts_en")

GENERATE_BIN = "/google/bin/releases/gemini-agents-generate/generate"
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "audio", "tts", "en")

ENGLISH_VOICE_LINES: List[Dict[str, str]] = [
    {
        "key": "act1_aldric",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "Welcome to the Bastion Sanctuary, Guardian. The ecosystem around us is "
            "frozen for now. Walk to the golden beacon to the South and adjust your camera."
        ),
    },
    {
        "key": "act2_aldric",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "A stray Goblin and an Orc marauder are approaching! Strike them with your "
            "runic sword, dodge with Shift, and choose your first spell at level two."
        ),
    },
    {
        "key": "act3_aldric",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "Eliminate that wolf, rescue the survivor locked in the cage to the Southeast "
            "with the E key, then harvest wood or crystal for our camp."
        ),
    },
    {
        "key": "act4_aldric",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "Use our resources to build a Watchtower on the golden pad, then repel the "
            "goblin raiders charging our ramparts!"
        ),
    },
    {
        "key": "act5_kaelen",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Thank you for freeing me! Assign a survivor to the Scout role in the left "
            "panel: we will patrol beyond the frontier to track down mutations."
        ),
    },
    {
        "key": "act6_kaelen",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Priority alert! I have spotted a Baby Fire Troll to the Northeast! It is a "
            "Patient Zero: eliminate it quickly before it matures and reproduces!"
        ),
    },
    {
        "key": "act7_kaelen",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Well done! The Darwinian ecosystem now awakens across the entire island. "
            "But beware the caldera Dragons: as long as we do not attack them, they leave us in peace!"
        ),
    },
    {
        "key": "alert_patient_zero",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Scout Alert! A new mutant Patient Zero has been spotted in the wilds! "
            "Hunt it down before the next breeding cycle!"
        ),
    },
    {
        "key": "alert_dragon_wrath",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Disaster! You have provoked a Sovereign Dragon! The entire species has "
            "entered a frenzy and is descending upon our Bastion!"
        ),
    },
    {
        "key": "alert_shark_landing",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Coastal alert! Abyssal Sharks have evolved amphibious legs and are "
            "storming onto our beaches!"
        ),
    },
    {
        "key": "alert_mole_eruption",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Watch the ground beneath your feet! Burrowing Giant Moles are erupting "
            "from underground tunnels!"
        ),
    },
    {
        "key": "alert_prey_crisis",
        "speaker": "Kaelen",
        "voice": "Kore",
        "text": (
            "Ecological alert! Our spells have decimated the herbivore prey! Without "
            "deer or rabbits, famine looms and the predators are going berserk!"
        ),
    },
    {
        "key": "alert_relic_found",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "Eden Relic Fragment recovered! Gather all three ancient fragments to "
            "raise the Solar Shield Dome across the entire island!"
        ),
    },
    {
        "key": "alert_island_victory",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "Victory! The Shield of Eden shines across the entire island and purifies "
            "the ecosystem! Our Bastion is unbreakable: prepare to set sail for the next island!"
        ),
    },
    {
        "key": "alert_gameover_requiem",
        "speaker": "Aldric",
        "voice": "Fenrir",
        "text": (
            "The Guardian has fallen, and shadows close in upon the Bastion. In this "
            "unforgiving world, every death seals the fate of an expedition. Will you "
            "start anew for a fresh lineage, or invoke the Sanctuary's Grace to carry on?"
        ),
    },
]


def generate_single_voice(entry: Dict[str, str], dry_run: bool = False) -> str:
    """
    Generates a single English WAV file via Gemini TTS in /tmp and copies it to OUTPUT_DIR.
    """
    key = entry["key"]
    voice = entry["voice"]
    speaker = entry["speaker"]
    text = entry["text"]
    tmp_path = f"/tmp/en_{key}.wav"
    dest_path = os.path.join(OUTPUT_DIR, f"{key}.wav")

    logger.info(
        "[LLM Gemini TTS Request] key=%s speaker=%s voice=%s model=gemini-v4s-tts prompt=%r",
        key,
        speaker,
        voice,
        text,
    )

    if dry_run:
        logger.info("[DRY-RUN] Skipping binary execution for %s -> %s", tmp_path, dest_path)
        return dest_path

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    cmd = [
        GENERATE_BIN,
        f"-output={tmp_path}",
        "tts",
        f"--voice={voice}",
        text,
    ]
    subprocess.run(cmd, cwd="/tmp", check=True)
    shutil.copy2(tmp_path, dest_path)
    os.chmod(dest_path, 0o644)
    size_bytes = os.path.getsize(dest_path)
    logger.info(
        "[LLM Gemini TTS Response] Generated %s (%d bytes, RIFF WAVE 24kHz)",
        dest_path,
        size_bytes,
    )
    return dest_path


def main() -> int:
    """
    Entry point for generating or verifying the 15 English Gemini TTS voiceovers.
    """
    parser = argparse.ArgumentParser(description="Generate English Gemini TTS voiceovers.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log all TTS prompts and parameters without writing files.",
    )
    args = parser.parse_args()

    logger.info(
        "Starting English Gemini TTS generation (%d tracks, dry_run=%s)",
        len(ENGLISH_VOICE_LINES),
        args.dry_run,
    )
    for item in ENGLISH_VOICE_LINES:
        generate_single_voice(item, dry_run=args.dry_run)
    logger.info("Completed all %d English Gemini TTS tracks.", len(ENGLISH_VOICE_LINES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
