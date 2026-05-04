from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
WARN_TS_LINES = 250
MAX_TS_LINES = 500

IMPORT_RE = re.compile(r"^\s*import\b", re.MULTILINE)
EXPORT_RE = re.compile(
    r"^\s*export\s+(?:type\s+)?(?:interface|type|class|function|const|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)",
    re.MULTILINE,
)
TOP_LEVEL_SYMBOL_RE = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\b"
    r"|^(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=",
    re.MULTILINE,
)
NUMERIC_CONST_RE = re.compile(
    r"^\s*const\s+([A-Z][A-Z0-9_]*|[a-z][a-zA-Z0-9_]*)\s*=\s*-?\d+(?:\.\d+)?\b",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ModuleReport:
    path: Path
    lines: int
    imports: int
    exports: tuple[str, ...]
    numeric_constants: tuple[str, ...]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def ts_files() -> list[Path]:
    return sorted(path for path in SRC.rglob("*.ts") if path.is_file())


def module_report(path: Path) -> ModuleReport:
    text = read_text(path)
    return ModuleReport(
        path=path,
        lines=len(text.splitlines()),
        imports=len(IMPORT_RE.findall(text)),
        exports=tuple(EXPORT_RE.findall(text)),
        numeric_constants=tuple(NUMERIC_CONST_RE.findall(text)),
    )


def duplicate_symbols(files: list[Path]) -> dict[str, list[str]]:
    locations: dict[str, set[str]] = defaultdict(set)
    for path in files:
        text = read_text(path)
        for match in TOP_LEVEL_SYMBOL_RE.finditer(text):
            symbol = match.group(1) or match.group(2)
            if symbol:
                locations[symbol].add(str(path.relative_to(ROOT)))
    return {
        symbol: sorted(paths)
        for symbol, paths in sorted(locations.items())
        if len(paths) > 1
    }


def print_section(title: str) -> None:
    print(f"\n{title}")
    print("-" * len(title))


def main() -> int:
    files = ts_files()
    reports = [module_report(path) for path in files]

    print("Architecture Report")
    print("===================")
    print(f"Source files: {len(reports)}")
    print(f"Total TypeScript lines: {sum(report.lines for report in reports)}")
    print(f"Files over {WARN_TS_LINES} lines: {sum(report.lines > WARN_TS_LINES for report in reports)}")
    print(f"Files over {MAX_TS_LINES} lines: {sum(report.lines > MAX_TS_LINES for report in reports)}")

    print_section("Largest Modules")
    for report in sorted(reports, key=lambda item: item.lines, reverse=True)[:20]:
        marker = "FAIL" if report.lines > MAX_TS_LINES else "WARN" if report.lines > WARN_TS_LINES else "OK"
        print(
            f"{marker:4} {report.lines:4} lines  {report.imports:2} imports  "
            f"{len(report.exports):2} exports  {report.path.relative_to(ROOT)}"
        )

    print_section("Duplicate Top-Level Symbols")
    duplicates = duplicate_symbols(files)
    if duplicates:
        for symbol, paths in list(duplicates.items())[:30]:
            print(f"{symbol}: {', '.join(paths)}")
    else:
        print("None detected.")

    print_section("Numeric Constants By Module")
    numeric_reports = [report for report in reports if report.numeric_constants]
    if numeric_reports:
        for report in sorted(numeric_reports, key=lambda item: len(item.numeric_constants), reverse=True)[:30]:
            constants = ", ".join(report.numeric_constants[:12])
            print(f"{report.path.relative_to(ROOT)}: {constants}")
    else:
        print("None detected.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
