#!/usr/bin/env python3
"""从固定版本 ECDICT CSV 构建插件使用的紧凑离线中英 SQLite 词典。"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
from pathlib import Path
from typing import Iterable

WORD_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9'\-]*$")
EXCHANGE_PATTERN = re.compile(r"^[a-zA-Z0-9]+:(.+)$")
SCHEMA_VERSION = 1


def normalized_word(value: str) -> str:
    return value.strip().lower()


def valid_word(value: str) -> bool:
    return bool(value and WORD_PATTERN.fullmatch(value.strip()))


def exchange_aliases(exchange: str) -> Iterable[str]:
    for item in (exchange or "").split("/"):
        match = EXCHANGE_PATTERN.match(item.strip())
        if not match:
            continue
        alias = normalized_word(match.group(1))
        if valid_word(alias):
            yield alias


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        CREATE TABLE dictionary (
            word TEXT PRIMARY KEY,
            lemma TEXT NOT NULL,
            phonetic TEXT NOT NULL DEFAULT '',
            translation TEXT NOT NULL,
            pos TEXT NOT NULL DEFAULT '',
            is_alias INTEGER NOT NULL DEFAULT 0 CHECK (is_alias IN (0, 1))
        ) WITHOUT ROWID;
        """
    )


def build_dictionary(input_csv: Path, output_db: Path) -> dict[str, int]:
    output_db.parent.mkdir(parents=True, exist_ok=True)
    if output_db.exists():
        output_db.unlink()

    connection = sqlite3.connect(output_db)
    create_schema(connection)
    base_count = 0
    alias_count = 0
    skipped_count = 0

    with input_csv.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"word", "phonetic", "translation", "pos", "exchange"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"ECDICT CSV missing columns: {', '.join(sorted(missing))}")

        for row in reader:
            original = (row.get("word") or "").strip()
            translation = (row.get("translation") or "").strip()
            if not valid_word(original) or not translation:
                skipped_count += 1
                continue

            word = normalized_word(original)
            phonetic = (row.get("phonetic") or "").strip()
            pos = (row.get("pos") or "").strip()
            connection.execute(
                """
                INSERT INTO dictionary(word, lemma, phonetic, translation, pos, is_alias)
                VALUES (?, ?, ?, ?, ?, 0)
                ON CONFLICT(word) DO UPDATE SET
                    lemma = excluded.lemma,
                    phonetic = excluded.phonetic,
                    translation = excluded.translation,
                    pos = excluded.pos,
                    is_alias = 0
                """,
                (word, word, phonetic, translation, pos),
            )
            base_count += 1

            for alias in exchange_aliases(row.get("exchange") or ""):
                if alias == word:
                    continue
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO dictionary(word, lemma, phonetic, translation, pos, is_alias)
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    (alias, word, phonetic, translation, pos),
                )
                alias_count += max(cursor.rowcount, 0)

    connection.commit()
    connection.execute("VACUUM")
    entry_count = connection.execute("SELECT COUNT(*) FROM dictionary").fetchone()[0]
    connection.close()
    return {
        "base_rows_processed": base_count,
        "aliases_inserted": alias_count,
        "entries": entry_count,
        "rows_skipped": skipped_count,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="Path to ECDICT CSV")
    parser.add_argument("--output", required=True, type=Path, help="Output SQLite database")
    parser.add_argument("--meta", required=True, type=Path, help="Output metadata JSON")
    parser.add_argument("--source-commit", required=True, help="Pinned ECDICT commit SHA")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    stats = build_dictionary(args.input, args.output)
    metadata = {
        "schema_version": SCHEMA_VERSION,
        "source": "skywind3000/ECDICT",
        "source_file": args.input.name,
        "source_commit": args.source_commit,
        "source_license": "MIT",
        **stats,
    }
    args.meta.parent.mkdir(parents=True, exist_ok=True)
    args.meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
