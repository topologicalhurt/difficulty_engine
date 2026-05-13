from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DIST_FILE = ROOT / "dist" / "difficulty_engine.html"
DOC_FILES = [
    ROOT / "ARCHITECTURE.md",
    ROOT / "CHANGE_GUIDE.md",
    ROOT / "README.md",
]

INLINE_HANDLER_RE = re.compile(r"<[^>]+\son[a-z]+\s*=", re.IGNORECASE)
INNER_HTML_RE = re.compile(r"\.innerHTML\s*=")
ALERT_RE = re.compile(r"\b(alert|confirm|prompt)\s*\(")
REMOVED_FRAGMENT_IMPORT_RE = re.compile(r"from ['\"](\.\.?/)+js/")
DEFAULT_EXPORT_RE = re.compile(r"^\s*export\s+default\b", re.MULTILINE)
BROWSER_GLOBAL_RE = re.compile(r"\b(window|document|localStorage|navigator)\s*[\.\[]")
UI_RAW_STATE_RE = re.compile(r"\bstate\.(project|snapshot)\b")
AD_HOC_SELECT_RE = re.compile(
    r"(?:document\.createElement\(['\"](?:select|option)['\"]\)|\bel\(['\"](?:select|option)['\"])",
)
AD_HOC_TEXT_CONTROL_RE = re.compile(
    r"(?:document\.createElement\(['\"](?:input|textarea)['\"]\)|\bel\(['\"](?:input|textarea)['\"])",
)
AD_HOC_BUTTON_RE = re.compile(
    r"(?:document\.createElement\(['\"]button['\"]\)|\bel\(['\"]button['\"])",
)
RAW_ASSET_IMPORT_RE = re.compile(r"from\s+['\"][^'\"]+\?(?:raw|text)['\"]")
LOCAL_UI_PERCENT_RE = re.compile(r"\$\{\s*Math\.round\([^}]*\*\s*100\)\s*\}%")
LOCAL_FINITE_NUMBER_RE = re.compile(r"\bfunction\s+finiteNumber\b")
LOCAL_COLOR_HASH_RE = re.compile(r"hash\s*=\s*\(\s*hash\s*\*\s*31\s*\+")
STORE_COMMAND_RE = re.compile(r"^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\([^;]*\):", re.MULTILINE)
CONSTRAINT_FIELD_RE = re.compile(r"\{\s*key:\s*'([^']+)'(?P<body>.*?)\}", re.DOTALL)
FORBIDDEN_INTERNAL_TERM_RE = re.compile(
    "|".join(
        [
            r"\bdeprecated\b",
            r"\bdropped\b",
            r"\blegacy\b",
            r"\bobsolete\b",
            r"\bbackwards?\s+compatibility\b",
            r"\bconversation-specific\b",
            r"\bprototype[-\s]+(?:era|state|implementation|wip)\b",
            r"\btransitional\b",
        ]
    ),
    re.IGNORECASE,
)
STALE_ARCHITECTURE_DOC_RE = re.compile(
    r"\b(?:DOM-driven|typed DOM views|framework-light and DOM)\b",
    re.IGNORECASE,
)
JUNK_ARTIFACT_RE = re.compile(
    r"(^|/)(?:\.DS_Store|\.eslintcache|\.tsbuildinfo)$"
    r"|(?:\.bak|\.backup|\.old|\.orig|\.rej|\.tmp|~)$"
)
INFRA_DUPLICATE_MATCHER_RE = re.compile(
    r"\bfunction\s+(?:tokenSet|jaccardTokenSimilarity)\b"
)
LOCAL_STRING_DEDUPE_RE = re.compile(
    r"\bfunction\s+(?:uniqueNonEmpty|uniqueNonEmptyStrings|uniqueStrings)\b"
)
INFRA_PROVIDER_YEAR_RE = re.compile(r"\\b\(1\[5-9\]\\d\{2\}\|20\\d\{2\}\|21\\d\{2\}\)")

MAX_TS_LINES = 500
WARN_TS_LINES = 250
APPROVED_UI_RAW_STATE_FILES = set()
APPROVED_SELECT_FACTORY_FILES = {
    "src/ui/form-controls.ts",
}
APPROVED_TEXT_CONTROL_FILES = {
    "src/ui/form-controls.ts",
    "src/ui/constraint-field.ts",
}
APPROVED_PERCENT_FORMAT_FILES = {
    "src/ui/format.ts",
}
APPROVED_REEXPORT_FILES = {
    "src/index.ts",
    "src/app/wiring/contracts.ts",
    "src/core/defaults.ts",
    "src/core/types/domain.ts",
    "src/core/internal-types.ts",
    "src/core/types.ts",
    "src/core/types/snapshot.ts",
}
APP_UI_IMPORT_ALLOWLIST = {
    "src/app/mount.ts": {"src/ui/svelte/AppShell.svelte"},
}
DEFAULT_EXPORT_ALLOWLIST = {
    "src/svelte.d.ts",
}

TOP_LEVEL_HELPER_RE = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b"
    r"|^(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=",
    re.MULTILINE,
)
LOCAL_NUMERIC_CONST_RE = re.compile(
    r"^\s*const\s+([a-z][a-zA-Z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?\b",
    re.MULTILINE,
)
RELATIVE_IMPORT_RE = re.compile(r"^\s*import(?:\s+type)?[^'\"]*from\s+['\"](?P<path>\.{1,2}/[^'\"]+)['\"]", re.MULTILINE)
REEXPORT_RE = re.compile(r"^\s*export\s+(?:type\s+)?(?:\*|\{[^}]+\})\s+from\s+['\"]", re.MULTILINE)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def project_source_files() -> list[Path]:
    return sorted(
        path
        for pattern in ("*.ts", "*.svelte")
        for path in SRC.rglob(pattern)
        if path.is_file()
    )


def resolve_relative_import(source: Path, specifier: str) -> str | None:
    base = (source.parent / specifier).resolve()
    candidates = [
        base,
        base.with_suffix(".ts"),
        base.with_suffix(".svelte"),
        base / "index.ts",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.relative_to(ROOT))
    return None


def main() -> int:
    failures: list[str] = []
    warnings: list[str] = []
    source_files = project_source_files()

    ignored_artifact_roots = {
        ".git",
        "node_modules",
        "coverage",
        "test-results",
        "data",
    }
    junk_artifacts = [
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and not set(path.relative_to(ROOT).parts).intersection(ignored_artifact_roots)
        and JUNK_ARTIFACT_RE.search(str(path.relative_to(ROOT)).replace("\\", "/"))
    ]
    if junk_artifacts:
        failures.extend(
            f"Junk/local artifact should be removed: {path.relative_to(ROOT)}"
            for path in sorted(junk_artifacts)
        )

    removed_runtime_artifacts = sorted((SRC / "core").glob("*.js")) + sorted((SRC / "core").glob("*.d.ts"))
    for path in removed_runtime_artifacts:
        if path.exists():
            failures.append(f"Removed runtime artifact still present: {path.relative_to(ROOT)}")

    if (SRC / "infra" / "token-similarity.ts").exists():
        failures.append("Duplicate infra matcher helper still present: src/infra/token-similarity.ts")

    for path in DOC_FILES:
        if not path.exists():
            failures.append(f"Required architecture/change document missing: {path.relative_to(ROOT)}")
            continue
        text = read_text(path)
        if STALE_ARCHITECTURE_DOC_RE.search(text):
            failures.append(f"Stale pre-Svelte architecture wording in {path.relative_to(ROOT)}")
    architecture_doc = ROOT / "ARCHITECTURE.md"
    if architecture_doc.exists():
        architecture_text = read_text(architecture_doc)
        if "PlannerComputeAdapter" not in architecture_text or "Svelte" not in architecture_text:
            failures.append("ARCHITECTURE.md must document the Svelte shell and PlannerComputeAdapter.")
    change_guide = ROOT / "CHANGE_GUIDE.md"
    if change_guide.exists():
        change_text = read_text(change_guide)
        required_patterns = [
            "Document content priority: `src/infra/document-content-priority.ts`",
            "Document candidate quality: `src/infra/document-candidate-quality.ts`",
            "Guide content: `src/content/info/readme.ts`",
            "Apply domains are strict",
            "Architecture baseline metrics: `docs/architecture-metrics.md`",
            "Add Or Change Worker Compute Or Persistence",
            "If the change creates a new helper",
        ]
        for pattern in required_patterns:
            if pattern not in change_text:
                failures.append(f"CHANGE_GUIDE.md missing canonical guidance: {pattern}")

    oversized = [path for path in source_files if len(read_text(path).splitlines()) > MAX_TS_LINES]
    if oversized:
        failures.extend(
            f"Oversized source file (> {MAX_TS_LINES} lines): {path.relative_to(ROOT)}"
            for path in oversized
        )

    near_limit = [
        (path, len(read_text(path).splitlines()))
        for path in source_files
        if WARN_TS_LINES < len(read_text(path).splitlines()) <= MAX_TS_LINES
    ]
    if near_limit:
        warnings.append(
            "Near-limit source files (> "
            f"{WARN_TS_LINES} lines): "
            + ", ".join(
                f"{path.relative_to(ROOT)} ({line_count})"
                for path, line_count in sorted(near_limit, key=lambda item: item[1], reverse=True)[:12]
            )
        )

    inner_html_hits = [path for path in source_files if INNER_HTML_RE.search(read_text(path))]
    if inner_html_hits:
        failures.extend(f"Forbidden innerHTML assignment: {path.relative_to(ROOT)}" for path in inner_html_hits)

    blocking_ui_hits = [path for path in source_files if ALERT_RE.search(read_text(path))]
    if blocking_ui_hits:
        failures.extend(f"Blocking browser primitive in source: {path.relative_to(ROOT)}" for path in blocking_ui_hits)

    for path in source_files:
        text = read_text(path)
        relative_path = str(path.relative_to(ROOT))
        if REMOVED_FRAGMENT_IMPORT_RE.search(text):
            failures.append(f"Unexpected removed-fragment import path: {path.relative_to(ROOT)}")
        if FORBIDDEN_INTERNAL_TERM_RE.search(text) or FORBIDDEN_INTERNAL_TERM_RE.search(relative_path):
            failures.append(f"Forbidden internal/WIP wording in shipped source: {path.relative_to(ROOT)}")
        if DEFAULT_EXPORT_RE.search(text) and relative_path not in DEFAULT_EXPORT_ALLOWLIST:
            failures.append(f"Default export in library source: {path.relative_to(ROOT)}")
        if "src/core/" in str(path.relative_to(ROOT)) and BROWSER_GLOBAL_RE.search(text):
            failures.append(f"Browser global used inside core module: {path.relative_to(ROOT)}")
        if relative_path.startswith("src/infra/") and INFRA_DUPLICATE_MATCHER_RE.search(text):
            failures.append(
                f"Ad hoc infra fuzzy matcher should use src/core/matchers.ts: {path.relative_to(ROOT)}"
            )
        if LOCAL_STRING_DEDUPE_RE.search(text):
            failures.append(
                f"Local string dedupe helper should use src/core/utils.ts: {path.relative_to(ROOT)}"
            )
        if relative_path != "src/core/number-format.ts" and LOCAL_FINITE_NUMBER_RE.search(text):
            failures.append(
                f"Local finite-number formatter should use src/core/number-format.ts: {path.relative_to(ROOT)}"
            )
        if relative_path != "src/core/display-colors.ts" and LOCAL_COLOR_HASH_RE.search(text):
            failures.append(
                f"Local display color hashing should use src/core/display-colors.ts: {path.relative_to(ROOT)}"
            )
        if (
            relative_path.startswith("src/infra/")
            and relative_path != "src/infra/source-metadata.ts"
            and INFRA_PROVIDER_YEAR_RE.search(text)
        ):
            failures.append(
                f"Provider year parsing should use src/infra/source-metadata.ts: {path.relative_to(ROOT)}"
            )
        if (
            "src/ui/" in str(path.relative_to(ROOT))
            and path.name not in APPROVED_UI_RAW_STATE_FILES
            and UI_RAW_STATE_RE.search(text)
        ):
            failures.append(
                f"UI module reads raw project/snapshot state instead of selectors: {path.relative_to(ROOT)}"
            )
        if (
            relative_path.startswith("src/ui/")
            and relative_path not in APPROVED_SELECT_FACTORY_FILES
            and AD_HOC_SELECT_RE.search(text)
        ):
            failures.append(
                f"Ad hoc select/option construction outside selectInput factory: {path.relative_to(ROOT)}"
            )
        if (
            relative_path.startswith("src/ui/")
            and relative_path not in APPROVED_TEXT_CONTROL_FILES
            and AD_HOC_TEXT_CONTROL_RE.search(text)
        ):
            failures.append(
                f"Ad hoc input/textarea construction outside shared control factories: {path.relative_to(ROOT)}"
            )
        if (
            relative_path.startswith("src/ui/")
            and relative_path != "src/ui/dom.ts"
            and AD_HOC_BUTTON_RE.search(text)
        ):
            failures.append(
                f"Ad hoc button construction outside shared button primitive: {path.relative_to(ROOT)}"
            )
        if RAW_ASSET_IMPORT_RE.search(text):
            failures.append(
                f"Raw asset query import leaks private bundler requirements: {path.relative_to(ROOT)}"
            )
        if (
            relative_path.startswith("src/ui/")
            and relative_path not in APPROVED_PERCENT_FORMAT_FILES
            and LOCAL_UI_PERCENT_RE.search(text)
        ):
            failures.append(
                f"Local UI percentage formatting outside formatPercent helper: {path.relative_to(ROOT)}"
            )
        if REEXPORT_RE.search(text) and relative_path not in APPROVED_REEXPORT_FILES:
            failures.append(f"Unapproved re-export adapter/barrel: {path.relative_to(ROOT)}")
        for match in RELATIVE_IMPORT_RE.finditer(text):
            target = resolve_relative_import(path, match.group("path"))
            if not target:
                continue
            if relative_path.startswith("src/core/") and target.startswith(("src/app/", "src/ui/", "src/infra/")):
                failures.append(f"Core module imports outside core: {relative_path} -> {target}")
            if relative_path.startswith("src/infra/") and target.startswith(("src/app/", "src/ui/")):
                failures.append(f"Infra module imports app/ui layer: {relative_path} -> {target}")
            if (
                relative_path.startswith("src/app/")
                and target.startswith("src/ui/")
                and target not in APP_UI_IMPORT_ALLOWLIST.get(relative_path, set())
            ):
                failures.append(f"App module imports UI outside mount boundary: {relative_path} -> {target}")

    helper_locations: dict[str, set[str]] = defaultdict(set)
    for path in source_files:
        text = read_text(path)
        for match in TOP_LEVEL_HELPER_RE.finditer(text):
            helper_name = match.group(1) or match.group(2)
            if helper_name:
                helper_locations[helper_name].add(str(path.relative_to(ROOT)))
    duplicate_helpers = {
        name: sorted(locations)
        for name, locations in helper_locations.items()
        if len(locations) > 1 and not name.startswith("render")
    }
    if duplicate_helpers:
        warnings.append(
            "Duplicate top-level helper names to review: "
            + "; ".join(
                f"{name} in {', '.join(locations[:3])}"
                for name, locations in sorted(duplicate_helpers.items())[:12]
            )
        )

    local_numeric_constants = []
    for path in source_files:
        relative = path.relative_to(ROOT)
        if not str(relative).startswith(("src/core/", "src/app/", "src/infra/")):
            continue
        matches = [match.group(1) for match in LOCAL_NUMERIC_CONST_RE.finditer(read_text(path))]
        if matches:
            local_numeric_constants.append(f"{relative}: {', '.join(matches[:6])}")
    if local_numeric_constants:
        warnings.append(
            "Possible local numeric constants to name or move into domain config: "
            + "; ".join(local_numeric_constants[:12])
        )

    contracts_file = SRC / "app" / "wiring" / "contracts.ts"
    if not contracts_file.exists():
        failures.append("Missing wiring contract registry: src/app/wiring/contracts.ts")
    else:
        contracts_text = "\n".join(
            read_text(path) for path in sorted((SRC / "app" / "wiring").glob("*.ts"))
        )
        if "CONSTRAINT_FIELDS.map" not in contracts_text:
            failures.append("Wiring registry must derive constraint contracts from CONSTRAINT_FIELDS.")
        interfaces_text = read_text(SRC / "core" / "types" / "store.ts")
        commands_block_match = re.search(
            r"export interface PlannerStoreCommands \{(?P<body>.*?)\n\}",
            interfaces_text,
            re.DOTALL,
        )
        command_names = set()
        if commands_block_match:
            command_names = set(STORE_COMMAND_RE.findall(commands_block_match.group("body")))
        missing_commands = sorted(
            command for command in command_names if f"'{command}'" not in contracts_text
        )
        if missing_commands:
            failures.append(
                "PlannerStoreCommands missing wiring contracts: " + ", ".join(missing_commands)
            )
        if "testIds: []" in contracts_text:
            failures.append("Wiring contracts must name at least one test id.")

    defaults_file = SRC / "core" / "constraint-fields.ts"
    defaults_text = read_text(defaults_file)
    missing_effects = [
        match.group(1)
        for match in CONSTRAINT_FIELD_RE.finditer(defaults_text)
        if "effect:" not in match.group("body")
    ]
    if missing_effects:
        failures.append(
            "Constraint fields missing explicit effect metadata: " + ", ".join(missing_effects)
        )

    if not DIST_FILE.exists():
        failures.append("Built HTML missing; run `npm run build` first.")
    else:
        html = read_text(DIST_FILE)
        inline_handlers = len(INLINE_HANDLER_RE.findall(html))
        if inline_handlers:
            failures.append(f"Built HTML contains {inline_handlers} inline handler(s).")
        script_tags = len(re.findall(r"<script\b", html))
        style_tags = len(re.findall(r"<style\b", html))
        if script_tags != 1:
            failures.append(f"Built HTML should have exactly 1 script tag, found {script_tags}.")
        if style_tags != 1:
            failures.append(f"Built HTML should have exactly 1 style tag, found {style_tags}.")
        if FORBIDDEN_INTERNAL_TERM_RE.search(html):
            failures.append("Built HTML contains forbidden internal/WIP wording.")
        if "http-equiv=\"Content-Security-Policy\"" not in html:
            failures.append("Built HTML is missing a Content-Security-Policy meta tag.")
        if "object-src 'none'" not in html or "base-uri 'none'" not in html:
            failures.append("Built HTML Content-Security-Policy must block object embedding and base URI changes.")

    html_outputs = sorted(path for path in (ROOT / "dist").glob("*.html") if path.is_file())
    if [path.name for path in html_outputs] != ["difficulty_engine.html"]:
        failures.append(
            "Dist should contain exactly one canonical HTML artifact named dist/difficulty_engine.html."
        )

    if not (ROOT / "CHANGE_GUIDE.md").exists():
        failures.append("Missing manual change guide: CHANGE_GUIDE.md")
    if not (ROOT / "scripts" / "change_safety_report.py").exists():
        failures.append("Missing change safety report script: scripts/change_safety_report.py")
    if not (ROOT / "docs" / "architecture-metrics.md").exists():
        failures.append("Missing architecture metrics baseline: docs/architecture-metrics.md")

    recommender_apply = SRC / "app" / "store-ai-apply.ts"
    if recommender_apply.exists():
        apply_text = read_text(recommender_apply)
        if "bookProposal.prerequisiteIds" in apply_text or "bookProposal.coStudyIds" in apply_text:
            failures.append(
                "Book recommender apply must not rewrite relationship fields; use relationship proposals."
            )
        if "constraintPatch" in apply_text or "projectSettings" in apply_text:
            failures.append(
                "Book recommender apply must not apply planner setting suggestions."
            )

    autopilot_commands = SRC / "app" / "store-autopilot-commands.ts"
    if autopilot_commands.exists():
        autopilot_text = read_text(autopilot_commands)
        if "readingScopeSettings:" in autopilot_text or "library:" in autopilot_text:
            failures.append("Autopilot apply must patch planner constraints only.")

    print("Source files:", len(source_files))
    print("Built HTML:", DIST_FILE.relative_to(ROOT) if DIST_FILE.exists() else "missing")

    if warnings:
        print("\nAudit warnings:")
        for warning in warnings:
            print(f" - {warning}")

    if failures:
        print("\nAudit failed:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("\nAudit passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
