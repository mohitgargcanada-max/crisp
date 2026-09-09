# Mistakes and what to do differently

## 2026-09-09 — wrote regex escapes through a Python string and silently corrupted them

**What happened.** While patching `engine/lib/hook-runtime.js` I generated JavaScript regex
literals from inside a Python script. I wrote `\b` in a non-raw Python string. Python treats
`\b` as the *backspace character* (0x08), so the word boundaries were written to disk as
invisible control characters. `\s` survived untouched, because `\s` is not a valid Python escape
and is passed through literally — which made the corruption look impossible at a glance.

The file still parsed. `node -e "require(...)"` printed "loads OK". The regex simply stopped
matching what it was supposed to match, and every genuine directive was silently rejected while
the test suite showed junk being correctly filtered. It looked like an over-strict regex, not a
corrupted one.

Then I made the same class of mistake twice more with `\n` inside triple-quoted Python strings
written into a Python file, producing unterminated string literals.

**Why it was wrong.** "The module loads" is not "the code works". I treated a successful import
as verification. The bug was only visible because I ran behaviour tests with known-good and
known-bad inputs — and even then I first misread the symptom as the regex being too tight.

**What to do differently.**
- When generating code that contains backslashes, use raw strings (`r"..."`) always, or avoid
  the escape entirely (`chr(10)` instead of a newline escape).
- After any generated-code patch, `grep` the written line back and read it, before running it.
  A one-line `sed -n '/CONST_NAME/p'` would have shown the missing `\b` immediately.
- Never accept "it imports" / "it parses" as evidence a fix works. Test the behaviour with cases
  that must pass AND cases that must fail. Both directions, or the test proves nothing.
- Check for control characters after generating source: `grep -P '[\x00-\x08]'`.
