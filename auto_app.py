"""Automatically transcribe incoming WhatsApp voice notes in a local inbox."""
import ctypes
import datetime
import json
import os
from pathlib import Path
import queue
import shutil
import sys
import time
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, filedialog

import psutil
import qrcode
from PIL import ImageTk

from app import kernel32, user32
from engine import Transcriber
from inbox_store import Inbox
from sera_memory import SeraMemory

BASE = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
HOME = Path(os.environ["USERPROFILE"]) / ".whatsapp-transcriber"
TITLE = "Sera Relay"


class AutoApp:
    def __init__(self, root, home=HOME, inline=False):
        self.root = root
        self.inbox = Inbox(home)
        self.sera = SeraMemory(self.inbox)
        self.sera_window = None
        self.sera_active = set()
        self.inline = inline
        self.inline_sent = {}
        self.events = queue.Queue()
        self.closing = threading.Event()
        self.receiver = None
        self.last_receiver_error = None
        self.receiver_lock = threading.Lock()
        self.rows_by_id = {}
        self.qr_image = None
        self.model = None
        self.history_window = None
        self.history_chats = {}
        root.title(TITLE)
        root.geometry("850x670")
        root.minsize(690, 530)
        root.protocol("WM_DELETE_WINDOW", self.close)
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TFrame", background="#f4f7f5")
        style.configure("TLabel", background="#f4f7f5", foreground="#20372c", font=("Segoe UI", 10))
        style.configure("Title.TLabel", font=("Segoe UI", 20, "bold"))
        style.configure("TButton", padding=(12, 7), font=("Segoe UI", 10))
        style.configure("Treeview", rowheight=30, font=("Segoe UI", 10))
        frame = ttk.Frame(root, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Received voice notes", style="Title.TLabel").pack(anchor="w")
        ttk.Label(frame, text="Incoming voice notes become text automatically. Transcription stays local.").pack(anchor="w", pady=(4, 10))
        self.connection = tk.StringVar(value="Connecting to WhatsApp...")
        self.model_status = tk.StringVar(value="Loading the local speech model...")
        ttk.Label(frame, textvariable=self.connection, wraplength=800).pack(anchor="w")
        ttk.Label(frame, textvariable=self.model_status).pack(anchor="w", pady=(3, 8))
        self.qr_frame = ttk.Frame(frame)
        self.qr_label = ttk.Label(self.qr_frame)
        self.qr_label.pack(side="left", padx=(0, 18))
        ttk.Label(self.qr_frame, text="Link once from your phone:\n\nWhatsApp > Settings > Linked devices\n> Link a device\n\nScan this QR code.\nKeep this app open or minimized.\nYou can keep using WhatsApp Desktop.", wraplength=450).pack(side="left", anchor="center")
        self.list_frame = ttk.Frame(frame)
        self.list_frame.pack(fill="both", expand=True)
        self.list = ttk.Treeview(self.list_frame, columns=("sender", "chat", "time", "status"), show="headings", height=5)
        for key, label, width in [("sender", "From", 160), ("chat", "Chat", 210), ("time", "Received", 155), ("status", "Status", 110)]:
            self.list.heading(key, text=label)
            self.list.column(key, width=width, minwidth=80)
        self.list.pack(fill="both", expand=True)
        self.list.bind("<<TreeviewSelect>>", self.select)
        self.text = tk.Text(frame, wrap="word", font=("Segoe UI", 11), height=8, padx=12, pady=12,
                            relief="flat", fg="#20372c", bg="white")
        self.text.pack(fill="both", expand=True, pady=(12, 10))
        buttons = ttk.Frame(frame)
        buttons.pack(fill="x")
        self.copy_button = ttk.Button(buttons, text="Copy text", command=self.copy, state="disabled")
        self.copy_button.pack(side="left")
        self.save_button = ttk.Button(buttons, text="Save text", command=self.save, state="disabled")
        self.save_button.pack(side="left", padx=8)
        self.retry_button = ttk.Button(buttons, text="Retry", command=self.retry, state="disabled")
        self.retry_button.pack(side="left")
        self.history_button = ttk.Button(buttons, text="Older voice notes", command=self.open_history)
        self.history_button.pack(side="left", padx=8)
        self.reconnect_button = ttk.Button(buttons, text="Reconnect", command=self.reconnect)
        self.reconnect_button.pack(side="right")
        ttk.Label(frame, text="Closing exits the receiver. Minimize it to keep listening.").pack(anchor="w", pady=(10, 0))
        self.refresh()
        self.report("Connecting to WhatsApp...")
        self.poll_job = root.after(100, self.poll)
        threading.Thread(target=self.process_notes, daemon=True).start()
        threading.Thread(target=self.start_receiver, daemon=True).start()
        if inline:
            root.withdraw()

    def report(self, text):
        self.connection.set(text)
        # Diagnostic state excludes QR codes, session credentials, and message content.
        (self.inbox.home / "state.json").write_text(json.dumps({"connection": text, "model_ready": self.model is not None, "inline": self.inline}), encoding="utf-8")

    def start_receiver(self):
        with self.receiver_lock:
            if self.closing.is_set():
                return
            try:
                node = shutil.which("node")
                if not node:
                    raise RuntimeError("Node.js is unavailable. Restore it and select Reconnect.")
                env = dict(os.environ, WA_TRANSCRIBER_DATA=str(self.inbox.home))
                if self.inline:
                    env['WA_TRANSCRIBER_INLINE'] = '1'
                process = subprocess.Popen([node, str(BASE / "receiver" / "bridge.cjs")],
                    cwd=BASE / "receiver", env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW)
                self.receiver = process
                self.last_receiver_error = None
            except Exception as error:
                self.events.put({"type": "status", "status": str(error)})
                return
        diagnostics = []
        def read_errors():
            for line in process.stderr:
                diagnostics.append(line)
                if len(diagnostics) > 25:
                    diagnostics.pop(0)
        error_reader = threading.Thread(target=read_errors, daemon=True)
        error_reader.start()
        for line in process.stdout:
            try:
                event = json.loads(line)
                if isinstance(event, dict) and isinstance(event.get("type"), str):
                    self.events.put(event)
            except (ValueError, TypeError):
                continue
        process.wait()
        error_reader.join(timeout=1)
        self.events.put({"type": "receiver_exit", "process": process, "diagnostic": ''.join(diagnostics)[-3000:]})

    def command(self, value):
        with self.receiver_lock:
            if not self.receiver or self.receiver.poll() is not None:
                raise RuntimeError("WhatsApp is disconnected. Select Reconnect.")
            self.receiver.stdin.write(json.dumps(value) + "\n")
            self.receiver.stdin.flush()

    def inline_states(self, identifiers=None):
        if not self.inline:
            return
        rows = [self.inbox.get(identifier) for identifier in identifiers] if identifiers is not None else self.inbox.rows()
        entries = []
        for row in rows:
            if not row:
                continue
            entry = {key: row[key] for key in ('id', 'status', 'transcript', 'error')}
            entry['busy'] = row['id'] in getattr(self, 'sera_active', set())
            entry['reviewed'] = bool(row.get('reviewed_at'))
            if hasattr(self, 'sera'):
                entry['memory'] = self.sera.state(row['id'])
            if identifiers is not None or self.inline_sent.get(row['id']) != entry:
                entries.append(entry)
                self.inline_sent[row['id']] = entry
        if entries:
            try:
                self.command({'type': 'inline_states', 'entries': entries})
            except Exception:
                self.inline_sent.clear()
        self.inline_summary()

    def inline_summary(self):
        pending = self.inbox.pending_review_count()
        if getattr(self, 'inline_pending_sent', None) == pending:
            return
        try:
            self.command({'type': 'inline_summary', 'pending': pending})
            self.inline_pending_sent = pending
        except Exception:
            self.inline_pending_sent = None

    def inline_request(self, identifier):
        row = self.inbox.get(identifier)
        if row and row['status'] in ('done', 'queued', 'processing', 'downloading'):
            self.inline_states([identifier])
            return
        if row and self.inbox.retry(identifier):
            self.inline_states([identifier])
            return
        self.command({'type': 'inline_download', 'id': identifier})

    def show_sera_window(self):
        window = self.sera_window
        window.deiconify()
        window.attributes('-topmost', True)
        window.lift()
        window.focus_force()
        # This separate app's credential dialog must remain above the browser while open.
        def activate():
            if window.winfo_exists():
                window.update_idletasks()
                user32.GetParent.argtypes = [ctypes.c_void_p]
                user32.GetParent.restype = ctypes.c_void_p
                user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
                user32.SetForegroundWindow(user32.GetParent(window.winfo_id()))
                window.focus_force()
        activate()
        window.after(150, activate)

    def connect_sera(self):
        if self.sera_window and self.sera_window.winfo_exists():
            self.show_sera_window()
            return
        window = self.sera_window = tk.Toplevel(self.root)
        window.title('Connect Sera')
        window.geometry('650x340')
        frame = ttk.Frame(window, padding=20)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='Amora MCP URL').pack(anchor='w')
        endpoint = ttk.Entry(frame)
        endpoint.pack(fill='x', pady=(4, 12))
        endpoint.insert(0, '')
        ttk.Label(frame, text='Bearer token with document-write access (full scope)').pack(anchor='w')
        token = ttk.Entry(frame, show='*')
        token.pack(fill='x', pady=(4, 12))
        ttk.Label(frame, text='Stored encrypted for your Windows account. The token stays outside WhatsApp.\nSend to Sera uploads only the selected transcript and its sender, chat, date, and message ID.', wraplength=600).pack(anchor='w')
        status = tk.StringVar(value='Connection test reads connector metadata; it does not upload a transcript.')
        ttk.Label(frame, textvariable=status, wraplength=600).pack(anchor='w', pady=10)
        def save():
            url, secret = endpoint.get(), token.get()
            button.configure(state='disabled')
            status.set('Checking connection...')
            def check():
                try:
                    self.sera.configure(url, secret)
                    result = 'Connected. Use Send to Sera under a transcript.'
                    success = True
                except Exception as error:
                    result = str(error)
                    success = False
                self.events.put({'type': 'sera_configured', 'result': result, 'success': success})
            threading.Thread(target=check, daemon=True).start()
        button = ttk.Button(frame, text='Save and check connection', command=save)
        button.pack(anchor='w')
        self.sera_config_status, self.sera_config_button = status, button
        self.sera_token_entry = token
        self.show_sera_window()
        token.focus_set()

    def send_sera(self, identifier, action=None, values=None):
        if identifier in self.sera_active:
            return
        self.sera_active.add(identifier)
        self.inline_states([identifier])
        def send():
            try:
                changed = lambda: self.events.put({'type': 'sera_changed', 'id': identifier})
                if action:
                    self.sera.action(identifier, action, values or {}, changed)
                else:
                    self.sera.send(identifier, changed)
            except Exception as error:
                self.events.put({'type': 'sera_error', 'id': identifier, 'error': str(error)})
            finally:
                self.events.put({'type': 'sera_finished', 'id': identifier})
        threading.Thread(target=send, daemon=True).start()

    def stop_receiver(self):
        with self.receiver_lock:
            process = self.receiver
            self.receiver = None
        if not process or process.poll() is not None:
            return
        children = []
        try:
            children = psutil.Process(process.pid).children(recursive=True)
            process.stdin.write('{"type":"shutdown"}\n')
            process.stdin.flush()
            process.wait(timeout=9)
        except (OSError, subprocess.TimeoutExpired, psutil.NoSuchProcess):
            # Only processes belonging to this receiver are eligible for cleanup.
            for child in reversed(children):
                try:
                    child.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            if process.poll() is None:
                process.kill()
                process.wait(timeout=3)
        finally:
            process.stdin.close()
            process.stdout.close()
            process.stderr.close()

    def process_notes(self):
        try:
            self.model = Transcriber()
            self.events.put({"type": "model_ready"})
        except Exception as error:
            self.events.put({"type": "model_error", "error": str(error)})
            return
        while not self.closing.wait(0.3):
            row = self.inbox.claim()
            if not row:
                continue
            self.events.put({"type": "changed"})
            try:
                audio = Path(row["path"]).resolve()
                if audio.parent != self.inbox.spool or not audio.is_file():
                    raise RuntimeError("The downloaded voice note is missing. Select Retry to download it again.")
                self.inbox.complete(row["id"], self.model.transcribe(audio))
            except Exception as error:
                self.inbox.fail(row["id"], error)
            self.events.put({"type": "changed"})

    def refresh(self):
        selected = self.list.selection()
        rows = self.inbox.rows()
        self.rows_by_id = {row["id"]: row for row in rows}
        self.list.delete(*self.list.get_children())
        labels = {"downloading": "Downloading", "queued": "Waiting", "processing": "Transcribing", "done": "Ready", "failed": "Failed"}
        for row in rows:
            stamp = datetime.datetime.fromtimestamp(row["timestamp"]).strftime("%b %d %I:%M %p")
            self.list.insert("", "end", iid=row["id"], values=(row["sender"], row["chat"], stamp, labels[row["status"]]))
        chosen = selected[0] if selected and selected[0] in self.rows_by_id else (rows[0]["id"] if rows else None)
        if chosen:
            self.list.selection_set(chosen)
            self.select()

    def select(self, event=None):
        selected = self.list.selection()
        if not selected:
            return
        row = self.rows_by_id[selected[0]]
        self.text.delete("1.0", "end")
        self.text.insert("1.0", row["transcript"] if row["status"] == "done" else row["error"] or "Your voice note is being processed...")
        for button in (self.copy_button, self.save_button):
            button.configure(state="normal" if row["status"] == "done" else "disabled")
        self.retry_button.configure(state="normal" if row["status"] == "failed" else "disabled")

    def copy(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.text.get("1.0", "end-1c"))
        self.root.update_idletasks()

    def save(self):
        path = filedialog.asksaveasfilename(title="Save transcript", initialfile="Received voice note.txt",
                                          defaultextension=".txt", filetypes=[("Text", "*.txt")])
        if path:
            try:
                Path(path).write_text(self.text.get("1.0", "end-1c"), encoding="utf-8")
            except OSError:
                self.report("Could not save the text. Choose another destination.")

    def retry(self):
        selected = self.list.selection()
        if selected:
            identifier = selected[0]
            if not self.inbox.retry(identifier):
                try:
                    self.command({"type": "retry", "id": identifier})
                except Exception as error:
                    self.inbox.fail(identifier, error)
            self.refresh()

    def reconnect(self):
        self.reconnect_button.configure(state="disabled")
        self.report("Reconnecting to WhatsApp...")
        def restart():
            self.stop_receiver()
            if not self.closing.is_set():
                self.events.put({"type": "reconnecting"})
                self.start_receiver()
        threading.Thread(target=restart, daemon=True).start()

    def open_history(self):
        if self.history_window and self.history_window.winfo_exists():
            self.history_window.lift()
            return
        window = self.history_window = tk.Toplevel(self.root)
        window.title("Transcribe older voice notes")
        window.geometry("640x285")
        window.transient(self.root)
        frame = ttk.Frame(window, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="Choose the chat containing the received voice notes.").pack(anchor="w")
        self.chat_choice = ttk.Combobox(frame, state="readonly")
        self.chat_choice.pack(fill="x", pady=(8, 12))
        ttk.Label(frame, text="Search the most recent received messages:").pack(anchor="w")
        self.history_range = ttk.Combobox(frame, state="readonly", values=["200 messages", "1,000 messages", "5,000 messages"])
        self.history_range.current(0)
        self.history_range.pack(fill="x", pady=(6, 12))
        self.history_start = ttk.Button(frame, text="Transcribe received voice notes", command=self.load_history, state="disabled")
        self.history_start.pack(anchor="w")
        self.history_status = tk.StringVar(value="Loading chats...")
        ttk.Label(frame, textvariable=self.history_status, wraplength=600).pack(anchor="w", pady=(10, 0))
        try:
            self.command({"type": "history_chats"})
        except Exception as error:
            self.history_status.set(str(error))

    def load_history(self):
        chat = self.history_chats.get(self.chat_choice.get())
        if not chat:
            self.history_status.set("Select a chat first.")
            return
        limit = [200, 1000, 5000][self.history_range.current()]
        try:
            self.command({"type": "history_load", "chat": chat,
                          "limit": limit, "skip": self.inbox.handled_ids()})
            self.history_start.configure(state="disabled")
            self.history_status.set("Loading older voice notes...")
        except Exception as error:
            self.history_status.set(str(error))

    def history_event(self, event):
        if not self.history_window or not self.history_window.winfo_exists():
            return
        kind = event["type"]
        if kind == "history_chats":
            self.history_chats = {
                f"{index + 1}. {chat['name']}" + (" (group)" if chat.get('group') else ""): chat['id']
                for index, chat in enumerate(event['chats'])}
            self.chat_choice.configure(values=list(self.history_chats))
            if self.history_chats:
                self.chat_choice.current(0)
                self.history_start.configure(state="normal")
                self.history_status.set("Voice notes will appear in your inbox. Already processed notes are skipped.")
            else:
                self.history_status.set("No synced chats are available yet. Wait for WhatsApp to sync, then reopen this window.")
        elif kind == "history_progress":
            self.history_status.set(event['status'])
        elif kind == "history_done":
            self.history_start.configure(state="normal")
            self.history_status.set(f"Found {event['found']} voice notes in {event['scanned']} received messages. "
                                    f"{event['downloaded']} queued, {event['skipped']} already processed, {event['failed']} failed.")
        elif kind == "history_error":
            self.history_start.configure(state="normal" if self.history_chats else "disabled")
            self.history_status.set(event['error'])

    def poll(self):
        dirty = False
        while not self.events.empty():
            event = self.events.get_nowait()
            kind = event["type"]
            if kind == 'sera_connect':
                self.connect_sera()
            elif kind == 'sera_send':
                self.send_sera(event['id'])
            elif kind == 'sera_action':
                self.send_sera(event['id'], event['action'], event.get('values', {}))
            elif kind == 'sera_configured':
                if self.sera_window and self.sera_window.winfo_exists():
                    self.sera_config_status.set(event['result'])
                    self.sera_config_button.configure(state='normal')
                    if event.get('success'):
                        self.sera_token_entry.delete(0, 'end')
                self.inline_sent.clear()
                self.inline_states()
            elif kind in ('sera_changed', 'sera_finished', 'sera_error'):
                if kind == 'sera_finished':
                    self.sera_active.discard(event['id'])
                self.inline_states([event['id']])
                if kind == 'sera_error':
                    row = self.inbox.get(event['id'])
                    if row:
                        entry = {key: row[key] for key in ('id', 'status', 'transcript', 'error')}
                        entry['reviewed'] = bool(row.get('reviewed_at'))
                        entry['memory'] = dict(self.sera.state(event['id']), error=event['error'])
                        try:
                            self.command({'type': 'inline_states', 'entries': [entry]})
                        except Exception:
                            pass
            elif kind == 'inline_reviewed':
                self.inbox.set_reviewed(event['id'], bool(event.get('reviewed')))
                self.inline_states([event['id']])
            elif kind == 'inline_lookup':
                self.inline_states(event['ids'])
            elif kind == 'inline_request':
                try:
                    self.inline_request(event['id'])
                except Exception:
                    self.inbox.fail(event['id'], 'Could not download this voice note. Try again.')
                    self.inline_states([event['id']])
            elif kind == 'window_closed':
                self.close()
            elif kind.startswith("history_"):
                self.history_event(event)
            elif kind in {"incoming", "media", "download_error"}:
                try:
                    self.inbox.ingest(event)
                    dirty = True
                except Exception:
                    self.report("A received voice note could not be queued. Reconnect and try again.")
            elif kind == "qr":
                self.report("Scan the QR code with WhatsApp on your phone.")
                image = qrcode.make(event["qr"]).get_image()
                image.thumbnail((265, 265))
                self.qr_image = ImageTk.PhotoImage(image)
                self.qr_label.configure(image=self.qr_image)
                self.qr_frame.pack(before=self.list_frame, fill="x", pady=10)
                self.reconnect_button.configure(state="normal")
            elif kind == "ready":
                self.inline_sent.clear()
                self.last_receiver_error = None
                self.qr_frame.pack_forget()
                self.qr_label.configure(image="")
                self.qr_image = None
                self.report("Connected. Listening for new received voice notes.")
                self.reconnect_button.configure(state="normal")
                self.inline_states()
                for row in self.inbox.rows():
                    if row['status'] == 'failed' and row['error'].startswith('Voice note download failed.'):
                        try:
                            self.command({'type': 'retry', 'id': row['id']})
                        except Exception:
                            break
            elif kind == "status":
                self.report(event["status"])
                if event.get("detail"):
                    self.last_receiver_error = event["status"]
                    (self.inbox.home / 'receiver-error.txt').write_text(event['detail'], encoding='utf-8')
                self.reconnect_button.configure(state="normal")
            elif kind == "model_ready":
                self.model_status.set("Local speech model ready. Language is detected automatically.")
                self.report(self.connection.get())
            elif kind == "model_error":
                self.model_status.set(event["error"])
                if self.inline:
                    self.root.deiconify()
            elif kind == "changed":
                dirty = True
            elif kind == "receiver_exit" and event["process"] is self.receiver:
                if event.get('diagnostic'):
                    (self.inbox.home / 'receiver-error.txt').write_text(event['diagnostic'], encoding='utf-8')
                self.report(self.last_receiver_error or "Receiver stopped. Select Reconnect.")
                self.reconnect_button.configure(state="normal")
                if self.inline and not self.closing.is_set():
                    self.root.deiconify()
            elif kind == "reconnecting":
                self.reconnect_button.configure(state="normal")
            elif kind == "closed":
                self.root.after_cancel(self.poll_job)
                self.root.destroy()
                return
        if dirty:
            self.refresh()
            self.inline_states()
        self.poll_job = self.root.after(100, self.poll)

    def close(self):
        if self.closing.is_set():
            return
        self.closing.set()
        self.root.withdraw()
        def stop():
            self.stop_receiver()
            self.events.put({"type": "closed"})
        threading.Thread(target=stop, daemon=True).start()


def main():
    inline = '--inline' in sys.argv
    mutex = kernel32.CreateMutexW(None, False, "Local\\WhatsAppAutoTranscriber-2026")
    if ctypes.get_last_error() == 183:
        user32.FindWindowW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p]
        user32.FindWindowW.restype = ctypes.c_void_p
        user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
        user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
        window = user32.FindWindowW(None, TITLE)
        if inline and window:
            try:
                state = json.loads((HOME / 'state.json').read_text(encoding='utf-8'))
                if state.get('inline') and state['connection'].startswith('Connected'):
                    subprocess.Popen([shutil.which('node'), str(BASE / 'receiver/focus.cjs'), str(HOME)],
                                     creationflags=subprocess.CREATE_NO_WINDOW)
                    kernel32.CloseHandle(mutex)
                    return
            except (OSError, ValueError, KeyError, TypeError):
                pass
            kernel32.CloseHandle(mutex)
            user32.PostMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
            user32.PostMessageW(window, 0x0010, 0, 0)
            deadline = time.monotonic() + 20
            while user32.FindWindowW(None, TITLE) and time.monotonic() < deadline:
                time.sleep(.2)
            mutex = kernel32.CreateMutexW(None, False, "Local\\WhatsAppAutoTranscriber-2026")
            if ctypes.get_last_error() == 183:
                kernel32.CloseHandle(mutex)
                return
        else:
            if window:
                user32.ShowWindow(window, 9)
                user32.SetForegroundWindow(window)
            kernel32.CloseHandle(mutex)
            return
    root = tk.Tk()
    application = AutoApp(root, inline=inline)
    try:
        root.mainloop()
    finally:
        application.closing.set()
        kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
