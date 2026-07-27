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
        assert stats["entries"] >= 10, stats
        connection = sqlite3.connect(database)
        rows = dict(connection.execute(
            "SELECT word, lemma FROM dictionary WHERE word IN ('translate', 'services', 'retries', 'apples')"
        ).fetchall())
        connection.close()
        assert rows["translate"] == "translate"
        assert rows["services"] == "service"
        assert rows["retries"] == "retry"
        assert rows["apples"] == "apple"
        print("dictionary builder fixture test passed")


if __name__ == "__main__":
    main()
