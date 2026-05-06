from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CANONICAL_PATTERNS = [
    (
        "UI controls",
        "src/ui/dom.ts",
        "Use button, selectInput, inputField, badge, card, and emptyState instead of local control factories.",
    ),
    (
        "UI formatting",
        "src/ui/format.ts",
        "Use formatPercent, formatOneDecimal, round0, formatDate, parseCsv, and joinCsv for display strings.",
    ),
    (
        "Number formatting",
        "src/core/number-format.ts",
        "Use shared number/percent formatters instead of local finite-number helpers.",
    ),
    (
        "Display colors",
        "src/core/display-colors.ts",
        "Use shared HSL, gradient, group color, and normalized range helpers instead of local color hashing.",
    ),
    (
        "Stable sorting",
        "src/core/sort.ts",
        "Use shared comparator helpers for deterministic multi-field sort chains.",
    ),
    (
        "String compaction, joining, and deduplication",
        "src/core/utils.ts",
        "Use compactString, compactStrings, compactJoin, and uniqueCompactStrings instead of local trim/filter/join/Set helpers.",
    ),
    (
        "External-source matching",
        "src/core/matchers.ts",
        "Use shared title/author/ISBN matching decisions instead of provider-local fuzzy scoring.",
    ),
    (
        "Provider metadata cleanup",
        "src/infra/source-metadata.ts",
        "Use normalizeProviderText, extractPublishedYear, and firstValidIsbn for provider metadata parsing.",
    ),
    (
        "Progress",
        "src/app/selectors/progress.ts",
        "Progress truth is selected in app selectors and rendered by src/ui/progress.ts.",
    ),
    (
        "Constraints",
        "src/core/constraint-fields.ts",
        "Constraint metadata, effects, and option descriptions start here before UI rendering.",
    ),
    (
        "Store commands",
        "src/app/store-*-commands.ts",
        "Commands are domain-specific and must have wiring contracts before UI uses them.",
    ),
    (
        "Wiring contracts",
        "src/app/wiring/",
        "Every semantic control or command must declare reads, writes, effects, recompute policy, and test IDs.",
    ),
    (
        "App test builders",
        "tests/app/store-test-utils.ts",
        "Store/app tests should reuse project, book, provider, and store builders instead of local scaffolding.",
    ),
    (
        "Core test engine helpers",
        "tests/core/engine-test-utils.ts",
        "Core snapshot tests should reuse the shared test engine/logger helper.",
    ),
    (
        "Dates and weekdays",
        "src/core/time.ts",
        "Use core date helpers and shared constants instead of scattered calendar math.",
    ),
    (
        "Infra cache time",
        "src/infra/cache-time.ts",
        "Infra cache expiry uses injected time helpers instead of raw Date.now calls.",
    ),
    (
        "Document content ranking",
        "src/infra/qbittorrent-file-kinds.ts",
        "Content kind, MIME, and path helpers are shared by document and qBittorrent flows.",
    ),
    (
        "Source enablement policy",
        "src/core/source-settings-policy.ts",
        "Provider/source enablement decisions go through these helpers instead of scattered mask checks.",
    ),
    (
        "Source settings patching",
        "src/app/store-source-settings-helpers.ts",
        "Source setting patches should preserve nested masks through the shared helper.",
    ),
]


def status_for(path: str) -> str:
    if "*" in path:
        return "ok" if list(ROOT.glob(path)) else "missing"
    target = ROOT / path
    if path.endswith("/"):
        return "ok" if target.is_dir() else "missing"
    return "ok" if target.is_file() else "missing"


def main() -> int:
    print("Change Safety Report")
    print("====================")
    print("Use this as the edit map before making manual changes.\n")
    failures = []
    for concept, owner, rule in CANONICAL_PATTERNS:
        status = status_for(owner)
        print(f"- {concept}: {owner} [{status}]")
        print(f"  {rule}")
        if status != "ok":
            failures.append(f"{concept}: {owner}")
    if failures:
        print("\nMissing canonical owners:")
        for failure in failures:
            print(f" - {failure}")
        return 1
    print("\nAll canonical owners are present.")
    print("Run `npm run check`, `python3 scripts/audit_source.py`, and `npm run test:e2e` after edits.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
