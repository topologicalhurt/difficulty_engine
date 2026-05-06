from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

REGEX_LITERAL_RE = re.compile(r"(?<![A-Za-z0-9_])/(?:\\.|[^/\n])+/[dgimsuvy]*")
FUZZY_SYMBOL_RE = re.compile(
    r"\b(?:jaccard|similarity|matchScore|MatchScore|tokenSet|TokenSet|relevance|Relevance)\b"
)
DISALLOWED_INFRA_DUPLICATES = {
    "function tokenSet",
    "function jaccardTokenSimilarity",
    "export function jaccardTokenSimilarity",
}
REQUIRED_REGISTRIES = [
    SRC / "core" / "matchers.ts",
    SRC / "core" / "chapter-title-patterns.ts",
    SRC / "infra" / "toc-extraction-patterns.ts",
]


def source_files() -> list[Path]:
    return sorted(path for path in SRC.rglob("*.ts") if path.is_file())


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def main() -> int:
    failures: list[str] = []
    inventory: list[str] = []

    for path in REQUIRED_REGISTRIES:
        if not path.exists():
            failures.append(f"Missing matcher registry: {rel(path)}")

    for path in source_files():
        text = path.read_text(encoding="utf-8")
        relative = rel(path)
        regex_count = len(REGEX_LITERAL_RE.findall(text))
        fuzzy_count = len(FUZZY_SYMBOL_RE.findall(text))
        if regex_count or fuzzy_count:
            inventory.append(
                f"{relative}: regex={regex_count}, fuzzy-symbols={fuzzy_count}"
            )
        if relative.startswith("src/infra/"):
            for disallowed in DISALLOWED_INFRA_DUPLICATES:
                if disallowed in text:
                    failures.append(
                        f"Duplicate infra fuzzy helper; use src/core/matchers.ts: {relative}"
                    )
        if relative == "src/infra/token-similarity.ts":
            failures.append("Removed duplicate matcher helper still exists: src/infra/token-similarity.ts")

    print("Matcher Audit")
    print("=============")
    for line in inventory:
        print(line)

    if failures:
        print("\nFailures:")
        for failure in failures:
            print(f" - {failure}")
        return 1
    print("\nMatcher audit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
