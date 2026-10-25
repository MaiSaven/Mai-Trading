import os
import sys
import subprocess

def create_desktop_shortcut():
    desktop_folder = os.path.join(os.environ["USERPROFILE"], "Desktop")
    # Also check OneDrive desktop if present
    onedrive_desktop = os.path.join(os.environ.get("OneDrive", ""), "Desktop")
    if os.path.exists(onedrive_desktop):
        desktop_folder = onedrive_desktop

    project_dir = os.path.dirname(os.path.abspath(__file__))
    launcher_script = os.path.join(project_dir, "launcher.py")

    # Use pythonw.exe so no black command prompt window appears
    python_dir = os.path.dirname(sys.executable)
    pythonw_path = os.path.join(python_dir, "pythonw.exe")
    if not os.path.exists(pythonw_path):
        pythonw_path = sys.executable

    shortcut_path = os.path.join(desktop_folder, "MAI Trading.lnk")

    ps_script = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{pythonw_path}"
$Shortcut.Arguments = '"{launcher_script}"'
$Shortcut.WorkingDirectory = "{project_dir}"
$Shortcut.Description = "MAI Trading Journal & Analytics Platform"
$Shortcut.Save()
"""
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], check=True)
    print(f"Successfully created Desktop shortcut at:\n  {shortcut_path}")

if __name__ == "__main__":
    create_desktop_shortcut()
