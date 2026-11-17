import importlib.util
import unittest
from unittest.mock import patch

from src.common.paths import PROJECT_ROOT

spec = importlib.util.spec_from_file_location("mula_launcher", PROJECT_ROOT / "scripts/run.py")
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class LauncherTests(unittest.TestCase):
    def test_stopped_server_can_be_started(self):
        with patch.object(launcher, "responds", return_value=False):
            self.assertFalse(launcher.server_ready())

    def test_old_server_is_not_silently_reused(self):
        with patch.object(launcher, "responds", side_effect=[True, False]):
            with self.assertRaisesRegex(RuntimeError, "older or incompatible server"):
                launcher.server_ready()

    def test_current_server_is_reused_without_generating_audio(self):
        with patch.object(launcher, "responds", return_value=True) as responds:
            self.assertTrue(launcher.server_ready())
        self.assertEqual(responds.call_args_list[1].args, ("http://127.0.0.1:8000/api/speech",))
        self.assertEqual(responds.call_args_list[1].kwargs, {"statuses": (405,)})

    def test_server_without_memory_support_is_not_reused(self):
        with patch.object(launcher, "responds", side_effect=[True, True, False]):
            with self.assertRaisesRegex(RuntimeError, "does not have account memory support"):
                launcher.server_ready()

    def test_server_starts_before_hermes(self):
        # Hermes connects to the server's agent tools once at startup and gives up after three
        # failures, so the server must already be up when Hermes starts.
        started = []

        def launch(name, *args, **kwargs):
            started.append(name)
            if name == "Client":
                raise KeyboardInterrupt  # stop before the launcher's watch loop

        with patch.object(launcher, "launch", side_effect=launch), \
             patch.object(launcher, "ensure_database", side_effect=lambda url: started.append("Database")), \
             patch.object(launcher, "dotenv_values", return_value={"HERMES_API_KEY": "test-key"}), \
             patch.object(launcher.shutil, "which", return_value="/usr/bin/true"), \
             patch.object(launcher.Path, "exists", return_value=True), \
             patch("sys.argv", ["run.py", "--no-open"]):
            with self.assertRaises(KeyboardInterrupt):
                launcher.main()
        self.assertEqual(started, ["Ollama", "Database", "Server", "Hermes", "Client"])

    def test_server_without_forecasting_is_not_reused(self):
        with patch.object(launcher, "responds", side_effect=[True, True, True, True, False]):
            with self.assertRaisesRegex(RuntimeError, "agent settings and forecasting support"):
                launcher.server_ready()
