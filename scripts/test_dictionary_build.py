#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from build_dictionary import build_dictionary

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests" / "fixtures" / "ecdict.sample.csv"


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / "dictionary.db"
        stats = build_dictionary(FIXTURE, database)
        assert stats["entries"] >= 12, stats
        assert stats["explicit_lemmas"] >= 4, stats
        assert stats["lemma_links_applied"] >= 4, stats

        connection = sqlite3.connect(database)
        rows = {
            word: {"lemma": lemma, "translation": translation}
            for word, lemma, translation in connection.execute(
                "SELECT word, lemma, translation FROM dictionary "
                "WHERE word IN ('translate', 'translated', 'service', 'services', "
                "'retry', 'retries', 'apple', 'apples')"
            ).fetchall()
        }
        connection.close()

        assert rows["translate"]["lemma"] == "translate"
        assert rows["translated"]["lemma"] == "translate"
        assert rows["service"]["lemma"] == "service"
        assert rows["services"]["lemma"] == "service"
        assert "服务项目" in rows["services"]["translation"]
        assert rows["retry"]["lemma"] == "retry"
        assert rows["retries"]["lemma"] == "retry"
        assert "重试次数" in rows["retries"]["translation"]
        assert rows["apple"]["lemma"] == "apple"
        assert rows["apples"]["lemma"] == "apple"
        print("dictionary builder fixture test passed")


if __name__ == "__main__":
    main()
