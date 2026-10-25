#!/usr/bin/env python3
"""
MAI TRADING - One-Click Application Launcher & Control Center
Launches Backend (FastAPI), MT5 Connector (Sync Worker), and Frontend (Vite React),
and automatically opens the dashboard in your default browser.
"""

import os
import sys
import time
import shutil
import socket
import threading
import subprocess
import webbrowser
from queue import Queue, Empty
import customtkinter as ctk

# Base project directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
MT5_DIR = os.path.join(BASE_DIR, "mt5-connector")

# ---------------------------------------------------------------------------
# Configuration Helpers (reads ports/URLs from .env files)
# ---------------------------------------------------------------------------
def read_env_var(file_path, key, default):
    """Safely extracts a key from a .env file."""
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    if k.strip() == key:
                        return v.strip().strip("\"'")
        except Exception:
            pass
    return default

BACKEND_PORT = int(read_env_var(os.path.join(BACKEND_DIR, ".env"), "PORT", "8000"))
FRONTEND_PORT = int(read_env_var(os.path.join(FRONTEND_DIR, ".env"), "VITE_PORT", "5173"))
BACKEND_URL = f"http://localhost:{BACKEND_PORT}"
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"

def is_port_open(port, host="127.0.0.1"):
    """Check if a local port is actively accepting TCP connections."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            return s.connect_ex((host, port)) == 0
    except Exception:
        return False

def kill_proc_tree(proc):
    """Terminates a process and all its children cleanly on Windows."""
    if not proc or proc.poll() is not None:
        return
    try:
        # Use Windows taskkill to force-kill the whole child process tree
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False
        )
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass

# ---------------------------------------------------------------------------
# Main Launcher GUI
# ---------------------------------------------------------------------------
class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("MAI TRADING - One-Click Control Center")
        self.geometry("980x740")
        self.minsize(840, 600)

        # Set modern dark theme
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # Process references
        self.procs = {
            "backend": None,
            "mt5": None,
            "frontend": None
        }
        self.log_queue = Queue()
        self.active_tab = "all"
        self.is_all_running = False

        # Build UI layout
        self._build_header()
        self._build_services_grid()
        self._build_console()
        self._build_footer()

        # Handle clean exit
        self.protocol("WM_DELETE_WINDOW", self.on_close)

        # Start background polling timer
        self.after(100, self._process_log_queue)
        self.after(1000, self._update_statuses)

    # -----------------------------------------------------------------------
    # UI Components
    # -----------------------------------------------------------------------
    def _build_header(self):
        header_frame = ctk.CTkFrame(self, corner_radius=12, fg_color="#181B22")
        header_frame.pack(fill="x", padx=16, pady=(16, 10))

        # Title block
        title_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        title_box.pack(side="left", padx=18, pady=14)

        title_lbl = ctk.CTkLabel(
            title_box,
            text="⚡ MAI TRADING",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color="#6366F1"
        )
        title_lbl.pack(anchor="w")

        subtitle_lbl = ctk.CTkLabel(
            title_box,
            text="Automated MT5 Trading Journal, Analytics & Reflection System",
            font=ctk.CTkFont(size=12),
            text_color="#94A3B8"
        )
        subtitle_lbl.pack(anchor="w")

        # Master Actions on right
        btn_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        btn_box.pack(side="right", padx=18, pady=14)

        self.auto_open_var = ctk.BooleanVar(value=True)
        self.auto_open_cb = ctk.CTkCheckBox(
            btn_box,
            text="Open browser automatically",
            variable=self.auto_open_var,
            font=ctk.CTkFont(size=12),
            text_color="#CBD5E1",
            fg_color="#6366F1",
            hover_color="#4F46E5"
        )
        self.auto_open_cb.pack(side="left", padx=(0, 16))

        self.master_btn = ctk.CTkButton(
            btn_box,
            text="🚀 START ALL & OPEN WEB",
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#10B981",
            hover_color="#059669",
            height=40,
            corner_radius=8,
            command=self.toggle_all
        )
        self.master_btn.pack(side="left", padx=4)

        self.restart_all_btn = ctk.CTkButton(
            btn_box,
            text="🔄 Restart All",
            font=ctk.CTkFont(size=12),
            fg_color="#334155",
            hover_color="#475569",
            height=40,
            width=100,
            corner_radius=8,
            command=self.restart_all
        )
        self.restart_all_btn.pack(side="left", padx=4)

    def _build_services_grid(self):
        grid_frame = ctk.CTkFrame(self, fg_color="transparent")
        grid_frame.pack(fill="x", padx=16, pady=4)

        # 3 Cards: Backend, MT5 Sync, Frontend
        self.cards = {}
        services = [
            ("backend", "🌐 Backend API", f"Port {BACKEND_PORT}", BACKEND_URL, self.toggle_backend),
            ("mt5", "⚡ MT5 Sync Worker", "Live Terminal Bridge", None, self.toggle_mt5),
            ("frontend", "💻 React Dashboard", f"Port {FRONTEND_PORT}", FRONTEND_URL, self.toggle_frontend)
        ]

        for idx, (svc_id, name, desc, url, toggle_fn) in enumerate(services):
            card = ctk.CTkFrame(grid_frame, corner_radius=10, fg_color="#1E232E")
            card.pack(side="left", fill="both", expand=True, padx=4 if idx == 1 else (0 if idx == 0 else 0))
            if idx == 2:
                card.pack_configure(padx=(4, 0))
            elif idx == 0:
                card.pack_configure(padx=(0, 4))

            # Header inside card
            head_box = ctk.CTkFrame(card, fg_color="transparent")
            head_box.pack(fill="x", padx=12, pady=(10, 4))

            name_lbl = ctk.CTkLabel(
                head_box,
                text=name,
                font=ctk.CTkFont(size=14, weight="bold"),
                text_color="#F8FAFC"
            )
            name_lbl.pack(side="left")

            status_badge = ctk.CTkLabel(
                head_box,
                text="● STOPPED",
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color="#EF4444"
            )
            status_badge.pack(side="right")

            desc_lbl = ctk.CTkLabel(
                card,
                text=desc,
                font=ctk.CTkFont(size=12),
                text_color="#94A3B8"
            )
            desc_lbl.pack(anchor="w", padx=12, pady=(0, 10))

            # Buttons inside card
            btn_row = ctk.CTkFrame(card, fg_color="transparent")
            btn_row.pack(fill="x", padx=12, pady=(0, 10))

            toggle_btn = ctk.CTkButton(
                btn_row,
                text="Start",
                font=ctk.CTkFont(size=12, weight="bold"),
                fg_color="#3B82F6",
                hover_color="#2563EB",
                height=28,
                corner_radius=6,
                command=toggle_fn
            )
            toggle_btn.pack(side="left", fill="x", expand=True, padx=(0, 4))

            if url:
                link_btn = ctk.CTkButton(
                    btn_row,
                    text="Open",
                    font=ctk.CTkFont(size=12),
                    fg_color="#334155",
                    hover_color="#475569",
                    width=60,
                    height=28,
                    corner_radius=6,
                    command=lambda u=url: webbrowser.open(u)
                )
                link_btn.pack(side="right")

            self.cards[svc_id] = {
                "badge": status_badge,
                "btn": toggle_btn,
                "desc": desc_lbl
            }

    def _build_console(self):
        console_frame = ctk.CTkFrame(self, corner_radius=10, fg_color="#181B22")
        console_frame.pack(fill="both", expand=True, padx=16, pady=(10, 6))

        # Top bar of console
        top_bar = ctk.CTkFrame(console_frame, fg_color="transparent")
        top_bar.pack(fill="x", padx=12, pady=(10, 6))

        lbl = ctk.CTkLabel(
            top_bar,
            text="Live Output Console",
            font=ctk.CTkFont(size=13, weight="bold"),
            text_color="#CBD5E1"
        )
        lbl.pack(side="left")

        # Tabs for filtering logs
        tab_box = ctk.CTkFrame(top_bar, fg_color="transparent")
        tab_box.pack(side="left", padx=16)

        self.tab_btns = {}
        for tab_id, tab_label in [("all", "All Logs"), ("backend", "Backend"), ("mt5", "MT5 Sync"), ("frontend", "Frontend")]:
            t_btn = ctk.CTkButton(
                tab_box,
                text=tab_label,
                font=ctk.CTkFont(size=11),
                width=76,
                height=24,
                corner_radius=5,
                fg_color="#6366F1" if tab_id == "all" else "#272A34",
                hover_color="#4F46E5",
                command=lambda tid=tab_id: self._select_tab(tid)
            )
            t_btn.pack(side="left", padx=2)
            self.tab_btns[tab_id] = t_btn

        # Clear button
        clear_btn = ctk.CTkButton(
            top_bar,
            text="Clear Logs",
            font=ctk.CTkFont(size=11),
            width=80,
            height=24,
            corner_radius=5,
            fg_color="#272A34",
            hover_color="#334155",
            command=self._clear_logs
        )
        clear_btn.pack(side="right", padx=2)

        self.autoscroll_var = ctk.BooleanVar(value=True)
        autoscroll_cb = ctk.CTkCheckBox(
            top_bar,
            text="Auto-scroll",
            variable=self.autoscroll_var,
            font=ctk.CTkFont(size=11),
            text_color="#94A3B8",
            width=90,
            height=24,
            checkbox_width=16,
            checkbox_height=16
        )
        autoscroll_cb.pack(side="right", padx=6)

        # Monospace Text Box
        self.log_textbox = ctk.CTkTextbox(
            console_frame,
            font=ctk.CTkFont(family="Consolas", size=11),
            fg_color="#0F1218",
            text_color="#E2E8F0",
            wrap="none"
        )
        self.log_textbox.pack(fill="both", expand=True, padx=12, pady=(0, 10))

        # Store raw logs with tag for filtering
        self.raw_logs = []

    def _build_footer(self):
        footer = ctk.CTkFrame(self, fg_color="transparent")
        footer.pack(fill="x", padx=16, pady=(0, 12))

        # Quick Links
        link1 = ctk.CTkButton(
            footer,
            text="🌐 Open Dashboard",
            font=ctk.CTkFont(size=11),
            fg_color="#272A34",
            hover_color="#334155",
            height=28,
            command=lambda: webbrowser.open(FRONTEND_URL)
        )
        link1.pack(side="left", padx=2)

        link2 = ctk.CTkButton(
            footer,
            text="📚 API Swagger Docs",
            font=ctk.CTkFont(size=11),
            fg_color="#272A34",
            hover_color="#334155",
            height=28,
            command=lambda: webbrowser.open(f"{BACKEND_URL}/docs")
        )
        link2.pack(side="left", padx=2)

        link3 = ctk.CTkButton(
            footer,
            text="📁 Project Folder",
            font=ctk.CTkFont(size=11),
            fg_color="#272A34",
            hover_color="#334155",
            height=28,
            command=lambda: os.startfile(BASE_DIR)
        )
        link3.pack(side="left", padx=2)

        # Footer Status Label
        self.footer_status = ctk.CTkLabel(
            footer,
            text="Ready. Click 'START ALL & OPEN WEB' to launch the complete system.",
            font=ctk.CTkFont(size=11),
            text_color="#64748B"
        )
        self.footer_status.pack(side="right", padx=4)

    # -----------------------------------------------------------------------
    # Logging and Filtering
    # -----------------------------------------------------------------------
    def log(self, service, message):
        """Append log message to thread-safe queue."""
        timestamp = time.strftime("%H:%M:%S")
        entry = (timestamp, service, message)
        self.log_queue.put(entry)

    def _process_log_queue(self):
        """Drains the log queue and updates the visible textbox."""
        updated = False
        while True:
            try:
                item = self.log_queue.get_nowait()
                self.raw_logs.append(item)
                if len(self.raw_logs) > 3000:
                    self.raw_logs = self.raw_logs[-2000:]

                timestamp, svc, msg = item
                if self.active_tab in ("all", svc):
                    tag = svc.upper().ljust(8)
                    line = f"[{timestamp}] [{tag}] {msg}\n"
                    self.log_textbox.insert("end", line)
                    updated = True
            except Empty:
                break

        if updated and self.autoscroll_var.get():
            self.log_textbox.see("end")

        self.after(100, self._process_log_queue)

    def _select_tab(self, tab_id):
        self.active_tab = tab_id
        for tid, btn in self.tab_btns.items():
            btn.configure(fg_color="#6366F1" if tid == tab_id else "#272A34")

        # Re-render filtered logs
        self.log_textbox.delete("1.0", "end")
        for timestamp, svc, msg in self.raw_logs:
            if self.active_tab in ("all", svc):
                tag = svc.upper().ljust(8)
                self.log_textbox.insert("end", f"[{timestamp}] [{tag}] {msg}\n")
        if self.autoscroll_var.get():
            self.log_textbox.see("end")

    def _clear_logs(self):
        self.raw_logs.clear()
        self.log_textbox.delete("1.0", "end")

    # -----------------------------------------------------------------------
    # Process Management
    # -----------------------------------------------------------------------
    def _stream_output(self, proc, service_name):
        """Reads stdout & stderr lines and sends to log queue."""
        try:
            for line in iter(proc.stdout.readline, ""):
                if not line:
                    break
                line_str = line.strip()
                if line_str:
                    self.log(service_name, line_str)
        except Exception:
            pass
        finally:
            try:
                proc.stdout.close()
            except Exception:
                pass

    def start_backend(self):
        if self.is_running("backend"):
            return
        self.log("backend", "Starting Backend server on port " + str(BACKEND_PORT) + "...")
        cmd = [sys.executable, "main.py"]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=BACKEND_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace"
            )
            self.procs["backend"] = proc
            threading.Thread(target=self._stream_output, args=(proc, "backend"), daemon=True).start()
        except Exception as e:
            self.log("backend", f"[ERROR] Failed to start backend: {e}")

    def stop_backend(self):
        if self.procs["backend"]:
            self.log("backend", "Stopping backend server...")
            kill_proc_tree(self.procs["backend"])
            self.procs["backend"] = None

    def toggle_backend(self):
        if self.is_running("backend"):
            self.stop_backend()
        else:
            self.start_backend()

    def start_mt5(self):
        if self.is_running("mt5"):
            return
        self.log("mt5", "Starting MT5 Sync worker...")
        cmd = [sys.executable, "sync.py"]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=MT5_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace"
            )
            self.procs["mt5"] = proc
            threading.Thread(target=self._stream_output, args=(proc, "mt5"), daemon=True).start()
        except Exception as e:
            self.log("mt5", f"[ERROR] Failed to start MT5 worker: {e}")

    def stop_mt5(self):
        if self.procs["mt5"]:
            self.log("mt5", "Stopping MT5 Sync worker...")
            kill_proc_tree(self.procs["mt5"])
            self.procs["mt5"] = None

    def toggle_mt5(self):
        if self.is_running("mt5"):
            self.stop_mt5()
        else:
            self.start_mt5()

    def start_frontend(self):
        if self.is_running("frontend"):
            return
        self.log("frontend", f"Starting Vite dev server on port {FRONTEND_PORT}...")
        npm_bin = shutil.which("npm.cmd") or shutil.which("npm") or "npm.cmd"
        cmd = [npm_bin, "run", "dev"]
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=FRONTEND_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding="utf-8",
                errors="replace"
            )
            self.procs["frontend"] = proc
            threading.Thread(target=self._stream_output, args=(proc, "frontend"), daemon=True).start()
        except Exception as e:
            self.log("frontend", f"[ERROR] Failed to start frontend: {e}")

    def stop_frontend(self):
        if self.procs["frontend"]:
            self.log("frontend", "Stopping Vite dev server...")
            kill_proc_tree(self.procs["frontend"])
            self.procs["frontend"] = None

    def toggle_frontend(self):
        if self.is_running("frontend"):
            self.stop_frontend()
        else:
            self.start_frontend()

    def is_running(self, service_key):
        proc = self.procs.get(service_key)
        return proc is not None and proc.poll() is None

    # -----------------------------------------------------------------------
    # One-Click Master Controls
    # -----------------------------------------------------------------------
    def start_all(self):
        self.footer_status.configure(text="Starting all services...")
        self.log("system", ">>> Launching all services in sequence...")

        # 1. Start Backend
        self.start_backend()

        # 2. Start MT5 Sync Worker
        self.start_mt5()

        # 3. Start Frontend Dev Server
        self.start_frontend()

        # 4. Wait for ports and open browser in background thread
        if self.auto_open_var.get():
            threading.Thread(target=self._wait_and_open_browser, daemon=True).start()

        self.is_all_running = True
        self._update_master_btn()

    def stop_all(self):
        self.footer_status.configure(text="Stopping all services...")
        self.log("system", ">>> Stopping all services...")
        self.stop_frontend()
        self.stop_mt5()
        self.stop_backend()
        self.is_all_running = False
        self._update_master_btn()
        self.footer_status.configure(text="All services stopped.")

    def toggle_all(self):
        any_running = any(self.is_running(k) for k in self.procs)
        if any_running:
            self.stop_all()
        else:
            self.start_all()

    def restart_all(self):
        self.log("system", ">>> Restarting all services...")
        self.stop_all()
        self.after(1200, self.start_all)

    def _wait_and_open_browser(self):
        """Polls until frontend port is open, then opens the browser."""
        self.log("system", f"Waiting for frontend on {FRONTEND_URL}...")
        for _ in range(40):
            if is_port_open(FRONTEND_PORT):
                time.sleep(0.5)
                self.log("system", f"Frontend is UP! Opening {FRONTEND_URL} in your browser...")
                webbrowser.open(FRONTEND_URL)
                self.footer_status.configure(text=f"System live at {FRONTEND_URL}")
                return
            time.sleep(0.5)
        # Fallback if port check timed out
        self.log("system", f"Opening browser at {FRONTEND_URL}...")
        webbrowser.open(FRONTEND_URL)

    # -----------------------------------------------------------------------
    # Status Monitoring Loop
    # -----------------------------------------------------------------------
    def _update_statuses(self):
        for svc_id, card in self.cards.items():
            running = self.is_running(svc_id)
            if running:
                card["badge"].configure(text="● RUNNING", text_color="#10B981")
                card["btn"].configure(text="Stop", fg_color="#DC2626", hover_color="#B91C1C")
            else:
                card["badge"].configure(text="● STOPPED", text_color="#EF4444")
                card["btn"].configure(text="Start", fg_color="#3B82F6", hover_color="#2563EB")

        self._update_master_btn()
        self.after(1000, self._update_statuses)

    def _update_master_btn(self):
        any_running = any(self.is_running(k) for k in self.procs)
        if any_running:
            self.master_btn.configure(
                text="⏹ STOP ALL SERVICES",
                fg_color="#EF4444",
                hover_color="#DC2626"
            )
        else:
            self.master_btn.configure(
                text="🚀 START ALL & OPEN WEB",
                fg_color="#10B981",
                hover_color="#059669"
            )

    def on_close(self):
        """Clean shutdown when closing the window."""
        self.stop_all()
        self.destroy()

# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app = App()
    app.mainloop()
