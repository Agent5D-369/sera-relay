import tkinter as tk
from tkinter import ttk
import unittest
from auto_app import AutoApp


class SeraWindowTests(unittest.TestCase):
    def test_click_opens_form_and_restores_existing_minimized_form(self):
        root = tk.Tk()
        root.withdraw()
        app = AutoApp.__new__(AutoApp)
        app.root = root
        app.sera_window = None
        try:
            app.connect_sera()
            root.update()
            window = app.sera_window
            entries = [child for child in window.winfo_children()[0].winfo_children() if isinstance(child, ttk.Entry)]
            self.assertEqual(len(entries), 2)
            self.assertEqual(entries[1].cget('show'), '*')
            self.assertEqual(window.state(), 'normal')
            self.assertTrue(window.attributes('-topmost'))
            self.assertIsNotNone(window.focus_displayof())
            window.iconify()
            root.update()
            self.assertEqual(window.state(), 'iconic')
            app.connect_sera()
            root.update()
            self.assertIs(app.sera_window, window)
            self.assertEqual(window.state(), 'normal')
            self.assertTrue(window.attributes('-topmost'))
        finally:
            root.destroy()


if __name__ == '__main__':
    unittest.main()
