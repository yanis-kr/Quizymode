"""One-off patcher: assign taxonomy category + navigationKeyword1/2 to minimal seed JSON."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "seed" / "minimal"

# basename -> (category, nav1, nav2, strip_from_keywords_prefixes)
# strip: remove these normalized tokens from keywords (nav + old category aliases)
SPECS = {
    "tests.act.reading.json": ("exams", "act", "reading", {"tests", "act", "reading"}),
    "tests.sat.math.json": ("exams", "sat", "math", {"tests", "sat", "math"}),
    "tests.sat.reading.json": ("exams", "sat", "reading", {"tests", "sat", "reading"}),
    "tests.nclex.med-surg.json": ("exams", "nursing", "med-surg", {"tests", "nclex", "med-surg"}),
    "certs.aws.saa-c02.json": ("exams", "aws", "saa-c03", {"certs", "aws", "saa-c02", "saa-c03"}),
    "entertainment.movies.json": ("trivia", "movies-tv", "movies", {"entertainment", "movies"}),
    "culture.food.json": ("trivia", "food-drink", "cuisine", {"culture", "food"}),
    "general.trivia.json": ("trivia", "general", "mixed", {"general", "trivia"}),
    "general.world-records.json": ("trivia", "general", "hard", {"general", "world-records", "records"}),
    "general.world-records.humans.json": ("trivia", "famous-people", "mixed", {"general", "world-records", "humans"}),
    "general.world-records.animals.json": ("trivia", "animals", "wildlife", {"general", "world-records", "animals"}),
    "general.world-records.weird.json": ("trivia", "general", "hard", {"general", "world-records", "weird"}),
    "puzzles.riddles.json": ("humanities", "philosophy", "logic", {"puzzles", "riddles"}),
    "science.astronomy.json": ("science", "astronomy", "solar-system", {"science", "astronomy"}),
    "history.us-history.json": ("history", "us-history", "colonial", {"history", "us-history"}),
    "language.spanish.json": ("languages", "spanish", "vocab", {"language", "spanish"}),
    "language.spanish.expressions.json": ("languages", "spanish", "conversation", {"language", "spanish", "expressions"}),
    "language.french.json": ("languages", "french", "vocab", {"language", "french"}),
    "language.french.expressions.json": ("languages", "french", "conversation", {"language", "french", "expressions"}),
    "language.english.expressions.json": ("languages", "english", "idioms", {"language", "english", "expressions"}),
    "sports.soccer.json": ("sports", "soccer", "world-cup", {"sports", "soccer"}),
    "nature.animals.predators.json": ("nature", "animals", "predators", {"nature", "animals"}),
    "nature.plants.poisonous.json": ("nature", "plants", "poisonous", {"nature", "plants"}),
    "nature.ecosystems.tundra.json": ("nature", "ecosystems", "tundra", {"nature", "ecosystems"}),
    "nature.phenomena.aurora.json": ("nature", "phenomena", "aurora", {"nature", "phenomena"}),
    "outdoors.survival.forest.json": ("nature", "survival", "forest", {"outdoors", "survival"}),
    "outdoors.survival.tropical-island.json": ("nature", "survival", "tropical-island", {"outdoors", "survival"}),
    "outdoors.camping.basics.json": ("nature", "camping", "basics", {"outdoors", "camping"}),
    "outdoors.navigation.json": ("nature", "navigation", "map-compass", {"outdoors", "navigation"}),
}


def norm(s: str) -> str:
    return s.strip().lower()


def strip_keywords(kws: list[str], category: str, nav1: str, nav2: str, extra_strip: set[str]) -> list[str]:
    skip = {norm(category), norm(nav1), norm(nav2)} | {norm(x) for x in extra_strip}
    out = []
    for k in kws or []:
        n = norm(k)
        if not n or n in skip:
            continue
        out.append(n)
    return out


def main():
    for name, (cat, n1, n2, strip) in SPECS.items():
        path = ROOT / name
        if not path.exists():
            print("missing", path)
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for i, row in enumerate(data):
            row["category"] = cat
            kws = row.get("keywords") or []
            row["keywords"] = strip_keywords(kws, cat, n1, n2, strip)
            if i == 0:
                row["navigationKeyword1"] = n1
                row["navigationKeyword2"] = n2
            else:
                row.pop("navigationKeyword1", None)
                row.pop("navigationKeyword2", None)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print("patched", name)


if __name__ == "__main__":
    main()
