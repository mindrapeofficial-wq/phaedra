"""Ensure the Ardour engine ABI version stays independent of Phaedra tags.

Waf's historical parser accepts MAJOR.MINOR[-MICRO]. Phaedra's packaging
provides MAJOR.MINOR.MICRO, so the conversion must preserve all three.
"""
import ast
import os
from pathlib import Path
import re
import subprocess
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]


def load_set_version():
    source = (ROOT / "wscript").read_text(encoding="utf-8")
    module = ast.parse(source, filename="wscript")
    function = next(node for node in module.body
                    if isinstance(node, ast.FunctionDef) and node.name == "set_version")
    globals_ = {"os": os, "re": re, "subprocess": subprocess}
    exec(compile(ast.Module(body=[function], type_ignores=[]), "wscript", "exec"), globals_)
    return globals_


class EngineVersionTests(unittest.TestCase):
    def test_engine_8120_has_numeric_minor_and_correct_abi(self):
        ns = load_set_version()
        with patch.dict(os.environ, {"PHAEDRA_ENGINE_VERSION": "8.12.0"}), \
             patch("os.path.isdir", return_value=True), \
             patch("subprocess.check_output", return_value="2026-10-25"):
            ns["set_version"]()
        self.assertEqual(ns["MAJOR"], "8")
        self.assertEqual(ns["MINOR"], "12")
        self.assertEqual(ns["MICRO"], "0")
        self.assertEqual(ns["VERSION"], "8.12.0")
        self.assertEqual(ns["PROGRAM_VERSION"], "8")
        self.assertEqual(ns["rev_date"], "2026-10-25")

    def test_invalid_engine_version_is_rejected(self):
        ns = load_set_version()
        with patch.dict(os.environ, {"PHAEDRA_ENGINE_VERSION": "v1.0.0"}):
            with self.assertRaisesRegex(ValueError, "PHAEDRA_ENGINE_VERSION"):
                ns["set_version"]()


if __name__ == "__main__":
    unittest.main()
