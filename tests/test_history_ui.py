from pathlib import Path
import sys
import tempfile
import time
import tkinter as tk
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from auto_app import AutoApp


class HistoryUiTests(unittest.TestCase):
    def test_chat_selection_and_range_issue_selected_history_command(self):
        with tempfile.TemporaryDirectory() as folder:
            root = tk.Tk()
            root.withdraw()
            commands = []
            with patch.object(AutoApp, 'start_receiver', lambda self: None), \
                 patch.object(AutoApp, 'process_notes', lambda self: None), \
                 patch.object(AutoApp, 'command', lambda self, command: commands.append(command)):
                app = AutoApp(root, Path(folder))
                app.open_history()
                self.assertEqual(commands[-1]['type'], 'history_chats')
                app.history_event({'type': 'history_chats', 'chats': [
                    {'id': 'first-chat', 'name': 'First person'}, {'id': 'selected-chat', 'name': 'Chosen group', 'group': True}]})
                app.chat_choice.current(1)
                app.history_range.current(1)
                app.load_history()
                self.assertEqual(commands[-1], {'type': 'history_load', 'chat': 'selected-chat', 'limit': 1000, 'skip': []})
                self.assertEqual(str(app.history_start['state']), 'disabled')
                app.history_event({'type': 'history_done', 'scanned': 1000, 'found': 3, 'downloaded': 2, 'skipped': 1, 'failed': 0})
                self.assertIn('2 queued', app.history_status.get())
                self.assertEqual(str(app.history_start['state']), 'normal')
                app.close()
                end = time.monotonic()+1
                while time.monotonic()<end:
                    try:
                        root.update()
                    except tk.TclError:
                        break
                    time.sleep(.02)
