import os
import subprocess
import json
import requests
import re
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from threading import Thread, Lock
import time
import shutil
import zipfile
import collections
import sys
try:
    import psutil
except ImportError:
    psutil = None

# --- Configuration ---
app = Flask(__name__)
CORS(app)

# --- Configuration Loading ---
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def load_config():
    """Loads the configuration from config.json."""
    if not os.path.exists(CONFIG_FILE):
        # Create a default config if it doesn't exist
        default_config = {'mc_servers_path': os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mc_servers')}
        save_config(default_config)
        return default_config
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading config file {CONFIG_FILE}: {e}. Using default.")
        return {'mc_servers_path': os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mc_servers')}

def save_config(config_data):
    """Saves the configuration to config.json."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_data, f, indent=4)

# Load config on startup
config = load_config()
SERVER_DIR = config['mc_servers_path']

# --- Global State ---
# This dictionary will hold the running server subprocesses
# In a production app, you'd use a more robust solution than a global dict
RUNNING_SERVERS = {} # { 'server_name': { 'process': Popen_object } }
RUNNING_SERVERS_LOCK = Lock()
INSTALLATION_LOGS = {} # { 'server_name': ['log line 1', 'log line 2'] }


# --- Supported Server Types ---
SUPPORTED_SERVER_TYPES = [
    "purpur", "paper", "fabric", "neoforge", 
    "quilt", "forge", "vanilla"
]


# --- Minecraft Version Info ---
# In a real app, this might come from an API or a config file
MINECRAFT_VERSIONS = {
    "1.20.4": "https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar",
    "1.19.4": "https://piston-data.mojang.com/v1/objects/8f3112a1049751cc472ec13e397e3cc5316b4a1f/server.jar",
    "1.18.2": "https://piston-data.mojang.com/v1/objects/c8f83c5655308435b3dcf03c06d9fe8740a77469/server.jar",
    "1.16.5": "https://piston-data.mojang.com/v1/objects/1b557e7b033b583cd9f66746b7a9ab1ec1673ced/server.jar"
}


# --- Helper Functions ---
def get_server_process_info(pid):
    """Gets CPU and Memory for a given PID, requires psutil."""
    if not psutil or not psutil.pid_exists(pid):
        return {'cpu_usage': 0, 'memory_usage': 0}
    try:
        proc = psutil.Process(pid)
        return {
            'cpu_usage': proc.cpu_percent(interval=0.1),
            'memory_usage': proc.memory_info().rss / (1024 * 1024)  # in MB
        }
    except psutil.NoSuchProcess:
        return {'cpu_usage': 0, 'memory_usage': 0}


# --- Server Management Logic ---

def get_screen_session_name(server_name):
    """Generates a consistent screen session name for a server."""
    return f"mc_{server_name}"

def is_server_running(server_name):
    """Check if a screen session for the server exists, using WSL if on Windows."""
    screen_session_name = get_screen_session_name(server_name)
    command = ['screen', '-ls']
    if sys.platform == "win32":
        command.insert(0, 'wsl')

    try:
        # We check if the session name exists in the output of screen -ls.
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
        # The server name in the list will be prepended by a pid and a dot, and followed by a tab.
        return f".{screen_session_name}\t" in result.stdout
    except FileNotFoundError:
        # This handles the case where 'wsl' or 'screen' is not installed.
        print("ERROR: The 'wsl' or 'screen' command was not found. Please ensure it is installed and in your system's PATH.")
        return False

def get_server_metadata(server_path):
    """Reads metadata from a .metadata file."""
    metadata = {'version': 'Unknown', 'server_type': 'Unknown'}
    meta_file = os.path.join(server_path, '.metadata')
    if os.path.exists(meta_file):
        with open(meta_file, 'r') as f:
            metadata = json.load(f)
    return metadata

def write_server_metadata(server_path, metadata):
    """Writes metadata to a .metadata file."""
    meta_file = os.path.join(server_path, '.metadata')
    with open(meta_file, 'w') as f:
        json.dump(metadata, f, indent=4)

def get_server_properties(server_path):
    """Reads the server port from server.properties file."""
    properties = {'port': '25565'}
    props_file = os.path.join(server_path, 'server.properties')
    if os.path.exists(props_file):
        with open(props_file, 'r') as f:
            for line in f:
                if line.strip().startswith('server-port='):
                    properties['port'] = line.strip().split('=')[1]
    return properties

def download_jar(url, path):
    """Downloads a file in a separate thread to not block the server."""
    def task():
        print(f"Starting download from {url} to {path}")
        try:
            with requests.get(url, stream=True) as r:
                r.raise_for_status()
                with open(path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            print(f"Finished download to {path}")
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error downloading {url}: {e}")
        except Exception as e:
            print(f"Error downloading {url}: {e}")
    Thread(target=task, daemon=True).start()


# --- API Endpoints ---

@app.route('/api/servers/<server_name>', methods=['GET'])
def get_server_details(server_name):
    """Gets all details for a single server."""
    # Basic sanitization for the server name itself
    if '..' in server_name or '/' in server_name or '\\' in server_name:
        return jsonify({"error": "Invalid server name format"}), 400

    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": f"Server '{server_name}' not found"}), 404

    properties = get_server_properties(server_path)
    metadata = get_server_metadata(server_path)
    details = {
        'id': server_name,
        'name': server_name,
        'version': metadata.get('version', 'N/A'),
        'port': properties.get('port'),
        'server_type': metadata.get('server_type', 'N/A'),
        'status': 'Running' if is_server_running(server_name) else 'Stopped',
        'eula_accepted': os.path.exists(os.path.join(server_path, 'eula.txt'))
    }
    return jsonify(details)



@app.route('/api/servers', methods=['GET', 'POST'])
def handle_servers():
    """Handles getting the server list and creating new servers."""
    if request.method == 'POST':
        data = request.get_json()
        server_name = data.get('server_name')
        version = data.get('version')
        port = data.get('port', 25565)
        eula_accepted = data.get('eula_accepted', False)
        server_type = data.get('server_type', 'vanilla').lower()

        if not all([server_name, version, eula_accepted, server_type]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        if server_type not in SUPPORTED_SERVER_TYPES:
            return jsonify({'error': f'Invalid server type: {server_type}'}), 400

        if not re.match("^[a-zA-Z0-9_-]+$", server_name):
            return jsonify({'error': 'Invalid server name format'}), 400

        if not eula_accepted:
            return jsonify({'error': 'EULA must be accepted'}), 400
        
        server_path = os.path.join(SERVER_DIR, server_name)
        if os.path.exists(server_path):
            return jsonify({'error': 'A server with this name already exists'}), 409

        try:
            os.makedirs(server_path)
            with open(os.path.join(server_path, 'eula.txt'), 'w') as f: f.write('eula=true\n')
            with open(os.path.join(server_path, 'server.properties'), 'w') as f: f.write(f'server-port={port}\nmotd=Powered by Dashboard\n')
            write_server_metadata(server_path, {'version': version, 'server_type': server_type})
            
            # --- Add default start script ---
            start_script_path = get_start_script_path(server_name)
            # This is the command that will be run. The user has full control over it.
            # We no longer hardcode finding java or the jar name.
            default_start_script = {"commands": ["java -Xmx2G -Xms1G -jar server.jar nogui"]}
            with open(start_script_path, 'w') as f:
                json.dump(default_start_script, f, indent=4)
            
            jar_url = f"https://mcutils.com/api/server-jars/{server_type}/{version}/download"
            jar_path = os.path.join(server_path, 'server.jar')
            download_jar(jar_url, jar_path)

            return jsonify({'message': f'Server {server_name} created ({server_type} {version}). JAR downloading in background.'}), 201
        except Exception as e:
            if os.path.exists(server_path):
                shutil.rmtree(server_path)
            return jsonify({'error': f'An unexpected error occurred: {e}'}), 500

    # --- GET Request Handling ---
    servers = []
    if not os.path.exists(SERVER_DIR):
        return jsonify([])

    for server_name in os.listdir(SERVER_DIR):
        server_path = os.path.join(SERVER_DIR, server_name)
        if os.path.isdir(server_path):
            properties = get_server_properties(server_path)
            metadata = get_server_metadata(server_path)
            servers.append({
                'id': server_name,
                'name': server_name,
                'version': metadata.get('version', 'N/A'),
                'port': properties.get('port'),
                'server_type': metadata.get('server_type', 'N/A'),
                'status': 'Running' if is_server_running(server_name) else 'Stopped'
            })
    return jsonify(servers)


@app.route('/api/servers/<server_name>/<action>', methods=['POST'])
def server_action(server_name, action):
    """Handles start, stop, and restart actions for a server."""
    if action == 'start':
        result, status_code = start_server(server_name)
        return jsonify(result), status_code
    
    elif action == 'stop':
        result, status_code = stop_server(server_name)
        return jsonify(result), status_code
        
    elif action == 'restart':
        stop_result, stop_status = stop_server(server_name)
        # Check if stop was successful. A 200 status code indicates success.
        if stop_status != 200:
             return jsonify(stop_result), stop_status
        
        # No time.sleep() needed, as stop_server is now blocking.
        start_result, start_status = start_server(server_name)

        # Add a custom message for the restart action
        if start_status == 200:
            start_result['message'] = f'Server {server_name} is restarting.'
        return jsonify(start_result), start_status

    return jsonify({'error': 'Invalid action specified'}), 400


@app.route('/api/servers/<server_name>/clear-logs', methods=['POST'])
def clear_logs(server_name):
    """Clears the server's log file and resets the log counter."""
    server_path = os.path.join(SERVER_DIR, server_name)
    log_file_path = os.path.join(server_path, 'logs', 'latest.log')
    
    if not os.path.isdir(server_path):
        return jsonify({"error": f"Server '{server_name}' not found"}), 404
    
    try:
        # Create logs directory if it doesn't exist
        log_dir = os.path.dirname(log_file_path)
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        # Clear the log file by opening it in write mode
        with open(log_file_path, 'w') as f:
            f.write("[Logs cleared]\n")
            
        # If the server is running, also send a command to clear the screen
        if is_server_running(server_name):
            screen_session_name = get_screen_session_name(server_name)
            base_command = ['wsl'] if sys.platform == "win32" else []
            clear_cmd = base_command + ['screen', '-S', screen_session_name, '-p', '0', '-X', 'stuff', "clear\n"]
            try:
                subprocess.run(clear_cmd, check=True)
            except Exception as e:
                print(f"Error clearing screen: {e}")
                # Continue even if screen clear fails
                
        return jsonify({"message": "Logs cleared successfully"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to clear logs: {e}"}), 500


# --- File Explorer API Endpoints ---

def sanitize_path(base_path, user_path):
    """Securely join a base path and a user-provided path. Prevents directory traversal."""
    base_path_abs = os.path.abspath(base_path)
    # The user_path is joined to the base_path. os.path.abspath will resolve any '..' etc.
    full_path = os.path.abspath(os.path.join(base_path_abs, user_path))

    # After resolving, check if the resulting path is still within the base directory
    if not full_path.startswith(base_path_abs):
        abort(400, "Directory traversal attempt detected.")
        
    return full_path

@app.route('/api/servers/<server_name>/files', methods=['GET'])
def list_files(server_name):
    """Lists files and folders in a given path."""
    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    relative_path = request.args.get('path', '')
    safe_path = sanitize_path(server_path, relative_path)

    if not os.path.isdir(safe_path):
        return jsonify({"error": "Path is not a directory or does not exist"}), 400

    items = []
    for item_name in sorted(os.listdir(safe_path)):
        item_path = os.path.join(safe_path, item_name)
        items.append({
            'name': item_name,
            'path': os.path.join(relative_path, item_name).replace('\\', '/'),
            'is_directory': os.path.isdir(item_path)
        })
    return jsonify(items)

@app.route('/api/servers/<server_name>/files/content', methods=['GET', 'POST'])
def handle_file_content(server_name):
    """Gets or saves the content of a file."""
    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    if request.method == 'GET':
        relative_path = request.args.get('path')
        if not relative_path:
            return jsonify({"error": "File path is required"}), 400
        
        NON_EDITABLE_EXTENSIONS = (
            '.jar', '.zip', '.exe', '.dll', '.dat', 
            '.png', '.jpg', '.jpeg', '.gif', '.bmp', 
            '.so', '.a', '.class', '.lock'
        )
        if relative_path.lower().endswith(NON_EDITABLE_EXTENSIONS):
            return jsonify({"error": "Cannot open binary or non-editable file in editor."}), 400

        safe_path = sanitize_path(server_path, relative_path)
        
        if not os.path.isfile(safe_path):
            return jsonify({"error": "File not found"}), 404
            
        try:
            with open(safe_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({"content": content})
        except Exception as e:
            return jsonify({"error": f"Could not read file: {e}. It may not be a standard text file."}), 500

    if request.method == 'POST':
        data = request.get_json()
        relative_path = data.get('path')
        content = data.get('content')

        if not relative_path:
            return jsonify({"error": "File path is required"}), 400

        safe_path = sanitize_path(server_path, relative_path)
        
        try:
            with open(safe_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return jsonify({"message": f"Successfully saved {os.path.basename(safe_path)}"})
        except Exception as e:
            return jsonify({"error": f"Could not save file: {e}"}), 500


# --- Installation Script API Endpoints ---

def get_install_script_path(server_name):
    """Returns the path to the install_script.json for a given server."""
    return os.path.join(SERVER_DIR, server_name, 'install_script.json')

@app.route('/api/servers/<server_name>/install-script', methods=['GET', 'POST'])
def handle_install_script(server_name):
    script_path = get_install_script_path(server_name)
    if request.method == 'POST':
        data = request.get_json()
        if 'commands' not in data or not isinstance(data['commands'], list):
            return jsonify({"error": "Invalid data format. 'commands' list is required."}), 400
        with open(script_path, 'w') as f:
            json.dump(data, f, indent=4)
        return jsonify({"message": "Installation script saved successfully."})

    # GET request
    if os.path.exists(script_path):
        with open(script_path, 'r') as f:
            script_data = json.load(f)
        return jsonify(script_data)
    else:
        return jsonify({"commands": []})

def get_start_script_path(server_name):
    return os.path.join(SERVER_DIR, server_name, 'start_script.json')

@app.route('/api/servers/<server_name>/start-script', methods=['GET', 'POST'])
def handle_start_script(server_name):
    script_path = get_start_script_path(server_name)
    if request.method == 'POST':
        data = request.get_json()
        if 'commands' not in data or not isinstance(data['commands'], list):
            return jsonify({"error": "Invalid data format. 'commands' list is required."}), 400
        with open(script_path, 'w') as f:
            json.dump(data, f, indent=4)
        return jsonify({"message": "Start script saved successfully."})

    # GET request
    if os.path.exists(script_path):
        with open(script_path, 'r') as f:
            script_data = json.load(f)
        return jsonify(script_data)
    else:
        return jsonify({"commands": []})

@app.route('/api/servers/<server_name>/install', methods=['POST'])
def run_install_script(server_name):
    """Runs the installation script for a server."""
    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    script_path = get_install_script_path(server_name)
    if not os.path.exists(script_path):
        return jsonify({"error": "Installation script not found."}), 404
    
    with open(script_path, 'r') as f:
        script_data = json.load(f)
    
    commands = script_data.get('commands', [])
    
    def run_commands_and_log():
        """
        Runs installation commands, logging output directly to the server's log file.
        """
        log_file_path = os.path.join(server_path, 'logs', 'latest.log')
        os.makedirs(os.path.dirname(log_file_path), exist_ok=True)

        def log_to_file(message):
            """Appends a message to the latest.log file."""
            with open(log_file_path, 'a', encoding='utf-8') as f:
                f.write(f"[{time.strftime('%H:%M:%S')}] [Installer] {message}\n")
            print(f"[{server_name}] {message}")

        try:
            log_to_file(f"Starting installation for {server_name}...")
            for command in commands:
                log_to_file(f"Running command: `{command}`")
                process = subprocess.Popen(
                    command,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    cwd=server_path,
                    bufsize=1
                )

                for line in iter(process.stdout.readline, ''):
                    log_to_file(line.strip())
                
                process.stdout.close()
                return_code = process.wait()

                if return_code != 0:
                    log_to_file(f"Command failed with exit code {return_code}.")
                    raise subprocess.CalledProcessError(return_code, command)

            log_to_file("Installation script finished successfully.")

        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            error_message = f"Command failed: {e}"
            log_to_file(error_message)
        except Exception as e:
            log_to_file(f"An unexpected error occurred: {e}")

    Thread(target=run_commands_and_log, daemon=True).start()
    
    return jsonify({"message": "Installation process started. Check the Logs tab for output."})

@app.route('/api/servers/<server_name>/install/log', methods=['GET'])
def get_install_log(server_name):
    """Retrieves the current installation log for a server."""
    return jsonify({"log": ["This endpoint is deprecated. Check the main log file."]})


@app.route('/api/servers/<server_name>/status', methods=['GET'])
def get_server_status(server_name):
    """
    Gets the status of a server.
    Note: With screen, we can't get detailed metrics like CPU/Memory easily.
    This is now a simplified status check.
    """
    if is_server_running(server_name):
        return jsonify({
            "status": "Running", "players_online": "N/A", "max_players": "N/A",
            "ping": "N/A", "cpu_usage": "N/A", "memory_usage": "N/A"
        })
    else:
        return jsonify({
            "status": "Stopped", "players_online": 0, "max_players": 0,
            "ping": 0, "cpu_usage": 0, "memory_usage": 0
        })

@app.route('/api/servers/<server_name>/console', methods=['GET', 'POST'])
def handle_console(server_name):
    """
    Handles getting console output and sending commands via screen.
    """
    screen_session_name = get_screen_session_name(server_name)
    
    # On Windows, all screen commands must be prefixed with 'wsl'.
    base_command = ['wsl'] if sys.platform == "win32" else []

    if not is_server_running(server_name):
        # If server is stopped, return a helpful message instead of 404
        return jsonify({"output": ["[Server is stopped. Start the server to see console output.]"], "line_count": 1})

    if request.method == 'POST':
        data = request.get_json()
        command = data.get('command')
        if command:
            try:
                # Use screen's 'stuff' command to send the command string to the session.
                full_command = base_command + ['screen', '-S', screen_session_name, '-p', '0', '-X', 'stuff', f"{command}\n"]
                subprocess.run(full_command, check=True, text=True)
                return jsonify({"message": "Command sent to server screen session."})
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                return jsonify({"error": f"Failed to send command via screen: {e}"}), 500
        return jsonify({"error": "No command provided"}), 400

    # GET request for console output is now deprecated in favor of /log,
    # but we'll keep it for sending the static "how to connect" message.
    return jsonify({
        "output": [
            "INFO: This is the command input console.",
            "INFO: Live server output is now shown in the 'Logs' tab."
        ],
        "line_count": 2
    })

@app.route('/api/servers/<server_name>/log', methods=['GET'])
def get_server_log(server_name):
    """Tails the server's latest.log file."""
    server_path = os.path.join(SERVER_DIR, server_name)
    log_file_path = os.path.join(server_path, 'logs', 'latest.log')

    if not os.path.exists(log_file_path):
        return jsonify({"lines": ["Log file not found. It will be created when the server starts."], "line_count": 1})

    try:
        with open(log_file_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()

        # Get the line number from which to start reading, default to 0
        since_line = int(request.args.get('since', 0))
        
        # Get new lines since the last request
        new_lines = lines[since_line:]
        line_count = len(lines)

        return jsonify({"lines": new_lines, "line_count": line_count})
        
    except Exception as e:
        return jsonify({"error": f"Could not read log file: {e}"}), 500


@app.errorhandler(404)
def not_found_error(error):
    return jsonify({"error": "API endpoint not found"}), 404

# --- Settings and File Browsing API ---

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    """Handles getting and saving application settings."""
    global SERVER_DIR, config
    if request.method == 'POST':
        data = request.get_json()
        new_path = data.get('mc_servers_path')

        if not new_path or not os.path.isdir(new_path):
            return jsonify({"error": "Invalid or non-existent directory provided."}), 400

        # Update config and save
        config['mc_servers_path'] = new_path
        save_config(config)

        # Update the global variable for the current session
        SERVER_DIR = new_path
        
        # You might need to restart the app or dynamically reload resources
        # for this change to be fully effective everywhere.
        return jsonify({"message": "Settings updated. A restart may be required for all changes to take effect."})

    # GET request
    return jsonify(config)

@app.route('/api/browse', methods=['GET'])
def browse_files():
    """An unrestricted file browser API to list directories."""
    req_path = request.args.get('path')

    # If no path is given, show drives on Windows or root on other systems.
    if not req_path:
        if sys.platform == "win32":
            drives = [f"{d}:\\" for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if os.path.exists(f"{d}:")]
            return jsonify({
                "current_path": "My Computer",
                "parent_path": "", # No parent for the drive list
                "directories": drives
            })
        else: # On Linux/macOS, start at the root directory
            req_path = '/'

    # Normalize the path to prevent security issues and handle paths correctly
    current_path = os.path.abspath(req_path)

    if not os.path.isdir(current_path):
        return jsonify({"error": f"Path '{req_path}' is not a valid directory."}), 400

    try:
        # Determine the parent directory
        parent_path = os.path.dirname(current_path)
        # If the parent is the same as the current (e.g., at C:\), we have reached the top of this branch.
        # On Windows, this means we should go back to the drive list.
        if parent_path == current_path:
            parent_path = "" # An empty path will be interpreted by the frontend as the root/drive list

        dirs = []
        for item in os.listdir(current_path):
            try:
                item_path = os.path.join(current_path, item)
                # Filter out hidden files/folders and system/recycle bin folders on Windows
                if not item.startswith('.') and not item.lower().startswith('$recycle.bin'):
                     if os.path.isdir(item_path):
                        dirs.append(item)
            except OSError:
                continue # Skip files that can't be accessed

        return jsonify({
            "current_path": current_path,
            "parent_path": parent_path,
            "directories": sorted(dirs)
        })
    except OSError as e:
        return jsonify({"error": f"Cannot access path '{req_path}': {e}"}), 500


def get_jdk_url(version):
    """Returns a download URL for a given Java version (Windows x64)."""
    urls = {
        "21": "https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_windows-x64_bin.zip",
        "17": "https://download.java.net/java/GA/jdk17.0.2/dfd4a8d0985749f896bed50d7138ee7f/8/GPL/openjdk-17.0.2_windows-x64_bin.zip",
        "8": "https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u392-b08/OpenJDK8U-jdk_x64_windows_hotspot_8u392b08.zip"
    }
    return urls.get(str(version))

@app.route('/api/servers/<server_name>/java/install', methods=['POST'])
def install_java(server_name):
    """
    Downloads and extracts a specific JDK version for a server.
    The output is streamed to the installation log.
    """
    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    data = request.get_json()
    java_version = data.get('version')
    if not java_version:
        return jsonify({"error": "Java version is required"}), 400

    jdk_url = get_jdk_url(java_version)
    if not jdk_url:
        return jsonify({"error": f"Invalid Java version specified: {java_version}"}), 400

    def install_and_log():
        log_file_path = os.path.join(server_path, 'logs', 'latest.log')
        os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
        
        def log_to_file(message):
            """Appends a message to the latest.log file."""
            with open(log_file_path, 'a', encoding='utf-8') as f:
                f.write(f"[{time.strftime('%H:%M:%S')}] [Java Installer] {message}\n")
            print(f"[{server_name}] {message}")

        java_dir = os.path.join(server_path, 'java')
        
        try:
            log_to_file(f"Starting Java {java_version} installation...")
            log_to_file(f"Downloading JDK from {jdk_url}...")
            zip_filename = os.path.basename(jdk_url)
            zip_path = os.path.join(server_path, zip_filename)

            with requests.get(jdk_url, stream=True) as r:
                r.raise_for_status()
                with open(zip_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            
            log_to_file("Download complete. Extracting files...")
            
            if os.path.exists(java_dir):
                log_to_file(f"Removing existing Java directory at {java_dir}")
                shutil.rmtree(java_dir)
            os.makedirs(java_dir)

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(java_dir)
            
            log_to_file(f"Extraction complete. Java installed in {java_dir}")
            
            os.remove(zip_path)
            log_to_file(f"Cleaned up {zip_filename}.")

            # --- Automatically update start script ---
            new_java_exe = find_java_executable(server_path)
            if new_java_exe:
                # Make the path relative to the server directory for portability
                relative_java_path = os.path.relpath(new_java_exe, server_path).replace('\\', '/')
                
                # On Windows, we need to make sure it's a "runnable" path inside WSL/bash
                if sys.platform == "win32":
                    relative_java_path = f"./{relative_java_path}"

                start_script_path = get_start_script_path(server_name)
                if os.path.exists(start_script_path):
                    with open(start_script_path, 'r+') as f:
                        script_data = json.load(f)
                        commands = script_data.get('commands', [])
                        # Update the first command if it starts with "java "
                        if commands and commands[0].strip().startswith("java "):
                            parts = commands[0].split(' ', 1)
                            new_command = f'"{relative_java_path}" {parts[1]}'
                            script_data['commands'][0] = new_command
                            # Go back to the beginning of the file to overwrite
                            f.seek(0)
                            json.dump(script_data, f, indent=4)
                            f.truncate()
                            log_to_file("Successfully updated start script to use new Java installation.")
                        else:
                            log_to_file("Could not automatically update start script. Please update it manually.")
                else:
                    log_to_file("No start script found to update.")

            log_to_file("Java installation finished successfully.")

        except (requests.exceptions.RequestException, zipfile.BadZipFile) as e:
            log_to_file(f"Installation failed: {e}")
        except Exception as e:
            log_to_file(f"An unexpected error occurred during Java installation: {e}")

    Thread(target=install_and_log, daemon=True).start()
    return jsonify({"message": f"Java {java_version} installation started. Check Logs tab for output."})

@app.route('/api/servers/<server_name>', methods=['DELETE'])
def delete_server(server_name):
    """Deletes a server after stopping it."""
    server_path = os.path.join(SERVER_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    # Stop the server if it's running
    if is_server_running(server_name):
        stop_result, stop_status = stop_server(server_name)
        if stop_status != 200:
            # If stopping fails for a reason other than 'not running', report error
            if 'not running' not in stop_result.get('error', '').lower():
                 return jsonify({"error": f"Could not stop server before deletion: {stop_result.get('error')}"}), 500
    
    try:
        shutil.rmtree(server_path)
        return jsonify({"message": f"Server '{server_name}' deleted successfully."}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to delete server directory: {e}"}), 500

def find_java_executable(server_dir):
    """Finds the java.exe within the server's local java directory."""
    java_home = os.path.join(server_dir, 'java')
    if not os.path.isdir(java_home):
        return None # No local java installation found

    for root, dirs, files in os.walk(java_home):
        if 'java.exe' in files and 'bin' in root:
            return os.path.join(root, 'java.exe')
    
    return None # Executable not found inside java dir

def start_server(server_name):
    """Starts the server using only the commands in start_script.json."""
    server_path = os.path.join(SERVER_DIR, server_name)
    screen_session_name = get_screen_session_name(server_name)
    
    if is_server_running(server_name):
        return {'error': 'Server is already running in a screen session'}, 409

    start_script_path = get_start_script_path(server_name)
    if not os.path.exists(start_script_path):
        return {'error': 'start_script.json not found. Cannot start server.'}, 400

    with open(start_script_path, 'r') as f:
        script_data = json.load(f)
        commands = script_data.get('commands', [])
    
    if not commands:
        return {'error': 'No commands found in start_script.json. Cannot start server.'}, 400

    def start_and_launch():
        log_file = os.path.join(server_path, 'logs', 'latest.log')
        os.makedirs(os.path.dirname(log_file), exist_ok=True)

        try:
            if sys.platform == "win32":
                def to_wsl_path(win_path):
                    path = win_path.replace('\\', '/')
                    drive = path[0].lower()
                    return f"/mnt/{drive}/{path[3:]}"

                wsl_server_path = to_wsl_path(server_path)
                wsl_log_path = to_wsl_path(log_file)

                # The first command should always be to cd into the server directory.
                all_commands = [f"cd '{wsl_server_path}'"] + commands
                final_command = " && ".join(all_commands)
                
                launch_command = [
                    'wsl', 'screen', '-L', '-Logfile', wsl_log_path, '-S', screen_session_name, '-dm', 'bash', '-c', final_command
                ]
                subprocess.run(launch_command, check=True)
            else: # Linux/macOS
                final_command = " && ".join(commands)
                
                launch_command = [
                    'screen', '-L', '-Logfile', log_file, '-S', screen_session_name, '-dm',
                    'bash', '-c', final_command
                ]
                subprocess.run(launch_command, cwd=server_path, check=True)

            print(f"DEBUG [{server_name}]: Server process launched in screen '{screen_session_name}' using start script.")

        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            print(f"FATAL [{server_name}]: Failed to launch screen session: {e}")
        except Exception as e:
            print(f"FATAL [{server_name}]: An uncaught exception occurred in startup thread: {e}")
            
    Thread(target=start_and_launch, daemon=True).start()
    return {'message': f'Server {server_name} is starting using commands from start script.'}, 200

def stop_server(server_name):
    """Stops the server by sending the 'stop' command and waiting for it to terminate."""
    screen_session_name = get_screen_session_name(server_name)
    if not is_server_running(server_name):
        return {'error': 'Server is not running'}, 409

    base_command = ['wsl'] if sys.platform == "win32" else []
    full_command = base_command + ['screen', '-S', screen_session_name, '-p', '0', '-X', 'stuff', 'stop\n']

    try:
        # Send the stop command
        print(f"DEBUG [{server_name}]: Sending 'stop' command to screen session.")
        subprocess.run(full_command, check=True, capture_output=True, text=True)

        # Poll for up to 30 seconds for the screen session to terminate
        for i in range(30):
            if not is_server_running(server_name):
                print(f"DEBUG [{server_name}]: Screen session terminated gracefully after {i+1} seconds.")
                return {'message': 'Server stopped successfully.'}, 200
            time.sleep(1)

        # If the loop finishes, the server did not stop in time.
        print(f"WARN [{server_name}]: Server did not stop within 30 seconds. Force-quitting screen.")
        quit_command = base_command + ['screen', '-S', screen_session_name, '-X', 'quit']
        subprocess.run(quit_command, check=False) # Use check=False as it might already be gone
        
        # Give it a moment to disappear after quitting
        time.sleep(2)
        if is_server_running(server_name):
             return {'error': 'Failed to stop or force-quit the server screen.'}, 500

        return {'message': 'Server was unresponsive and has been force-quit.'}, 200

    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        error_message = f"Failed to send stop command via screen: {e}"
        if hasattr(e, 'stderr') and "No screen session found" in str(e.stderr):
             return {'error': 'Server is not running'}, 409
        print(f"ERROR [{server_name}]: {error_message} - Stderr: {e.stderr if hasattr(e, 'stderr') else 'N/A'}")
        return {'error': error_message}, 500
    except Exception as e:
        print(f"ERROR [{server_name}]: An unexpected error occurred while trying to stop the server: {e}")
        return {'error': f'Failed to stop server: {e}'}, 500

if __name__ == '__main__':
    app.run(debug=True, port=5000) 