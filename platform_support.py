"""What differs between Windows and macOS, kept in one place."""
import ctypes
import os
from pathlib import Path
import subprocess
import sys

VERSION = '2.2.0-beta.1'
IS_WINDOWS = sys.platform == 'win32'
IS_MAC = sys.platform == 'darwin'
NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
HOME = Path.home() / '.whatsapp-transcriber'
UI_FONT = 'Segoe UI' if IS_WINDOWS else 'Helvetica Neue' if IS_MAC else 'TkDefaultFont'
CREDENTIAL_NOTE = ('Stored encrypted for your Windows account.' if IS_WINDOWS else
                   'Stored in your macOS Keychain.' if IS_MAC else 'Stored for your account.')
KEYCHAIN_SERVICE = 'Sera Relay'
KEYCHAIN_ACCOUNT = 'sera-credential'
KEYCHAIN_MARKER = b'macos-keychain:v1'


class CredentialError(RuntimeError):
    pass


def app_base():
    """Folder that holds the receiver scripts and assets."""
    if not getattr(sys, 'frozen', False):
        return Path(__file__).resolve().parent
    executable = Path(sys.executable).resolve()
    if IS_MAC:
        # Sera Relay.app/Contents/MacOS/SeraRelay -> Sera Relay.app/Contents/Resources
        return executable.parent.parent / 'Resources'
    return executable.parent


def protect(data, decrypt=False, service=None):
    """Encrypt a secret for this user account. On macOS the secret lives in the Keychain."""
    if IS_WINDOWS:
        return _dpapi(data, decrypt)
    if IS_MAC:
        return _keychain(data, decrypt, service or KEYCHAIN_SERVICE)
    raise CredentialError('Saving the Sera credential is supported on Windows and macOS.')


def _dpapi(data, decrypt):
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    target = Blob()
    function = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target)):
        raise CredentialError('Windows could not unlock the Sera credential. Connect Sera again.')
    try:
        return ctypes.string_at(target.data, target.size)
    finally:
        ctypes.windll.kernel32.LocalFree(target.data)


def _keychain(data, decrypt, service):
    if decrypt:
        if data != KEYCHAIN_MARKER:
            raise CredentialError('Connect Sera again to restore the local credential.')
        found = subprocess.run(['security', 'find-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT, '-w'],
                               capture_output=True, timeout=60)
        if found.returncode:
            raise CredentialError('macOS could not unlock the Sera credential. Connect Sera again.')
        return bytes.fromhex(found.stdout.decode().strip())
    # Interactive mode reads the command from stdin, so the secret never appears in a process listing.
    # Hex keeps any token character from breaking the command line.
    command = f'add-generic-password -U -s "{service}" -a "{KEYCHAIN_ACCOUNT}" -w {data.hex()}\n'
    subprocess.run(['security', '-i'], input=command.encode(), capture_output=True, timeout=60)
    if _keychain(KEYCHAIN_MARKER, True, service) != data:
        raise CredentialError('macOS could not save the Sera credential in the Keychain.')
    return KEYCHAIN_MARKER


def forget_keychain(service):
    if IS_MAC:
        subprocess.run(['security', 'delete-generic-password', '-s', service, '-a', KEYCHAIN_ACCOUNT],
                       capture_output=True, timeout=60)


class SingleInstance:
    """Holds a per-user lock while the app runs. acquired is False when another copy owns it."""

    def __init__(self, home=HOME):
        self.handle = None
        if IS_WINDOWS:
            from app import kernel32
            self.handle = kernel32.CreateMutexW(None, False, 'Local\\WhatsAppAutoTranscriber-2026')
            self.acquired = ctypes.get_last_error() != 183
            if not self.acquired:
                self.release()
        else:
            import fcntl
            home.mkdir(parents=True, exist_ok=True)
            self.handle = open(home / 'app.lock', 'w')
            try:
                fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.acquired = True
            except OSError:
                self.acquired = False
                self.release()

    def release(self):
        if self.handle is None:
            return
        if IS_WINDOWS:
            from app import kernel32
            kernel32.CloseHandle(self.handle)
        else:
            self.handle.close()
        self.handle = None
