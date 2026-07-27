#!/usr/bin/env python3
"""将运行时源文件合成为 Pot 所需的单文件 main.js。"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "src"
OUTPUT = ROOT / "main.js"


def main() -> None:
    fragments = sorted(SOURCE_DIR.glob("runtime-*.js"))
    if not fragments:
        raise SystemExit("No runtime fragments found")
    content = "".join(path.read_text(encoding="utf-8") for path in fragments)
    if "async function translate" not in content:
        raise SystemExit("Generated runtime does not define translate")
    if "plugin.com.elio.programmer-selection-translator" not in content:
        raise SystemExit("Generated runtime does not use the expected plugin id")
    if "lingva" in content.lower() or "requestPath" in content:
        raise SystemExit("Generated runtime still contains Lingva template logic")
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"generated {OUTPUT} from {len(fragments)} fragments")


if __name__ == "__main__":
    main()
