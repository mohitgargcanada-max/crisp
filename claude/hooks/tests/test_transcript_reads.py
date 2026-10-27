"""Tests for the incremental transcript reads in auto_handover.py (2026-10-26).

Run:  python -m unittest discover -s claude/hooks/tests -v   (from the crisp repo root)

The mistake-scan watermark became a byte offset, and _wrote_this_turn reads only the
tail, because both used to read the whole transcript on every Stop (about 100 s on a
1.4 GB transcript). These tests pin that the new reads see exactly what the old
whole-file reads saw: the same new messages, the same touched files, the same turn.
"""
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_skill_observations import Base, meta, result, say, tool, user  # noqa: E402
import auto_handover as ah  # noqa: E402


class Incremental(Base):
    def append(self, entries, newline=True):
        with open(self.transcript, "a", encoding="utf-8") as f:
            for e in entries:
                f.write(json.dumps(e) + ("\n" if newline else ""))

    def stop(self, session="s1"):
        new, files, end = ah._new_since_watermark(str(self.repo), session, str(self.transcript))
        ah._save_watermark(str(self.repo), session, end, files)
        return [m["text"] for m in new], files

    def test_second_stop_reads_only_new_lines_and_keeps_files(self):
        self.write([user("first"), tool("Edit", {"file_path": "/r/a.py"}, "t1"), say("one")])
        texts, files = self.stop()
        self.assertEqual(texts, ["first", "one"])
        self.append([user("second"), tool("Read", {"file_path": "/r/b.md"}, "t2"), say("two")])
        texts, files = self.stop()
        self.assertEqual(texts, ["second", "two"])
        self.assertEqual(files, {"a.py", "b.md"})      # a.py came from the earlier turn
        # Same answer as the old whole-file read.
        _, old_files, old_all = ah._read_transcript(str(self.transcript))
        self.assertEqual(old_files, files)
        self.assertEqual([m["text"] for m in old_all][2:], texts)

    def test_nothing_new_reads_nothing(self):
        self.write([user("first"), say("one")])
        self.stop()
        self.assertEqual(self.stop()[0], [])

    def test_line_still_being_written_is_left_for_next_stop(self):
        self.write([user("first")])
        self.stop()
        half = json.dumps(say("not finished yet"))
        with open(self.transcript, "a", encoding="utf-8") as f:
            f.write(half[:20])
        self.assertEqual(self.stop()[0], [])
        with open(self.transcript, "a", encoding="utf-8") as f:
            f.write(half[20:] + "\n")
        self.assertEqual(self.stop()[0], ["not finished yet"])   # once, whole
        self.assertEqual(self.stop()[0], [])

    def test_complete_last_line_without_newline_is_read(self):
        # The old splitlines() read kept such a line, so the new read must too.
        self.write([user("first")])
        self.transcript.write_text(self.transcript.read_text(encoding="utf-8").rstrip("\n"), encoding="utf-8")
        self.assertEqual(self.stop()[0], ["first"])

    def test_non_ascii_survives(self):
        self.write([user("first"), say("caf\u00e9 \u2014 done \u2028 next")])
        self.assertEqual(self.stop()[0], ["first", "caf\u00e9 \u2014 done \u2028 next"])

    def test_legacy_count_entry_gives_the_old_slice(self):
        self.write([user("a"), say("b"), user("c"), say("d")])
        ah._watermark_path(str(self.repo)).parent.mkdir(parents=True, exist_ok=True)
        ah._watermark_path(str(self.repo)).write_text(json.dumps({"s1": 2}), encoding="utf-8")
        self.assertEqual(self.stop()[0], ["c", "d"])
        saved = json.loads(ah._watermark_path(str(self.repo)).read_text(encoding="utf-8"))["s1"]
        self.assertEqual(saved["offset"], self.transcript.stat().st_size)

    def test_rewritten_shorter_transcript_counts_nothing_as_new(self):
        self.write([user("a"), say("b"), user("c")])
        self.stop()
        self.write([user("x")])
        self.assertEqual(self.stop()[0], [])
        self.append([say("y")])
        self.assertEqual(self.stop()[0], ["y"])

    def test_other_sessions_entries_are_kept(self):
        self.write([user("a")])
        self.stop("s1")
        self.stop("s2")
        data = json.loads(ah._watermark_path(str(self.repo)).read_text(encoding="utf-8"))
        self.assertEqual(sorted(data), ["s1", "s2"])

    def test_unreadable_transcript_is_logged_not_raised(self):
        new, files, end = ah._read_new_messages(str(self.transcript) + ".missing", 0)
        self.assertEqual((new, files, end), ([], set(), 0))
        self.assertIn("_read_new_messages", ah.ERROR_LOG.read_text(encoding="utf-8"))


class MainWatermark(Base):
    """main() end to end in-process, recording what the mistake scan is given."""

    def run_main(self):
        seen = []
        real = ah._scan_mistakes
        payload = json.dumps({"session_id": "m1", "cwd": str(self.repo), "transcript_path": str(self.transcript)})
        with mock.patch.object(ah, "_scan_mistakes", lambda msgs: seen.append([m["text"] for m in msgs]) or real(msgs)), \
             mock.patch.object(sys, "stdin", io.StringIO(payload)), redirect_stdout(io.StringIO()):
            ah.main()
        return seen[0] if seen else None

    def test_old_admission_is_not_rescanned_on_the_next_stop(self):
        admission = "I made a mistake in the merge step there."
        self.write([user("fix it"), say(admission), tool("Write", {"file_path": "/r/x.py"}, "w1"), result("w1", "ok")])
        self.assertIn(admission, self.run_main())
        with open(self.transcript, "a", encoding="utf-8") as f:
            for e in (user("next"), tool("Write", {"file_path": "/r/y.py"}, "w2"), result("w2", "ok"), say("done")):
                f.write(json.dumps(e) + "\n")
        self.assertEqual(self.run_main(), ["next", "done"])

    def test_control_without_watermark_the_admission_is_seen_again(self):
        # Proves the test above can fail: drop the watermark and the old admission is back.
        admission = "I made a mistake in the merge step there."
        self.write([user("fix it"), say(admission), tool("Write", {"file_path": "/r/x.py"}, "w1"), result("w1", "ok")])
        self.run_main()
        ah._watermark_path(str(self.repo)).unlink()
        self.assertIn(admission, self.run_main())


class WroteThisTurn(Base):
    BIG = "x" * (300 << 10)          # 300 KB tool output, so a few of them pass the 1 MB window

    def big_outputs(self, n, start=0):
        out = []
        for i in range(start, start + n):
            out += [tool("Bash", {"command": "cat big.log"}, f"b{i}"), result(f"b{i}", self.BIG)]
        return out

    def test_write_after_last_user_message(self):
        self.write([user("go"), tool("Edit", {"file_path": "/r/a.py"}, "e1"), result("e1", "ok")])
        self.assertTrue(ah._wrote_this_turn(str(self.transcript)))

    def test_write_in_an_earlier_turn_does_not_count(self):
        self.write([user("go"), tool("Edit", {"file_path": "/r/a.py"}, "e1"), result("e1", "ok"),
                    user("now just look"), tool("Read", {"file_path": "/r/a.py"}, "r1"), result("r1", "x")])
        self.assertFalse(ah._wrote_this_turn(str(self.transcript)))

    def test_turn_start_beyond_first_window_is_found(self):
        # The write sits before 1.5 MB of read-only output, so the window has to grow.
        self.write([user("go"), tool("Write", {"file_path": "/r/a.py"}, "w1"), result("w1", "ok"),
                    *self.big_outputs(5)])
        self.assertGreater(self.transcript.stat().st_size, 1 << 20)
        self.assertTrue(ah._wrote_this_turn(str(self.transcript)))

    def test_control_read_only_long_turn_is_false(self):
        # Same shape without the write: must be False, so the test above is not passing by default.
        self.write([user("go"), tool("Edit", {"file_path": "/r/a.py"}, "e0"), result("e0", "ok"),
                    user("look only"), *self.big_outputs(5)])
        self.assertFalse(ah._wrote_this_turn(str(self.transcript)))

    def test_skill_text_counts_as_turn_start_like_before(self):
        # The old body treated any user text block (isMeta included) as the boundary; kept as is.
        self.write([user("go"), tool("Edit", {"file_path": "/r/a.py"}, "e1"), result("e1", "ok"),
                    meta("Base directory for this skill: C:/s/x")])
        self.assertFalse(ah._wrote_this_turn(str(self.transcript)))

    def test_missing_transcript_is_true(self):
        self.assertTrue(ah._wrote_this_turn(str(self.transcript) + ".missing"))


if __name__ == "__main__":
    unittest.main()
