# Third-party notices

## ECDICT

The generated `dictionary.db` is derived from:

- Project: ECDICT — Free English to Chinese Dictionary Database
- Repository: https://github.com/skywind3000/ECDICT
- Pinned source commit: `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`
- Source file: `ecdict.csv`
- License: MIT

The build keeps single-token entries with Chinese translations and adds aliases from ECDICT's `exchange` field. The original data is not modified in place; it is transformed into a compact SQLite database for offline lookup.

### MIT License

Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
