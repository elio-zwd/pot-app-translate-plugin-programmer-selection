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
EXCHANGE_PATTERN = re.compile(r"^([a-zA-Z0-9]+):(.+)$")
INFLECTION_TYPES = {"p", "d", "i", "3", "r", "t", "s"}
SCHEMA_VERSION = 1


def normalized_word(value: str) -> str:
    return value.strip().lower()


def valid_word(value: str) -> bool:
    return bool(value and WORD_PATTERN.fullmatch(value.strip()))


def exchange_items(exchange: str) -> Iterable[tuple[str, str]]:
    """解析 ECDICT exchange；0 是当前词条原型，1 是变形类型说明。"""
    for item in (exchange or "").split("/"):
        match = EXCHANGE_PATTERN.match(item.strip())
        if not match:
            continue
        exchange_type = match.group(1).lower()
        value = normalized_word(match.group(2))
        if valid_word(value):
            yield exchange_type, value


def exchange_lemma(exchange: str) -> str:
    for exchange_type, value in exchange_items(exchange):
        if exchange_type == "0":
            return value
    return ""


def exchange_aliases(exchange: str) -> Iterable[str]:
    for exchange_type, value in exchange_items(exchange):
        if exchange_type in INFLECTION_TYPES:
            yield value


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
    explicit_lemma_count = 0
    alias_relations: list[tuple[str, str]] = []

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
            exchange = row.get("exchange") or ""
            explicit_lemma = exchange_lemma(exchange)
            lemma = explicit_lemma if explicit_lemma and explicit_lemma != word else word
            if lemma != word:
                explicit_lemma_count += 1

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
                (word, lemma, phonetic, translation, pos),
            )
            base_count += 1

            # 带 0:lemma 的词条已经明确自身原型，不能再把 1:<类型> 或其他字段
            # 反向解释成“基础词 -> 派生词”。只有基础词的 p/d/i/3/r/t/s 项用于建别名。
            if explicit_lemma:
                continue

            for alias in exchange_aliases(exchange):
                if alias == word:
                    continue
                alias_relations.append((alias, word))
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO dictionary(word, lemma, phonetic, translation, pos, is_alias)
                    VALUES (?, ?, ?, ?, ?, 1)
                    """,
                    (alias, word, phonetic, translation, pos),
                )
                alias_count += max(cursor.rowcount, 0)

    # 显式派生词可能在 CSV 后部覆盖之前插入的别名。全部词条写入后再次应用
    # 基础词的派生关系，但只修改 lemma 仍指向自身的词条；0:lemma 已在插入时写入，
    # 因此具有更高优先级，基础词不会被派生词反向覆盖。
    generated_lemma_links = 0
    for alias, lemma in alias_relations:
        cursor = connection.execute(
            """
            UPDATE dictionary
            SET lemma = ?
            WHERE word = ? AND word <> ? AND lemma = word
            """,
            (lemma, alias, lemma),
        )
        generated_lemma_links += max(cursor.rowcount, 0)

    connection.commit()
    connection.execute("VACUUM")
    entry_count = connection.execute("SELECT COUNT(*) FROM dictionary").fetchone()[0]
    connection.close()
    return {
        "base_rows_processed": base_count,
        "aliases_inserted": alias_count,
        "explicit_lemmas": explicit_lemma_count,
        "generated_lemma_links": generated_lemma_links,
        "lemma_links_applied": explicit_lemma_count + generated_lemma_links,
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
