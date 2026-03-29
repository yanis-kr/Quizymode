# -*- coding: utf-8 -*-
"""Emit the remaining trivia bulk-seed JSON files (43) for the first 50-pair batch."""
from __future__ import annotations

import json
from pathlib import Path

from seed_progress_paths import category_progress_file, ensure_category_progress_dir

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "bulk-seed" / "trivia"
PROGRESS = category_progress_file("trivia", "_progress.md")


def item(
    l1: str,
    l2: str,
    q: str,
    a: str,
    w: list[str],
    e: str,
    k: list[str],
    s: str,
) -> dict:
    return {
        "category": "trivia",
        "navigationKeyword1": l1,
        "navigationKeyword2": l2,
        "question": q,
        "correctAnswer": a,
        "incorrectAnswers": w,
        "explanation": e,
        "keywords": k,
        "source": s,
    }


def write_file(l1: str, l2: str, items: list[dict]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"trivia.{l1}.{l2}.json"
    p.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def oscar_2023() -> str:
    return "https://www.oscars.org/oscars/ceremonies/2023"


def oscar_2022() -> str:
    return "https://www.oscars.org/oscars/ceremonies/2022"


def oscar_2021() -> str:
    return "https://www.oscars.org/oscars/ceremonies/2021"


def oscar_2020() -> str:
    return "https://www.oscars.org/oscars/ceremonies/2020"


def oscar_2019() -> str:
    return "https://www.oscars.org/oscars/ceremonies/2019"


def movies_tv_awards() -> list[dict]:
    u = oscar_2023()
    return [
        item(
            "movies-tv",
            "awards",
            "On the Academy’s 2023 ceremony page (95th Oscars), which film won Best Picture?",
            "Everything Everywhere All at Once",
            ["The Fabelmans", "Tár", "Top Gun: Maverick"],
            "Oscars.org lists Everything Everywhere All at Once as the Best Picture winner.",
            ["oscars", "best-picture"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the same 95th Oscars page, which film won Animated Feature Film?",
            "Guillermo del Toro's Pinocchio",
            ["Turning Red", "Marcel the Shell with Shoes On", "Puss in Boots: The Last Wish"],
            "Oscars.org lists Guillermo del Toro's Pinocchio as Animated Feature winner.",
            ["oscars", "animation"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, which country’s entry won International Feature Film?",
            "Germany",
            ["Japan", "Poland", "Argentina"],
            "Oscars.org lists Germany (All Quiet on the Western Front) as International Feature winner.",
            ["oscars", "international-feature"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, who won Actor in a Leading Role?",
            "Brendan Fraser",
            ["Austin Butler", "Colin Farrell", "Paul Mescal"],
            "Oscars.org lists Brendan Fraser (The Whale) as Lead Actor winner.",
            ["oscars", "acting"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, who won Actress in a Leading Role?",
            "Michelle Yeoh",
            ["Cate Blanchett", "Ana de Armas", "Michelle Williams"],
            "Oscars.org lists Michelle Yeoh as Lead Actress winner.",
            ["oscars", "acting"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, who won Actor in a Supporting Role?",
            "Ke Huy Quan",
            ["Barry Keoghan", "Brian Tyree Henry", "Judd Hirsch"],
            "Oscars.org lists Ke Huy Quan as Supporting Actor winner.",
            ["oscars", "acting"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, who won Actress in a Supporting Role?",
            "Jamie Lee Curtis",
            ["Angela Bassett", "Hong Chau", "Kerry Condon"],
            "Oscars.org lists Jamie Lee Curtis as Supporting Actress winner.",
            ["oscars", "acting"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, which duo won Directing for Everything Everywhere All at Once?",
            "Daniel Kwan and Daniel Scheinert",
            ["Steven Spielberg", "Martin McDonagh", "Todd Field"],
            "Oscars.org lists Daniel Kwan and Daniel Scheinert as Directing winners.",
            ["oscars", "directing"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, which song won Music (Original Song)?",
            "Naatu Naatu (from RRR)",
            ["Lift Me Up", "Hold My Hand", "Applause"],
            "Oscars.org lists Naatu Naatu from RRR as Original Song winner.",
            ["oscars", "original-song"],
            u,
        ),
        item(
            "movies-tv",
            "awards",
            "On the 95th Oscars page, which documentary won Documentary Feature Film?",
            "Navalny",
            ["All That Breathes", "Fire of Love", "A House Made of Splinters"],
            "Oscars.org lists Navalny as Documentary Feature winner.",
            ["oscars", "documentary"],
            u,
        ),
    ]


def movies_tv_movies() -> list[dict]:
    return [
        item(
            "movies-tv",
            "movies",
            "The Academy’s 2022 ceremony page lists which film as Best Picture winner?",
            "CODA",
            ["Belfast", "The Power of the Dog", "West Side Story"],
            "Oscars.org lists CODA as Best Picture for the ceremony summarized on the 2022 page.",
            ["oscars", "best-picture"],
            oscar_2022(),
        ),
        item(
            "movies-tv",
            "movies",
            "The Academy’s 2021 ceremony page lists which film as Best Picture winner?",
            "Nomadland",
            ["Mank", "Minari", "The Trial of the Chicago 7"],
            "Oscars.org lists Nomadland as Best Picture on the 2021 ceremony page.",
            ["oscars", "best-picture"],
            oscar_2021(),
        ),
        item(
            "movies-tv",
            "movies",
            "The Academy’s 2020 ceremony page lists which film as Best Picture winner?",
            "Parasite",
            ["1917", "Ford v Ferrari", "Joker"],
            "Oscars.org lists Parasite as Best Picture on the 2020 ceremony page.",
            ["oscars", "best-picture"],
            oscar_2020(),
        ),
        item(
            "movies-tv",
            "movies",
            "The Academy’s 2019 ceremony page lists which film as Best Picture winner?",
            "Green Book",
            ["Black Panther", "Roma", "A Star Is Born"],
            "Oscars.org lists Green Book as Best Picture on the 2019 ceremony page.",
            ["oscars", "best-picture"],
            oscar_2019(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Visual Effects?",
            "Avatar: The Way of Water",
            ["Top Gun: Maverick", "The Batman", "Black Panther: Wakanda Forever"],
            "Oscars.org lists Avatar: The Way of Water as Visual Effects winner.",
            ["oscars", "visual-effects"],
            oscar_2023(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Sound?",
            "Top Gun: Maverick",
            ["Elvis", "The Batman", "All Quiet on the Western Front"],
            "Oscars.org lists Top Gun: Maverick as Sound winner.",
            ["oscars", "sound"],
            oscar_2023(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Cinematography?",
            "All Quiet on the Western Front",
            ["Elvis", "Bardo, False Chronicle of a Handful of Truths", "Tár"],
            "Oscars.org lists All Quiet on the Western Front as Cinematography winner.",
            ["oscars", "cinematography"],
            oscar_2023(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Costume Design?",
            "Black Panther: Wakanda Forever",
            ["Babylon", "Elvis", "Mrs. Harris Goes to Paris"],
            "Oscars.org lists Black Panther: Wakanda Forever as Costume Design winner.",
            ["oscars", "costumes"],
            oscar_2023(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Production Design?",
            "All Quiet on the Western Front",
            ["Avatar: The Way of Water", "Babylon", "Elvis"],
            "Oscars.org lists All Quiet on the Western Front as Production Design winner.",
            ["oscars", "production-design"],
            oscar_2023(),
        ),
        item(
            "movies-tv",
            "movies",
            "On the 95th Oscars page, which film won Makeup and Hairstyling?",
            "The Whale",
            ["All Quiet on the Western Front", "The Batman", "Elvis"],
            "Oscars.org lists The Whale as Makeup and Hairstyling winner.",
            ["oscars", "makeup"],
            oscar_2023(),
        ),
    ]


def main() -> None:
    pairs: list[tuple[str, str, list[dict]]] = [
        ("movies-tv", "awards", movies_tv_awards()),
        ("movies-tv", "movies", movies_tv_movies()),
    ]
    ensure_category_progress_dir("trivia")
    notes: list[str] = []
    for l1, l2, items in pairs:
        write_file(l1, l2, items)
        doms = sorted({x["source"].split("/")[2] for x in items})
        notes.append(
            f"- `{OUT.name}/trivia.{l1}.{l2}.json` | {l1}/{l2} | n={len(items)} | {', '.join(doms)}"
        )
    PROGRESS.write_text(
        "# trivia bulk-seed progress\n\n" + "\n".join(notes) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
