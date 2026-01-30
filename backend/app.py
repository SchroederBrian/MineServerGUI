import os
import subprocess
import json
import requests
import re
from flask import Flask, jsonify, request, abort, send_from_directory, session
from flask_cors import CORS
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from flasgger import Swagger
from werkzeug.security import generate_password_hash, check_password_hash
from threading import Thread, Lock
import time
import shutil
import zipfile
import collections
import sys
import uuid
import sqlite3
import secrets
from functools import wraps
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
try:
    import psutil
except ImportError:
    psutil = None
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
try:
    from jose import jwt, JWTError
except ImportError:
    jwt = None
    JWTError = None

# --- Configuration ---
app = Flask(__name__, static_folder='..', static_url_path='')
CORS(app, supports_credentials=True)

# --- Swagger Configuration ---
swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'apispec',
            "route": '/apispec.json',
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs"
}

swagger_template = {
    "swagger": "2.0",
    "info": {
        "title": "MineServerGUI API",
        "description": "API for managing Minecraft servers through MineServerGUI",
        "version": "1.0.0",
        "contact": {
            "name": "MineServerGUI"
        }
    },
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "OAuth2 Bearer token. Format: Bearer <token>"
        },
        "Session": {
            "type": "apiKey",
            "name": "Cookie",
            "in": "header",
            "description": "Session-based authentication"
        }
    },
    "security": [
        {"Bearer": []},
        {"Session": []}
    ]
}

swagger = Swagger(app, config=swagger_config, template=swagger_template)

# --- Configuration Loading ---
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')

def _default_servers_dir():
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mc_servers'))

def _default_configs_dir():
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server_configs'))

def _looks_like_windows_path(path_value: str) -> bool:
    # Examples: "C:\\Users\\...", "D:/data/..."
    return bool(re.match(r'^[a-zA-Z]:[\\/]', path_value))

def _sanitize_dir_path(raw_value, default_value: str, key_name: str) -> str:
    """
    Ensures directory config values are usable on the current OS.
    - Normalizes to absolute paths.
    - Creates directories if they do not exist.
    - Falls back to defaults if path is clearly invalid or not creatable.
    """
    if not isinstance(raw_value, str) or not raw_value.strip():
        raw_value = default_value

    candidate = raw_value.strip()

    # If we are not on Windows, reject obvious Windows drive-letter paths.
    if os.name != 'nt' and _looks_like_windows_path(candidate):
        candidate = default_value

    # If we are not on WSL and a WSL-mount path is configured but unavailable, fallback.
    if os.name != 'nt' and candidate.startswith('/mnt/') and not os.path.exists('/mnt'):
        candidate = default_value

    candidate = os.path.abspath(candidate)

    try:
        os.makedirs(candidate, exist_ok=True)
    except Exception as e:
        print(f"[config] Failed to create '{key_name}' directory '{candidate}': {e}. Falling back to default.")
        candidate = os.path.abspath(default_value)
        os.makedirs(candidate, exist_ok=True)

    return candidate

def load_config():
    """Loads the configuration from config.json."""
    if not os.path.exists(CONFIG_FILE):
        # Create a default config if it doesn't exist
        default_config = {
            'servers_dir': _default_servers_dir(),
            'configs_dir': _default_configs_dir()
        }
        save_config(default_config)
        return default_config
    try:
        with open(CONFIG_FILE, 'r') as f:
            # Add default for configs_dir if it's missing for backward compatibility
            config_data = json.load(f)
            if 'configs_dir' not in config_data:
                config_data['configs_dir'] = _default_configs_dir()
            if 'panorama_intensity' not in config_data:
                config_data['panorama_intensity'] = 1.5

            # Sanitize paths (prevents Linux deployments from inheriting Windows/WSL paths)
            original_servers_dir = config_data.get('servers_dir')
            original_configs_dir = config_data.get('configs_dir')
            config_data['servers_dir'] = _sanitize_dir_path(original_servers_dir, _default_servers_dir(), 'servers_dir')
            config_data['configs_dir'] = _sanitize_dir_path(original_configs_dir, _default_configs_dir(), 'configs_dir')

            if config_data.get('servers_dir') != original_servers_dir or config_data.get('configs_dir') != original_configs_dir:
                save_config(config_data)

            return config_data
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error reading config file {CONFIG_FILE}: {e}. Using default.")
        default_config = {
            'servers_dir': _sanitize_dir_path(_default_servers_dir(), _default_servers_dir(), 'servers_dir'),
            'configs_dir': _sanitize_dir_path(_default_configs_dir(), _default_configs_dir(), 'configs_dir'),
            'panorama_intensity': 1.5,
        }
        save_config(default_config)
        return default_config

def save_config(config_data):
    """Saves the configuration to config.json."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_data, f, indent=4)

# Load config on startup
config = load_config()
SERVERS_DIR = config['servers_dir']
CONFIGS_DIR = config['configs_dir']
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'server_templates')

# --- Secret Key Setup ---
if 'secret_key' not in config:
    config['secret_key'] = secrets.token_hex(32)
    save_config(config)

app.config['SECRET_KEY'] = config['secret_key']

# --- User Authentication Setup ---
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'users.db')
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin):
    def __init__(self, id, username, role='user', is_active=True):
        self.id = id
        self.username = username
        self.role = role
        self._is_active = bool(is_active)
    
    @property
    def is_active(self):
        return self._is_active

def init_db():
    """Initialize the user database with multi-user support."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Create users table with role and active status
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if migration is needed for existing users table
    c.execute("PRAGMA table_info(users)")
    user_columns = {row[1] for row in c.fetchall()}
    if 'role' not in user_columns:
        c.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'")
    if 'is_active' not in user_columns:
        c.execute("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
    
    # Set all existing users to admin role
    c.execute("UPDATE users SET role = 'admin' WHERE role IS NULL OR role = ''")
    
    # Create user groups table
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create user-group membership table
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_group_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            group_id INTEGER NOT NULL,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, group_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(group_id) REFERENCES user_groups(id) ON DELETE CASCADE
        )
    ''')
    
    # Create user server permissions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_server_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            server_name TEXT NOT NULL,
            can_view INTEGER NOT NULL DEFAULT 0,
            can_start_stop INTEGER NOT NULL DEFAULT 0,
            can_edit_config INTEGER NOT NULL DEFAULT 0,
            can_delete INTEGER NOT NULL DEFAULT 0,
            can_access_console INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, server_name),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Create group server permissions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS group_server_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER NOT NULL,
            server_name TEXT NOT NULL,
            can_view INTEGER NOT NULL DEFAULT 0,
            can_start_stop INTEGER NOT NULL DEFAULT 0,
            can_edit_config INTEGER NOT NULL DEFAULT 0,
            can_delete INTEGER NOT NULL DEFAULT 0,
            can_access_console INTEGER NOT NULL DEFAULT 0,
            UNIQUE(group_id, server_name),
            FOREIGN KEY(group_id) REFERENCES user_groups(id) ON DELETE CASCADE
        )
    ''')
    
    # ===== GRANULAR PERMISSIONS MIGRATION =====
    # Add new granular permission columns to user_server_permissions
    c.execute("PRAGMA table_info(user_server_permissions)")
    existing_user_perm_columns = {row[1] for row in c.fetchall()}
    
    new_granular_permissions = [
        'can_view_logs', 'can_view_analytics',
        'can_start_server', 'can_stop_server', 'can_restart_server',
        'can_edit_properties', 'can_edit_files',
        'can_manage_backups', 'can_manage_worlds', 'can_manage_scheduler',
        'can_manage_plugins', 'can_change_settings', 'can_delete_server'
    ]
    
    for perm in new_granular_permissions:
        if perm not in existing_user_perm_columns:
            c.execute(f"ALTER TABLE user_server_permissions ADD COLUMN {perm} INTEGER NOT NULL DEFAULT 0")
    
    # Add new granular permission columns to group_server_permissions
    c.execute("PRAGMA table_info(group_server_permissions)")
    existing_group_perm_columns = {row[1] for row in c.fetchall()}
    
    for perm in new_granular_permissions:
        if perm not in existing_group_perm_columns:
            c.execute(f"ALTER TABLE group_server_permissions ADD COLUMN {perm} INTEGER NOT NULL DEFAULT 0")
    
    # Migrate old broad permissions to new granular ones for user_server_permissions
    # Only migrate if old columns exist and new columns are empty
    if 'can_view' in existing_user_perm_columns:
        c.execute('''
            UPDATE user_server_permissions 
            SET can_view_logs = can_view, can_view_analytics = can_view
            WHERE can_view = 1 AND can_view_logs = 0
        ''')
    
    if 'can_start_stop' in existing_user_perm_columns:
        c.execute('''
            UPDATE user_server_permissions 
            SET can_start_server = can_start_stop, 
                can_stop_server = can_start_stop,
                can_restart_server = can_start_stop
            WHERE can_start_stop = 1 AND can_start_server = 0
        ''')
    
    if 'can_edit_config' in existing_user_perm_columns:
        c.execute('''
            UPDATE user_server_permissions 
            SET can_edit_properties = can_edit_config,
                can_edit_files = can_edit_config,
                can_manage_backups = can_edit_config,
                can_manage_worlds = can_edit_config,
                can_manage_scheduler = can_edit_config,
                can_manage_plugins = can_edit_config,
                can_change_settings = can_edit_config
            WHERE can_edit_config = 1 AND can_edit_properties = 0
        ''')
    
    if 'can_delete' in existing_user_perm_columns:
        c.execute('''
            UPDATE user_server_permissions 
            SET can_delete_server = can_delete
            WHERE can_delete = 1 AND can_delete_server = 0
        ''')
    
    # Migrate for group_server_permissions as well
    if 'can_view' in existing_group_perm_columns:
        c.execute('''
            UPDATE group_server_permissions 
            SET can_view_logs = can_view, can_view_analytics = can_view
            WHERE can_view = 1 AND can_view_logs = 0
        ''')
    
    if 'can_start_stop' in existing_group_perm_columns:
        c.execute('''
            UPDATE group_server_permissions 
            SET can_start_server = can_start_stop, 
                can_stop_server = can_start_stop,
                can_restart_server = can_start_stop
            WHERE can_start_stop = 1 AND can_start_server = 0
        ''')
    
    if 'can_edit_config' in existing_group_perm_columns:
        c.execute('''
            UPDATE group_server_permissions 
            SET can_edit_properties = can_edit_config,
                can_edit_files = can_edit_config,
                can_manage_backups = can_edit_config,
                can_manage_worlds = can_edit_config,
                can_manage_scheduler = can_edit_config,
                can_manage_plugins = can_edit_config,
                can_change_settings = can_edit_config
            WHERE can_edit_config = 1 AND can_edit_properties = 0
        ''')
    
    if 'can_delete' in existing_group_perm_columns:
        c.execute('''
            UPDATE group_server_permissions 
            SET can_delete_server = can_delete
            WHERE can_delete = 1 AND can_delete_server = 0
        ''')
    
    # ===== OAUTH2 TABLES =====
    # Create OAuth2 clients table
    c.execute('''
        CREATE TABLE IF NOT EXISTS oauth2_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT UNIQUE NOT NULL,
            client_secret_hash TEXT NOT NULL,
            client_name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Create OAuth2 tokens table
    c.execute('''
        CREATE TABLE IF NOT EXISTS oauth2_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_token TEXT UNIQUE NOT NULL,
            client_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(client_id) REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    ''')
    
    # Create index for faster token lookups
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_oauth2_tokens_access_token 
        ON oauth2_tokens(access_token)
    ''')
    
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_oauth2_tokens_expires_at 
        ON oauth2_tokens(expires_at)
    ''')
    
    conn.commit()
    conn.close()

def get_user_by_id(user_id):
    """Fetch user by ID."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, username, role, is_active FROM users WHERE id = ?', (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return User(row[0], row[1], row[2], row[3])
    return None

def get_user_by_username(username):
    """Fetch user by username."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?', (username,))
    row = c.fetchone()
    conn.close()
    return row

def create_user(username, password, role='user', is_active=True):
    """Create a new user with role and active status."""
    password_hash = generate_password_hash(password)
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute(
            'INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
            (username, password_hash, role, 1 if is_active else 0)
        )
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        return None

def has_users():
    """Check if any users exist in the database."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT COUNT(*) FROM users')
    count = c.fetchone()[0]
    conn.close()
    return count > 0

# --- Permission System ---

def is_admin_user(user):
    """Check if a user has admin role."""
    return getattr(user, 'role', None) == 'admin'

def get_default_permissions():
    """Get default permissions from config."""
    defaults = config.get('default_permissions', {})
    return {
        # Viewing permissions
        'can_view_logs': bool(defaults.get('can_view_logs', False)),
        'can_view_analytics': bool(defaults.get('can_view_analytics', False)),
        # Server control permissions
        'can_start_server': bool(defaults.get('can_start_server', False)),
        'can_stop_server': bool(defaults.get('can_stop_server', False)),
        'can_restart_server': bool(defaults.get('can_restart_server', False)),
        # Configuration & management permissions
        'can_edit_properties': bool(defaults.get('can_edit_properties', False)),
        'can_edit_files': bool(defaults.get('can_edit_files', False)),
        'can_manage_backups': bool(defaults.get('can_manage_backups', False)),
        'can_manage_worlds': bool(defaults.get('can_manage_worlds', False)),
        'can_manage_scheduler': bool(defaults.get('can_manage_scheduler', False)),
        'can_manage_plugins': bool(defaults.get('can_manage_plugins', False)),
        'can_change_settings': bool(defaults.get('can_change_settings', False)),
        # Console permission
        'can_access_console': bool(defaults.get('can_access_console', False)),
        # Danger zone permission
        'can_delete_server': bool(defaults.get('can_delete_server', False)),
        # Legacy permissions (keep for backwards compatibility)
        'can_view': bool(defaults.get('can_view', False)),
        'can_start_stop': bool(defaults.get('can_start_stop', False)),
        'can_edit_config': bool(defaults.get('can_edit_config', False)),
        'can_delete': bool(defaults.get('can_delete', False))
    }

def merge_permissions(base, override):
    """Merge permissions using OR logic (any true = true)."""
    for key in base.keys():
        base[key] = bool(base[key]) or bool(override.get(key, False))
    return base

def get_user_permissions(user_id, server_name):
    """Resolve permissions for a user and server, including group permissions."""
    default_permissions = get_default_permissions()
    permissions = dict(default_permissions)
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Get direct user permissions for this server (including wildcard '*')
    c.execute('''
        SELECT can_view_logs, can_view_analytics,
               can_start_server, can_stop_server, can_restart_server,
               can_edit_properties, can_edit_files,
               can_manage_backups, can_manage_worlds, can_manage_scheduler,
               can_manage_plugins, can_change_settings,
               can_access_console, can_delete_server,
               can_view, can_start_stop, can_edit_config, can_delete
        FROM user_server_permissions
        WHERE user_id = ? AND server_name IN (?, '*')
    ''', (user_id, server_name))
    
    for row in c.fetchall():
        permissions = merge_permissions(permissions, {
            'can_view_logs': row[0],
            'can_view_analytics': row[1],
            'can_start_server': row[2],
            'can_stop_server': row[3],
            'can_restart_server': row[4],
            'can_edit_properties': row[5],
            'can_edit_files': row[6],
            'can_manage_backups': row[7],
            'can_manage_worlds': row[8],
            'can_manage_scheduler': row[9],
            'can_manage_plugins': row[10],
            'can_change_settings': row[11],
            'can_access_console': row[12],
            'can_delete_server': row[13],
            'can_view': row[14],
            'can_start_stop': row[15],
            'can_edit_config': row[16],
            'can_delete': row[17]
        })
    
    # Get user's group memberships
    c.execute('SELECT group_id FROM user_group_memberships WHERE user_id = ?', (user_id,))
    group_ids = [row[0] for row in c.fetchall()]
    
    # Get group permissions
    if group_ids:
        placeholders = ','.join('?' for _ in group_ids)
        query = f'''
            SELECT can_view_logs, can_view_analytics,
                   can_start_server, can_stop_server, can_restart_server,
                   can_edit_properties, can_edit_files,
                   can_manage_backups, can_manage_worlds, can_manage_scheduler,
                   can_manage_plugins, can_change_settings,
                   can_access_console, can_delete_server,
                   can_view, can_start_stop, can_edit_config, can_delete
            FROM group_server_permissions
            WHERE group_id IN ({placeholders}) AND server_name IN (?, '*')
        '''
        c.execute(query, (*group_ids, server_name))
        
        for row in c.fetchall():
            permissions = merge_permissions(permissions, {
                'can_view_logs': row[0],
                'can_view_analytics': row[1],
                'can_start_server': row[2],
                'can_stop_server': row[3],
                'can_restart_server': row[4],
                'can_edit_properties': row[5],
                'can_edit_files': row[6],
                'can_manage_backups': row[7],
                'can_manage_worlds': row[8],
                'can_manage_scheduler': row[9],
                'can_manage_plugins': row[10],
                'can_change_settings': row[11],
                'can_access_console': row[12],
                'can_delete_server': row[13],
                'can_view': row[14],
                'can_start_stop': row[15],
                'can_edit_config': row[16],
                'can_delete': row[17]
            })
    
    conn.close()
    return permissions

def require_admin(func):
    """Decorator to require admin role."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required'}), 401
        if not is_admin_user(current_user):
            return jsonify({'error': 'Admin access required'}), 403
        return func(*args, **kwargs)
    return wrapper

def require_permission(permission_key, server_name_arg='server_name'):
    """Decorator to require specific permission for a server."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Admins bypass permission checks
            if is_admin_user(current_user):
                return func(*args, **kwargs)
            
            # Get server name from route arguments
            server_name = kwargs.get(server_name_arg)
            if not server_name:
                return jsonify({'error': 'Server name required'}), 400
            
            # Check permissions
            permissions = get_user_permissions(current_user.id, server_name)
            if not permissions.get(permission_key, False):
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def is_valid_server_name(server_name):
    """Validate server name to prevent directory traversal."""
    return bool(server_name) and '..' not in server_name and '/' not in server_name and '\\' not in server_name

def api_auth_required(f):
    """
    Dual authentication decorator that supports both OAuth2 Bearer tokens and session-based authentication.
    OAuth2 tokens are checked first, then falls back to session authentication.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_user = None
        
        # Check for OAuth2 Bearer token first
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]  # Remove "Bearer " prefix
            api_user = validate_access_token(token)
            if api_user:
                # Valid OAuth2 token - pass api_user to the function
                return f(*args, api_user=api_user, **kwargs)
            else:
                # Invalid or expired token
                return jsonify({
                    'msg': 'Invalid or expired access token',
                    'code': 'ErrInvalidToken'
                }), 401
        
        # Fallback to session-based authentication
        if current_user.is_authenticated:
            return f(*args, api_user=current_user, **kwargs)
        
        # No valid authentication found
        return jsonify({
            'msg': 'Authentication required. Provide either a Bearer token or valid session',
            'code': 'ErrUnauthorized'
        }), 401
    
    return decorated_function

def api_require_admin(f):
    """Decorator to require admin role for API endpoints (works with both auth methods)."""
    @wraps(f)
    @api_auth_required
    def wrapper(*args, api_user=None, **kwargs):
        if not is_admin_user(api_user):
            return jsonify({
                'msg': 'Admin access required',
                'code': 'ErrAdminRequired'
            }), 403
        return f(*args, api_user=api_user, **kwargs)
    return wrapper

def api_require_permission(permission_key, server_name_arg='server_name'):
    """Decorator to require specific permission for a server (API version)."""
    def decorator(f):
        @wraps(f)
        @api_auth_required
        def wrapper(*args, api_user=None, **kwargs):
            # Admins bypass permission checks
            if is_admin_user(api_user):
                return f(*args, api_user=api_user, **kwargs)
            
            # Get server name from route arguments
            server_name = kwargs.get(server_name_arg)
            if not server_name:
                return jsonify({
                    'msg': 'Server name required',
                    'code': 'ErrMissingServerName'
                }), 400
            
            # Check permissions
            permissions = get_user_permissions(api_user.id, server_name)
            if not permissions.get(permission_key, False):
                return jsonify({
                    'msg': f'Insufficient permissions - {permission_key} required',
                    'code': 'ErrInsufficientPermissions',
                    'metadata': {'required_permission': permission_key}
                }), 403
            
            return f(*args, api_user=api_user, **kwargs)
        return wrapper
    return decorator

@login_manager.user_loader
def load_user(user_id):
    return get_user_by_id(user_id)

# Initialize database
init_db()

# --- OAuth2 Functions ---

def get_oauth_config():
    """Get OAuth2 configuration from config."""
    return {
        'token_expiry': config.get('oauth2_token_expiry', 3600),
        'enabled': config.get('oauth2_enabled', True),
        'jwt_secret': config.get('secret_key')
    }

def create_oauth2_client(user_id, client_name):
    """Create a new OAuth2 client for a user."""
    if not jwt:
        return None, "JWT library not available"
    
    client_id = str(uuid.uuid4())
    client_secret = secrets.token_urlsafe(32)
    client_secret_hash = generate_password_hash(client_secret)
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute('''
            INSERT INTO oauth2_clients (client_id, client_secret_hash, client_name, user_id)
            VALUES (?, ?, ?, ?)
        ''', (client_id, client_secret_hash, client_name, user_id))
        conn.commit()
        conn.close()
        return {'client_id': client_id, 'client_secret': client_secret, 'client_name': client_name}, None
    except sqlite3.IntegrityError as e:
        conn.close()
        return None, str(e)

def validate_client_credentials(client_id, client_secret):
    """Validate OAuth2 client credentials and return user_id if valid."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT client_secret_hash, user_id, client_name 
        FROM oauth2_clients 
        WHERE client_id = ?
    ''', (client_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        return None
    
    client_secret_hash, user_id, client_name = row
    if check_password_hash(client_secret_hash, client_secret):
        return {'user_id': user_id, 'client_id': client_id, 'client_name': client_name}
    return None

def generate_access_token(client_id, user_id):
    """Generate a JWT access token for an OAuth2 client."""
    if not jwt:
        return None
    
    oauth_config = get_oauth_config()
    expires_at = datetime.utcnow() + timedelta(seconds=oauth_config['token_expiry'])
    
    payload = {
        'client_id': client_id,
        'user_id': user_id,
        'exp': expires_at,
        'iat': datetime.utcnow(),
        'type': 'access_token'
    }
    
    token = jwt.encode(payload, oauth_config['jwt_secret'], algorithm='HS256')
    
    # Store token in database
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute('''
            INSERT INTO oauth2_tokens (access_token, client_id, user_id, expires_at)
            VALUES (?, ?, ?, ?)
        ''', (token, client_id, user_id, expires_at.isoformat()))
        conn.commit()
        
        # Update last_used for client
        c.execute('''
            UPDATE oauth2_clients 
            SET last_used = CURRENT_TIMESTAMP 
            WHERE client_id = ?
        ''', (client_id,))
        conn.commit()
        conn.close()
        return token
    except Exception as e:
        conn.close()
        print(f"Error storing token: {e}")
        return None

def validate_access_token(token):
    """Validate a JWT access token and return user object if valid."""
    if not jwt:
        return None
    
    try:
        oauth_config = get_oauth_config()
        payload = jwt.decode(token, oauth_config['jwt_secret'], algorithms=['HS256'])
        
        # Check if token exists in database and is not expired
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''
            SELECT user_id, expires_at 
            FROM oauth2_tokens 
            WHERE access_token = ?
        ''', (token,))
        row = c.fetchone()
        
        if not row:
            conn.close()
            return None
        
        user_id, expires_at_str = row
        expires_at = datetime.fromisoformat(expires_at_str)
        
        if datetime.utcnow() > expires_at:
            # Token expired, delete it
            c.execute('DELETE FROM oauth2_tokens WHERE access_token = ?', (token,))
            conn.commit()
            conn.close()
            return None
        
        conn.close()
        
        # Return user object
        return get_user_by_id(user_id)
        
    except JWTError:
        return None
    except Exception as e:
        print(f"Error validating token: {e}")
        return None

def delete_oauth2_client(client_id, user_id):
    """Delete an OAuth2 client (only if owned by user)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Delete tokens first (foreign key cascade should handle this, but let's be explicit)
    c.execute('DELETE FROM oauth2_tokens WHERE client_id = ?', (client_id,))
    
    # Delete client
    c.execute('DELETE FROM oauth2_clients WHERE client_id = ? AND user_id = ?', (client_id, user_id))
    deleted = c.rowcount
    conn.commit()
    conn.close()
    
    return deleted > 0

def list_oauth2_clients(user_id):
    """List all OAuth2 clients for a user."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT client_id, client_name, created_at, last_used
        FROM oauth2_clients
        WHERE user_id = ?
        ORDER BY created_at DESC
    ''', (user_id,))
    
    clients = [{
        'client_id': row[0],
        'client_name': row[1],
        'created_at': row[2],
        'last_used': row[3]
    } for row in c.fetchall()]
    
    conn.close()
    return clients

def cleanup_expired_tokens():
    """Remove expired tokens from database."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('DELETE FROM oauth2_tokens WHERE expires_at < ?', (datetime.utcnow().isoformat(),))
    deleted = c.rowcount
    conn.commit()
    conn.close()
    return deleted

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

def is_port_in_use(port_to_check, exclude_server_name=None):
    """Checks if a port is already used by another server."""
    if not os.path.isdir(SERVERS_DIR):
        return False
    for server_name in os.listdir(SERVERS_DIR):
        if server_name == exclude_server_name:
            continue
        server_path = os.path.join(SERVERS_DIR, server_name)
        if os.path.isdir(server_path):
            try:
                properties = get_server_properties(server_path)
                if int(properties.get('port', 0)) == int(port_to_check):
                    return True
            except (ValueError, TypeError):
                continue # Ignore if port is not a valid number
    return False

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


# --- Authentication API Endpoints ---

@app.route('/api/auth/setup-required', methods=['GET'])
def setup_required():
    """Check if initial setup is required
    ---
    tags:
      - Authentication
    responses:
      200:
        description: Setup status
        schema:
          type: object
          properties:
            setup_required:
              type: boolean
              description: True if no users exist and setup is needed
    """
    return jsonify({'setup_required': not has_users()})

@app.route('/api/auth/setup', methods=['POST'])
def setup():
    """Create the first admin user
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          required:
            - username
            - password
          properties:
            username:
              type: string
              example: admin
            password:
              type: string
              example: securepassword
              minLength: 6
    responses:
      201:
        description: Admin account created successfully
        schema:
          type: object
          properties:
            message:
              type: string
      400:
        description: Setup already completed or invalid input
      500:
        description: Failed to create user
    """
    if has_users():
        return jsonify({'error': 'Setup already completed'}), 400
    
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long'}), 400
    
    # First user is always an admin
    user_id = create_user(username, password, role='admin', is_active=True)
    if user_id is None:
        return jsonify({'error': 'Failed to create user'}), 500
    
    return jsonify({'message': 'Admin account created successfully'}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User Login
    ---
    tags:
      - Authentication
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          required:
            - username
            - password
          properties:
            username:
              type: string
              example: admin
            password:
              type: string
              example: password123
    responses:
      200:
        description: Login successful
        schema:
          type: object
          properties:
            message:
              type: string
              example: Login successful
            username:
              type: string
            role:
              type: string
      401:
        description: Invalid credentials
      403:
        description: User account is disabled
    """
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    
    user_row = get_user_by_username(username)
    if not user_row:
        return jsonify({'error': 'Invalid username or password'}), 401
    
    user_id, stored_username, password_hash, role, is_active = user_row
    
    # Check if account is active
    if not is_active:
        return jsonify({'error': 'User account is disabled'}), 403
    
    if not check_password_hash(password_hash, password):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    user = User(user_id, stored_username, role, is_active)
    login_user(user)
    
    return jsonify({
        'message': 'Login successful',
        'username': stored_username,
        'role': role
    }), 200

@app.route('/api/auth/logout', methods=['POST'])
@api_auth_required
def logout(api_user=None):
    """User Logout
    ---
    tags:
      - Authentication
    security:
      - Bearer: []
      - Session: []
    parameters:
      - name: Authorization
        in: header
        type: string
        description: Bearer token (optional if using session)
    responses:
      200:
        description: Logout successful
        schema:
          type: object
          properties:
            message:
              type: string
              example: Logout successful
      401:
        description: Authentication required
    """
    logout_user()
    return jsonify({'message': 'Logout successful'}), 200

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check authentication status
    ---
    tags:
      - Authentication
    responses:
      200:
        description: Authentication status
        schema:
          type: object
          properties:
            authenticated:
              type: boolean
            username:
              type: string
            role:
              type: string
    """
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'username': current_user.username,
            'role': getattr(current_user, 'role', 'user'),
            'is_admin': is_admin_user(current_user)
        }), 200
    return jsonify({'authenticated': False}), 200


# --- OAuth2 API Endpoints ---

@app.route('/oauth2/token', methods=['POST'])
def oauth2_token():
    """OAuth2 token endpoint - implements client credentials flow."""
    if not jwt:
        return jsonify({
            'msg': 'OAuth2 functionality not available - JWT library not installed',
            'code': 'ErrOAuth2Unavailable'
        }), 500
    
    oauth_config = get_oauth_config()
    if not oauth_config.get('enabled', True):
        return jsonify({
            'msg': 'OAuth2 is currently disabled',
            'code': 'ErrOAuth2Disabled'
        }), 503
    
    # Get credentials from form data or JSON
    if request.is_json:
        data = request.get_json()
        client_id = data.get('client_id')
        client_secret = data.get('client_secret')
        grant_type = data.get('grant_type')
    else:
        client_id = request.form.get('client_id')
        client_secret = request.form.get('client_secret')
        grant_type = request.form.get('grant_type')
    
    # Validate required parameters
    if not all([client_id, client_secret, grant_type]):
        return jsonify({
            'msg': 'Missing required parameters: client_id, client_secret, and grant_type',
            'code': 'ErrMissingParameters'
        }), 400
    
    # Only support client_credentials grant type
    if grant_type != 'client_credentials':
        return jsonify({
            'msg': 'Unsupported grant type. Only client_credentials is supported',
            'code': 'ErrUnsupportedGrantType',
            'metadata': {'grant_type': grant_type}
        }), 400
    
    # Validate client credentials
    client_info = validate_client_credentials(client_id, client_secret)
    if not client_info:
        return jsonify({
            'msg': 'Invalid client credentials',
            'code': 'ErrInvalidCredentials'
        }), 401
    
    # Generate access token
    token = generate_access_token(client_id, client_info['user_id'])
    if not token:
        return jsonify({
            'msg': 'Failed to generate access token',
            'code': 'ErrTokenGeneration'
        }), 500
    
    return jsonify({
        'access_token': token,
        'token_type': 'Bearer',
        'expires_in': oauth_config['token_expiry']
    }), 200

@app.route('/api/self/oauth2', methods=['GET'])
@api_auth_required
def list_user_oauth2_clients(api_user=None):
    """List all OAuth2 clients for the current user."""
    clients = list_oauth2_clients(api_user.id)
    return jsonify({'clients': clients}), 200

@app.route('/api/self/oauth2', methods=['POST'])
@api_auth_required
def create_user_oauth2_client(api_user=None):
    """Create a new OAuth2 client for the current user."""
    if not jwt:
        return jsonify({
            'msg': 'OAuth2 functionality not available - JWT library not installed',
            'code': 'ErrOAuth2Unavailable'
        }), 500
    
    data = request.get_json() or {}
    client_name = data.get('client_name', '').strip()
    
    if not client_name:
        return jsonify({
            'msg': 'Client name is required',
            'code': 'ErrMissingClientName'
        }), 400
    
    if len(client_name) < 3:
        return jsonify({
            'msg': 'Client name must be at least 3 characters long',
            'code': 'ErrClientNameTooShort'
        }), 400
    
    client_data, error = create_oauth2_client(api_user.id, client_name)
    if error:
        return jsonify({
            'msg': 'Failed to create OAuth2 client',
            'code': 'ErrClientCreation',
            'metadata': {'error': error}
        }), 500
    
    # Return client_id and client_secret (secret shown only once!)
    return jsonify({
        'client_id': client_data['client_id'],
        'client_secret': client_data['client_secret'],
        'client_name': client_data['client_name'],
        'message': 'OAuth2 client created successfully. Save the client_secret now - it will not be shown again!'
    }), 201

@app.route('/api/self/oauth2/<client_id>', methods=['DELETE'])
@api_auth_required
def delete_user_oauth2_client(client_id, api_user=None):
    """Delete an OAuth2 client owned by the current user."""
    success = delete_oauth2_client(client_id, api_user.id)
    
    if not success:
        return jsonify({
            'msg': 'OAuth2 client not found or you do not have permission to delete it',
            'code': 'ErrClientNotFound'
        }), 404
    
    return jsonify({'message': 'OAuth2 client deleted successfully'}), 200

@app.route('/api/self', methods=['GET'])
@api_auth_required
def get_current_user_info(api_user=None):
    """Get current user information."""
    return jsonify({
        'id': api_user.id,
        'username': api_user.username,
        'role': getattr(api_user, 'role', 'user'),
        'is_admin': is_admin_user(api_user)
    }), 200


# --- Admin API Endpoints ---

@app.route('/api/admin/users', methods=['GET'])
@api_require_admin
def list_users(api_user=None):
    """List all users (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, username, role, is_active, created_at FROM users ORDER BY username')
    rows = c.fetchall()
    conn.close()
    
    users = [{
        'id': row[0],
        'username': row[1],
        'role': row[2],
        'is_active': bool(row[3]),
        'created_at': row[4]
    } for row in rows]
    
    return jsonify({'users': users}), 200

@app.route('/api/admin/users', methods=['POST'])
@api_require_admin
def create_user_admin(api_user=None):
    """Create a new user (admin only)."""
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')
    
    if role not in ['admin', 'user']:
        return jsonify({'error': 'Invalid role. Must be admin or user'}), 400
    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long'}), 400
    
    user_id = create_user(username, password, role=role, is_active=True)
    if user_id is None:
        return jsonify({'error': 'Username already exists'}), 409
    
    return jsonify({'id': user_id, 'username': username, 'role': role}), 201

@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@api_require_admin
def update_user_admin(user_id, api_user=None):
    """Update user (admin only)."""
    data = request.get_json() or {}
    role = data.get('role')
    password = data.get('password')
    is_active = data.get('is_active')
    
    updates = []
    params = []
    
    if role is not None:
        if role not in ['admin', 'user']:
            return jsonify({'error': 'Invalid role'}), 400
        updates.append('role = ?')
        params.append(role)
    
    if password:
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters long'}), 400
        updates.append('password_hash = ?')
        params.append(generate_password_hash(password))
    
    if is_active is not None:
        updates.append('is_active = ?')
        params.append(1 if is_active else 0)
    
    if not updates:
        return jsonify({'error': 'No updates provided'}), 400
    
    params.append(user_id)
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute(f'UPDATE users SET {", ".join(updates)} WHERE id = ?', params)
    conn.commit()
    updated = c.rowcount
    conn.close()
    
    if updated == 0:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'message': 'User updated successfully'}), 200

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@api_require_admin
def delete_user_admin(user_id, api_user=None):
    """Delete user (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('DELETE FROM user_group_memberships WHERE user_id = ?', (user_id,))
    c.execute('DELETE FROM user_server_permissions WHERE user_id = ?', (user_id,))
    c.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    deleted = c.rowcount
    conn.close()
    
    if deleted == 0:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'message': 'User deleted successfully'}), 200

@app.route('/api/admin/groups', methods=['GET'])
@api_require_admin
def list_groups(api_user=None):
    """List all groups (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('SELECT id, name, description, created_at FROM user_groups ORDER BY name')
    groups = []
    
    for row in c.fetchall():
        group_id = row[0]
        c.execute('SELECT COUNT(*) FROM user_group_memberships WHERE group_id = ?', (group_id,))
        member_count = c.fetchone()[0]
        groups.append({
            'id': group_id,
            'name': row[1],
            'description': row[2],
            'created_at': row[3],
            'member_count': member_count
        })
    
    conn.close()
    return jsonify({'groups': groups}), 200

@app.route('/api/admin/groups', methods=['POST'])
@api_require_admin
def create_group(api_user=None):
    """Create a new group (admin only)."""
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    description = data.get('description', '').strip()
    
    if not name:
        return jsonify({'error': 'Group name is required'}), 400
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute('INSERT INTO user_groups (name, description) VALUES (?, ?)', (name, description))
        conn.commit()
        group_id = c.lastrowid
        conn.close()
        return jsonify({'id': group_id, 'name': name, 'description': description}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Group name already exists'}), 409

@app.route('/api/admin/groups/<int:group_id>', methods=['PUT'])
@api_require_admin
def update_group(group_id, api_user=None):
    """Update group (admin only)."""
    data = request.get_json() or {}
    name = data.get('name')
    description = data.get('description')
    
    updates = []
    params = []
    
    if name is not None:
        if not name.strip():
            return jsonify({'error': 'Group name cannot be empty'}), 400
        updates.append('name = ?')
        params.append(name.strip())
    
    if description is not None:
        updates.append('description = ?')
        params.append(description.strip())
    
    if not updates:
        return jsonify({'error': 'No updates provided'}), 400
    
    params.append(group_id)
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute(f'UPDATE user_groups SET {", ".join(updates)} WHERE id = ?', params)
        conn.commit()
        updated = c.rowcount
        conn.close()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Group name already exists'}), 409
    
    if updated == 0:
        return jsonify({'error': 'Group not found'}), 404
    return jsonify({'message': 'Group updated successfully'}), 200

@app.route('/api/admin/groups/<int:group_id>', methods=['DELETE'])
@api_require_admin
def delete_group(group_id, api_user=None):
    """Delete group (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('DELETE FROM user_group_memberships WHERE group_id = ?', (group_id,))
    c.execute('DELETE FROM group_server_permissions WHERE group_id = ?', (group_id,))
    c.execute('DELETE FROM user_groups WHERE id = ?', (group_id,))
    conn.commit()
    deleted = c.rowcount
    conn.close()
    
    if deleted == 0:
        return jsonify({'error': 'Group not found'}), 404
    return jsonify({'message': 'Group deleted successfully'}), 200

@app.route('/api/admin/groups/<int:group_id>/members', methods=['GET'])
@api_require_admin
def list_group_members(group_id, api_user=None):
    """List members of a group (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        SELECT u.id, u.username, u.role, ugm.assigned_at
        FROM user_group_memberships ugm
        JOIN users u ON u.id = ugm.user_id
        WHERE ugm.group_id = ?
        ORDER BY u.username
    ''', (group_id,))
    
    members = [{
        'id': row[0],
        'username': row[1],
        'role': row[2],
        'assigned_at': row[3]
    } for row in c.fetchall()]
    
    conn.close()
    return jsonify({'members': members}), 200

@app.route('/api/admin/groups/<int:group_id>/members', methods=['POST'])
@api_require_admin
def add_group_member(group_id, api_user=None):
    """Add user to group (admin only)."""
    data = request.get_json() or {}
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    try:
        c.execute('INSERT INTO user_group_memberships (user_id, group_id) VALUES (?, ?)', (user_id, group_id))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User added to group successfully'}), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'User already in group or invalid IDs'}), 409

@app.route('/api/admin/groups/<int:group_id>/members/<int:user_id>', methods=['DELETE'])
@api_require_admin
def remove_group_member(group_id, user_id, api_user=None):
    """Remove user from group (admin only)."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('DELETE FROM user_group_memberships WHERE group_id = ? AND user_id = ?', (group_id, user_id))
    conn.commit()
    deleted = c.rowcount
    conn.close()
    
    if deleted == 0:
        return jsonify({'error': 'Member not found in group'}), 404
    return jsonify({'message': 'User removed from group successfully'}), 200

@app.route('/api/admin/servers/<server_name>/permissions', methods=['GET'])
@api_require_admin
def get_server_permissions(server_name, api_user=None):
    """Get all permissions for a server (admin only)."""
    if not is_valid_server_name(server_name):
        return jsonify({'error': 'Invalid server name'}), 400
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Get user permissions
    c.execute('''
        SELECT usp.user_id, u.username,
               usp.can_view_logs, usp.can_view_analytics,
               usp.can_start_server, usp.can_stop_server, usp.can_restart_server,
               usp.can_edit_properties, usp.can_edit_files,
               usp.can_manage_backups, usp.can_manage_worlds, usp.can_manage_scheduler,
               usp.can_manage_plugins, usp.can_change_settings,
               usp.can_access_console, usp.can_delete_server
        FROM user_server_permissions usp
        JOIN users u ON u.id = usp.user_id
        WHERE usp.server_name = ?
        ORDER BY u.username
    ''', (server_name,))
    
    user_permissions = [{
        'user_id': row[0],
        'username': row[1],
        'can_view_logs': bool(row[2]),
        'can_view_analytics': bool(row[3]),
        'can_start_server': bool(row[4]),
        'can_stop_server': bool(row[5]),
        'can_restart_server': bool(row[6]),
        'can_edit_properties': bool(row[7]),
        'can_edit_files': bool(row[8]),
        'can_manage_backups': bool(row[9]),
        'can_manage_worlds': bool(row[10]),
        'can_manage_scheduler': bool(row[11]),
        'can_manage_plugins': bool(row[12]),
        'can_change_settings': bool(row[13]),
        'can_access_console': bool(row[14]),
        'can_delete_server': bool(row[15])
    } for row in c.fetchall()]
    
    # Get group permissions
    c.execute('''
        SELECT gsp.group_id, ug.name,
               gsp.can_view_logs, gsp.can_view_analytics,
               gsp.can_start_server, gsp.can_stop_server, gsp.can_restart_server,
               gsp.can_edit_properties, gsp.can_edit_files,
               gsp.can_manage_backups, gsp.can_manage_worlds, gsp.can_manage_scheduler,
               gsp.can_manage_plugins, gsp.can_change_settings,
               gsp.can_access_console, gsp.can_delete_server
        FROM group_server_permissions gsp
        JOIN user_groups ug ON ug.id = gsp.group_id
        WHERE gsp.server_name = ?
        ORDER BY ug.name
    ''', (server_name,))
    
    group_permissions = [{
        'group_id': row[0],
        'name': row[1],
        'can_view_logs': bool(row[2]),
        'can_view_analytics': bool(row[3]),
        'can_start_server': bool(row[4]),
        'can_stop_server': bool(row[5]),
        'can_restart_server': bool(row[6]),
        'can_edit_properties': bool(row[7]),
        'can_edit_files': bool(row[8]),
        'can_manage_backups': bool(row[9]),
        'can_manage_worlds': bool(row[10]),
        'can_manage_scheduler': bool(row[11]),
        'can_manage_plugins': bool(row[12]),
        'can_change_settings': bool(row[13]),
        'can_access_console': bool(row[14]),
        'can_delete_server': bool(row[15])
    } for row in c.fetchall()]
    
    conn.close()
    return jsonify({
        'server_name': server_name,
        'user_permissions': user_permissions,
        'group_permissions': group_permissions
    }), 200

@app.route('/api/admin/servers/<server_name>/permissions/users/<int:user_id>', methods=['PUT'])
@api_require_admin
def set_user_permissions(server_name, user_id, api_user=None):
    """Set user permissions for a server (admin only)."""
    if not is_valid_server_name(server_name):
        return jsonify({'error': 'Invalid server name'}), 400
    
    data = request.get_json() or {}
    
    # Granular permissions
    values = (
        1 if data.get('can_view_logs') else 0,
        1 if data.get('can_view_analytics') else 0,
        1 if data.get('can_start_server') else 0,
        1 if data.get('can_stop_server') else 0,
        1 if data.get('can_restart_server') else 0,
        1 if data.get('can_edit_properties') else 0,
        1 if data.get('can_edit_files') else 0,
        1 if data.get('can_manage_backups') else 0,
        1 if data.get('can_manage_worlds') else 0,
        1 if data.get('can_manage_scheduler') else 0,
        1 if data.get('can_manage_plugins') else 0,
        1 if data.get('can_change_settings') else 0,
        1 if data.get('can_access_console') else 0,
        1 if data.get('can_delete_server') else 0
    )
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO user_server_permissions (
            user_id, server_name,
            can_view_logs, can_view_analytics,
            can_start_server, can_stop_server, can_restart_server,
            can_edit_properties, can_edit_files,
            can_manage_backups, can_manage_worlds, can_manage_scheduler,
            can_manage_plugins, can_change_settings,
            can_access_console, can_delete_server
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, server_name) DO UPDATE SET
            can_view_logs = excluded.can_view_logs,
            can_view_analytics = excluded.can_view_analytics,
            can_start_server = excluded.can_start_server,
            can_stop_server = excluded.can_stop_server,
            can_restart_server = excluded.can_restart_server,
            can_edit_properties = excluded.can_edit_properties,
            can_edit_files = excluded.can_edit_files,
            can_manage_backups = excluded.can_manage_backups,
            can_manage_worlds = excluded.can_manage_worlds,
            can_manage_scheduler = excluded.can_manage_scheduler,
            can_manage_plugins = excluded.can_manage_plugins,
            can_change_settings = excluded.can_change_settings,
            can_access_console = excluded.can_access_console,
            can_delete_server = excluded.can_delete_server
    ''', (user_id, server_name, *values))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'User permissions updated successfully'}), 200

@app.route('/api/admin/servers/<server_name>/permissions/groups/<int:group_id>', methods=['PUT'])
@api_require_admin
def set_group_permissions(server_name, group_id, api_user=None):
    """Set group permissions for a server (admin only)."""
    if not is_valid_server_name(server_name):
        return jsonify({'error': 'Invalid server name'}), 400
    
    data = request.get_json() or {}
    
    # Granular permissions
    values = (
        1 if data.get('can_view_logs') else 0,
        1 if data.get('can_view_analytics') else 0,
        1 if data.get('can_start_server') else 0,
        1 if data.get('can_stop_server') else 0,
        1 if data.get('can_restart_server') else 0,
        1 if data.get('can_edit_properties') else 0,
        1 if data.get('can_edit_files') else 0,
        1 if data.get('can_manage_backups') else 0,
        1 if data.get('can_manage_worlds') else 0,
        1 if data.get('can_manage_scheduler') else 0,
        1 if data.get('can_manage_plugins') else 0,
        1 if data.get('can_change_settings') else 0,
        1 if data.get('can_access_console') else 0,
        1 if data.get('can_delete_server') else 0
    )
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO group_server_permissions (
            group_id, server_name,
            can_view_logs, can_view_analytics,
            can_start_server, can_stop_server, can_restart_server,
            can_edit_properties, can_edit_files,
            can_manage_backups, can_manage_worlds, can_manage_scheduler,
            can_manage_plugins, can_change_settings,
            can_access_console, can_delete_server
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id, server_name) DO UPDATE SET
            can_view_logs = excluded.can_view_logs,
            can_view_analytics = excluded.can_view_analytics,
            can_start_server = excluded.can_start_server,
            can_stop_server = excluded.can_stop_server,
            can_restart_server = excluded.can_restart_server,
            can_edit_properties = excluded.can_edit_properties,
            can_edit_files = excluded.can_edit_files,
            can_manage_backups = excluded.can_manage_backups,
            can_manage_worlds = excluded.can_manage_worlds,
            can_manage_scheduler = excluded.can_manage_scheduler,
            can_manage_plugins = excluded.can_manage_plugins,
            can_change_settings = excluded.can_change_settings,
            can_access_console = excluded.can_access_console,
            can_delete_server = excluded.can_delete_server
    ''', (group_id, server_name, *values))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Group permissions updated successfully'}), 200

@app.route('/api/admin/servers/<server_name>/permissions/users/<int:user_id>', methods=['DELETE'])
@api_require_admin
def delete_user_permissions(server_name, user_id, api_user=None):
    """Remove user permissions for a server (admin only)."""
    if not is_valid_server_name(server_name):
        return jsonify({'error': 'Invalid server name'}), 400
    
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('DELETE FROM user_server_permissions WHERE user_id = ? AND server_name = ?', (user_id, server_name))
    conn.commit()
    deleted = c.rowcount
    conn.close()
    
    if deleted == 0:
        return jsonify({'error': 'Permission entry not found'}), 404
    return jsonify({'message': 'User permissions removed successfully'}), 200

@app.route('/api/user/permissions/<server_name>', methods=['GET'])
@api_auth_required
def get_current_user_permissions(server_name, api_user=None):
    """Get current user's permissions for a server."""
    if not is_valid_server_name(server_name):
        return jsonify({'error': 'Invalid server name'}), 400
    
    if is_admin_user(api_user):
        # Admins have all permissions
        permissions = {
            'can_view_logs': True,
            'can_view_analytics': True,
            'can_start_server': True,
            'can_stop_server': True,
            'can_restart_server': True,
            'can_edit_properties': True,
            'can_edit_files': True,
            'can_manage_backups': True,
            'can_manage_worlds': True,
            'can_manage_scheduler': True,
            'can_manage_plugins': True,
            'can_change_settings': True,
            'can_access_console': True,
            'can_delete_server': True
        }
    else:
        permissions = get_user_permissions(api_user.id, server_name)
    
    return jsonify(permissions), 200


# --- API Endpoints ---

@app.route('/api/servers/<server_name>', methods=['GET'])
@api_auth_required
def get_server_details(server_name, api_user=None):
    """Gets all details for a single server."""
    # Basic sanitization for the server name itself
    if not is_valid_server_name(server_name):
        return jsonify({"error": "Invalid server name format"}), 400
    
    # Allow access if user is admin OR has any viewing permission (old or new)
    if not is_admin_user(api_user):
        permissions = get_user_permissions(api_user.id, server_name)
        has_any_view_permission = (
            permissions.get('can_view_logs', False) or 
            permissions.get('can_view_analytics', False) or
            permissions.get('can_view', False)
        )
        if not has_any_view_permission:
            return jsonify({'error': 'You do not have permission to view this server'}), 403

    server_path = os.path.join(SERVERS_DIR, server_name)
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
        'eula_accepted': os.path.exists(os.path.join(server_path, 'eula.txt')),
        'loader': metadata.get('loader', 'vanilla')
    }
    
    return jsonify(details)


@app.route('/api/servers/<server_name>/port', methods=['POST'])
@api_require_permission('can_edit_config')
def update_server_port(server_name, api_user=None):
    """Updates the server port in the server.properties file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    data = request.get_json()
    try:
        new_port = int(data.get('port'))
        if not (1024 <= new_port <= 65535):
            raise ValueError("Port out of range")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid port number provided. Must be a number between 1024 and 65535."}), 400

    if is_port_in_use(new_port, exclude_server_name=server_name):
        return jsonify({"error": f"Port {new_port} is already in use by another server."}), 409

    props_file = os.path.join(server_path, 'server.properties')
    
    try:
        lines = []
        port_updated = False
        # Create file with default motd if it doesn't exist
        if not os.path.exists(props_file):
            with open(props_file, 'w') as f:
                f.write("motd=Powered by MineKeks Dashboard\n")
                f.write(f"server-port={new_port}\n")
            return jsonify({"message": f"server.properties created and port set to {new_port}."})

        with open(props_file, 'r') as f:
            lines = f.readlines()

        with open(props_file, 'w') as f:
            for line in lines:
                if line.strip().startswith('server-port='):
                    f.write(f"server-port={new_port}\n")
                    port_updated = True
                else:
                    f.write(line)
            
            if not port_updated:
                f.write(f"\nserver-port={new_port}\n")

        return jsonify({"message": f"Server port updated to {new_port}."}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to update server.properties: {e}"}), 500


@app.route('/api/servers', methods=['GET', 'POST'])
@api_auth_required
def handle_servers(api_user=None):
    """List or Create Minecraft Servers
    ---
    tags:
      - Servers
    security:
      - Bearer: []
      - Session: []
    parameters:
      - name: Authorization
        in: header
        type: string
        description: Bearer token (optional if using session)
      - name: body
        in: body
        required: false
        description: Required only for POST requests to create a new server
        schema:
          type: object
          required:
            - server_name
            - version
            - eula_accepted
            - server_type
          properties:
            server_name:
              type: string
              pattern: "^[a-zA-Z0-9_-]+$"
              example: my-server
            version:
              type: string
              example: "1.20.1"
            port:
              type: integer
              default: 25565
              example: 25565
            eula_accepted:
              type: boolean
              description: Must be true to accept Minecraft EULA
              example: true
            server_type:
              type: string
              enum: [vanilla, paper, spigot, fabric, forge]
              example: paper
    responses:
      200:
        description: List of servers (GET request)
        schema:
          type: array
          items:
            type: object
            properties:
              id:
                type: string
              name:
                type: string
              version:
                type: string
              port:
                type: integer
              server_type:
                type: string
              status:
                type: string
                enum: [Running, Stopped]
      201:
        description: Server created successfully (POST request)
        schema:
          type: object
          properties:
            message:
              type: string
      400:
        description: Invalid input or missing required fields
      401:
        description: Authentication required
      403:
        description: Admin access required to create servers
      409:
        description: Server name or port already in use
      500:
        description: Server creation failed
    """
    if request.method == 'POST':
        # Only admins can create servers
        if not is_admin_user(api_user):
            return jsonify({'error': 'Admin access required to create servers'}), 403
        
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
        
        # Ensure servers directory exists (and fail with JSON if not possible)
        try:
            os.makedirs(SERVERS_DIR, exist_ok=True)
        except Exception as e:
            return jsonify({'error': f"Servers directory is not accessible: {e}"}), 500

        if is_port_in_use(port):
            return jsonify({"error": f"Port {port} is already in use."}), 409
        
        server_path = os.path.join(SERVERS_DIR, server_name)
        if os.path.exists(server_path):
            return jsonify({'error': 'A server with this name already exists'}), 409

        try:
            os.makedirs(server_path)
            with open(os.path.join(server_path, 'eula.txt'), 'w') as f: f.write('eula=true\n')
            with open(os.path.join(server_path, 'server.properties'), 'w') as f: f.write(f'server-port={port}\nmotd=Powered by Dashboard\n')
            write_server_metadata(server_path, {'version': version, 'server_type': server_type})
            
            # --- Add default start script ---
            # Ensure the server-specific config directory exists
            server_config_dir = get_server_config_dir(server_name)
            os.makedirs(server_config_dir, exist_ok=True)
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
    if not os.path.exists(SERVERS_DIR):
        return jsonify([])

    for server_name in os.listdir(SERVERS_DIR):
        server_path = os.path.join(SERVERS_DIR, server_name)
        if os.path.isdir(server_path):
            # Filter servers based on permissions (admins see all)
            if is_admin_user(api_user):
                has_access = True
            else:
                permissions = get_user_permissions(api_user.id, server_name)
                # User needs at least one viewing permission to see the server
                has_access = (permissions.get('can_view_logs', False) or 
                            permissions.get('can_view_analytics', False) or
                            permissions.get('can_view', False))
            
            if has_access:
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
@api_auth_required
def server_action(server_name, action, api_user=None):
    """Start, Stop, or Restart a Minecraft Server
    ---
    tags:
      - Servers
    security:
      - Bearer: []
      - Session: []
    parameters:
      - name: server_name
        in: path
        type: string
        required: true
        description: Name of the Minecraft server
      - name: action
        in: path
        type: string
        required: true
        enum: [start, stop, restart]
        description: Action to perform on the server
      - name: Authorization
        in: header
        type: string
        description: Bearer token (optional if using session)
    responses:
      200:
        description: Action completed successfully
        schema:
          type: object
          properties:
            message:
              type: string
      400:
        description: Invalid action specified
      401:
        description: Authentication required
      403:
        description: Insufficient permissions for this action
      404:
        description: Server not found
      500:
        description: Action failed
    """
    # Check granular permissions based on specific action
    if not is_admin_user(api_user):
        permissions = get_user_permissions(api_user.id, server_name)
        
        if action == 'start':
            if not (permissions.get('can_start_server', False) or permissions.get('can_start_stop', False)):
                return jsonify({'error': 'You do not have permission to start this server'}), 403
        elif action == 'stop':
            if not (permissions.get('can_stop_server', False) or permissions.get('can_start_stop', False)):
                return jsonify({'error': 'You do not have permission to stop this server'}), 403
        elif action == 'restart':
            if not (permissions.get('can_restart_server', False) or permissions.get('can_start_stop', False)):
                return jsonify({'error': 'You do not have permission to restart this server'}), 403
        else:
            return jsonify({'error': 'Invalid action specified'}), 400
    
    if action == 'start':
        result, status_code = start_server(server_name)
        return jsonify(result), status_code
    
    elif action == 'stop':
        result, status_code = stop_server(server_name)
        return jsonify(result), status_code
        
    elif action == 'restart':
        result, status_code = restart_server_logic(server_name)
        return jsonify(result), status_code

    return jsonify({'error': 'Invalid action specified'}), 400


@app.route('/api/servers/<server_name>/clear-logs', methods=['POST'])
@api_require_permission('can_edit_config')
def clear_logs(server_name, api_user=None):
    """Clears the server's log file and resets the log counter."""
    server_path = os.path.join(SERVERS_DIR, server_name)
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
        ##if is_server_running(server_name):
        ##    screen_session_name = get_screen_session_name(server_name)
        ##    base_command = ['wsl'] if sys.platform == "win32" else []
        ##    clear_cmd = base_command + ['screen', '-S', screen_session_name, '-p', '0', '-X', 'stuff', "clear\n"]
        ##    try:
        ##        subprocess.run(clear_cmd, check=True)
        ##    except Exception as e:
        ##        print(f"Error clearing screen: {e}")
        ##        # Continue even if screen clear fails
                
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
@api_auth_required
def list_files(server_name, api_user=None):
    """Lists files and folders in a given path."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    relative_path = request.args.get('path', '')
    safe_path = sanitize_path(server_path, relative_path)

    if not os.path.isdir(safe_path):
        return jsonify({"error": "Path is not a directory or does not exist"}), 400

    items = []
    for item_name in sorted(os.listdir(safe_path)):
        item_path = os.path.join(safe_path, item_name)
        is_dir = os.path.isdir(item_path)
        item_details = {
            'name': item_name,
            'path': os.path.join(relative_path, item_name).replace('\\', '/'),
            'is_directory': is_dir
        }
        if not is_dir:
            try:
                # Get file size in bytes
                item_details['size'] = os.path.getsize(item_path)
            except OSError:
                # If size can't be read, default to 0
                item_details['size'] = 0
        
        items.append(item_details)
    return jsonify(items)

@app.route('/api/servers/<server_name>/files/content', methods=['GET', 'POST'])
@api_auth_required
def handle_file_content(server_name, api_user=None):
    """Gets or saves the content of a file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
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
    server_config_dir = os.path.join(CONFIGS_DIR, server_name)
    return os.path.join(server_config_dir, 'install_script.json')

@app.route('/api/servers/<server_name>/install-script', methods=['GET', 'POST'])
@api_auth_required
def handle_install_script(server_name, api_user=None):
    script_path = get_install_script_path(server_name)
    # Ensure the directory exists before trying to write to it
    os.makedirs(os.path.dirname(script_path), exist_ok=True)
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
    server_config_dir = os.path.join(CONFIGS_DIR, server_name)
    return os.path.join(server_config_dir, 'start_script.json')

@app.route('/api/servers/<server_name>/start-script', methods=['GET', 'POST'])
@api_auth_required
def handle_start_script(server_name, api_user=None):
    script_path = get_start_script_path(server_name)
    # Ensure the directory exists before trying to write to it
    os.makedirs(os.path.dirname(script_path), exist_ok=True)
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
@api_auth_required
def run_install_script(server_name, api_user=None):
    """Runs the installation script for a server."""
    server_path = os.path.join(SERVERS_DIR, server_name)
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
@api_auth_required
def get_install_log(server_name, api_user=None):
    """Retrieves the current installation log for a server."""
    return jsonify({"log": ["This endpoint is deprecated. Check the main log file."]})


@app.route('/api/servers/<server_name>/status', methods=['GET'])
@api_auth_required
def get_server_status(server_name, api_user=None):
    """Get Server Status
    ---
    tags:
      - Servers
    security:
      - Bearer: []
      - Session: []
    parameters:
      - name: server_name
        in: path
        type: string
        required: true
        description: Name of the Minecraft server
      - name: Authorization
        in: header
        type: string
        description: Bearer token (optional if using session)
    responses:
      200:
        description: Server status information
        schema:
          type: object
          properties:
            status:
              type: string
              enum: [Running, Stopped]
            players_online:
              type: string
              description: Number of players online or N/A
            max_players:
              type: string
              description: Maximum players or N/A
            ping:
              type: string
              description: Server ping or N/A
            cpu_usage:
              type: string
              description: CPU usage or N/A
            memory_usage:
              type: string
              description: Memory usage or N/A
      401:
        description: Authentication required
      404:
        description: Server not found
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
@api_require_permission('can_access_console')
def handle_console(server_name, api_user=None):
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
@api_auth_required
def get_server_log(server_name, api_user=None):
    """Tails the server's latest.log file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    log_file_path = os.path.join(server_path, 'logs', 'latest.log')

    #if not os.path.exists(log_file_path):
    #    return jsonify({"lines": ["Log file not found. It will be created when the server starts."], "line_count": 1})

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
@api_auth_required
def handle_settings(api_user=None):
    """Handles getting and saving application settings."""
    global SERVERS_DIR, config
    if request.method == 'POST':
        data = request.get_json()
        new_path = data.get('servers_dir')

        if not new_path or not os.path.isdir(new_path):
            return jsonify({"error": "Invalid or non-existent directory provided."}), 400

        # Update config and save
        config['servers_dir'] = new_path
        save_config(config)

        # Update the global variable for the current session
        SERVERS_DIR = new_path
        
        # You might need to restart the app or dynamically reload resources
        # for this change to be fully effective everywhere.
        return jsonify({"message": "Settings updated. A restart may be required for all changes to take effect."})

    # GET request
    return jsonify(config)

@app.route('/api/browse', methods=['GET'])
@api_auth_required
def browse_files(api_user=None):
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
@api_auth_required
def install_java(server_name, api_user=None):
    """
    Downloads and extracts a specific JDK version for a server.
    The output is streamed to the installation log.
    """
    server_path = os.path.join(SERVERS_DIR, server_name)
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
@api_require_permission('can_delete')
def delete_server(server_name, api_user=None):
    """Deletes a server after stopping it."""
    server_path = os.path.join(SERVERS_DIR, server_name)
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
        # Also delete the server's config directory
        server_config_path = os.path.join(CONFIGS_DIR, server_name)
        if os.path.isdir(server_config_path):
            shutil.rmtree(server_config_path)
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
    server_path = os.path.join(SERVERS_DIR, server_name)
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

@app.route('/api/servers/<server_name>/files/delete', methods=['POST'])
@api_auth_required
def delete_files(server_name, api_user=None):
    """Deletes a list of files and/or folders."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    data = request.get_json()
    paths_to_delete = data.get('paths', [])
    if not paths_to_delete:
        return jsonify({"error": "No paths provided for deletion"}), 400

    errors = []
    success_count = 0
    for relative_path in paths_to_delete:
        try:
            safe_path = sanitize_path(server_path, relative_path)
            if os.path.exists(safe_path):
                if os.path.isdir(safe_path):
                    shutil.rmtree(safe_path)
                else:
                    os.remove(safe_path)
                success_count += 1
            else:
                errors.append(f"Path not found: {relative_path}")
        except Exception as e:
            errors.append(f"Could not delete {relative_path}: {e}")

    if errors:
        return jsonify({
            "error": f"Completed with {len(errors)} errors.",
            "details": errors,
            "success_count": success_count
        }), 500
    
    return jsonify({"message": f"Successfully deleted {success_count} items."})

@app.route('/api/servers/<server_name>/files/rename', methods=['POST'])
@api_auth_required
def rename_file(server_name, api_user=None):
    """Renames a file or folder."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
        
    data = request.get_json()
    relative_path = data.get('path')
    new_name = data.get('new_name')

    if not all([relative_path, new_name]):
        return jsonify({"error": "Both 'path' and 'new_name' are required."}), 400

    if '/' in new_name or '\\' in new_name or '..' in new_name:
        return jsonify({"error": "Invalid characters in new name."}), 400
        
    try:
        old_safe_path = sanitize_path(server_path, relative_path)
        if not os.path.exists(old_safe_path):
            return jsonify({"error": "File or folder not found."}), 404
            
        new_safe_path = os.path.join(os.path.dirname(old_safe_path), new_name)
        
        if os.path.exists(new_safe_path):
            return jsonify({"error": "A file or folder with that name already exists."}), 409
            
        os.rename(old_safe_path, new_safe_path)
        return jsonify({"message": "Renamed successfully."})
        
    except Exception as e:
        return jsonify({"error": f"Failed to rename: {e}"}), 500

@app.route('/api/servers/<server_name>/reapply-eula', methods=['POST'])
@api_auth_required
def reapply_eula(server_name, api_user=None):
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({'error': 'Server not found'}), 404

    try:
        eula_path = os.path.join(server_path, 'eula.txt')
        with open(eula_path, 'w') as f:
            f.write('eula=true\n')
        return jsonify({'message': 'EULA re-applied successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/screens', methods=['GET'])
@api_auth_required
def list_screens(api_user=None):
    try:
        # We use 'S' instead of 's' in the command to get the full socket name
        result = subprocess.run(['screen', '-ls'], capture_output=True, text=True, check=True)
        output = result.stdout
        screens = []
        # A more robust regex to capture PID, name, and date
        for line in output.splitlines():
            match = re.search(r'\t(\d+)\.(.*?)\t\((.*?)\)', line)
            if match:
                pid, name, details = match.groups()
                screens.append({'pid': pid, 'name': name, 'details': details})
        return jsonify(screens)
    except FileNotFoundError:
        # This handles the case where 'screen' is not installed
        return jsonify({'error': 'screen command not found. Is GNU Screen installed and in your PATH?'}), 500
    except subprocess.CalledProcessError as e:
        # This handles cases where screen -ls returns a non-zero exit code (e.g., no screens running)
        if "No Sockets found" in e.stdout or "No Sockets found" in e.stderr:
            return jsonify([]) # Return an empty list if no screens are running
        return jsonify({'error': f"Failed to list screens: {e.stderr}"}), 500

@app.route('/api/screens/terminate-all', methods=['POST'])
@api_auth_required
def terminate_all_screens(api_user=None):
    try:
        # This command gracefully terminates all screen sessions
        subprocess.run(['pkill', 'screen'], check=True)
        return jsonify({'message': 'All screen sessions terminated.'})
    except FileNotFoundError:
        return jsonify({'error': 'pkill command not found. Is pkill installed?'}), 500
    except subprocess.CalledProcessError as e:
        # pkill returns 1 if no processes were matched, which isn't a failure in our case.
        if e.returncode == 1:
            return jsonify({'message': 'No active screen sessions to terminate.'})
        return jsonify({'error': f"Failed to terminate screens: {e.stderr}"}), 500

@app.route('/api/ui/config', methods=['GET'])
def get_ui_config():
    """Get public UI configuration (no auth required)
    ---
    tags:
      - Settings
    responses:
      200:
        description: UI configuration for frontend
        schema:
          type: object
          properties:
            panorama_intensity:
              type: number
              description: Intensity of panorama background effect
    """
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        # Return only non-sensitive UI config values
        return jsonify({
            'panorama_intensity': config.get('panorama_intensity', 1.5)
        })
    except FileNotFoundError:
        return jsonify({'panorama_intensity': 1.5}), 200
    except Exception as e:
        return jsonify({'panorama_intensity': 1.5}), 200

@app.route('/api/config', methods=['GET'])
@api_auth_required
def get_config(api_user=None):
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        return jsonify(config)
    except FileNotFoundError:
        return jsonify({'error': 'Config file not found.'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config', methods=['POST'])
@api_auth_required
def save_config_endpoint(api_user=None):
    global SERVERS_DIR, CONFIGS_DIR

    old_config = config.copy()
    new_config_data = request.get_json()

    old_servers_dir = old_config.get('servers_dir')
    new_servers_dir = new_config_data.get('servers_dir')
    
    old_configs_dir = old_config.get('configs_dir')
    new_configs_dir = new_config_data.get('configs_dir')

    # --- Handle Servers Directory Change ---
    if new_servers_dir and new_servers_dir != old_servers_dir:
        try:
            if not os.path.exists(new_servers_dir):
                os.makedirs(new_servers_dir)
            
            if os.path.isdir(old_servers_dir):
                print(f"Moving server files from {old_servers_dir} to {new_servers_dir}")
                for item in os.listdir(old_servers_dir):
                    s = os.path.join(old_servers_dir, item)
                    d = os.path.join(new_servers_dir, item)
                    if os.path.isdir(s):
                        shutil.copytree(s, d, dirs_exist_ok=True)
                    else:
                        shutil.copy2(s, d)
                shutil.rmtree(old_servers_dir)
            
            SERVERS_DIR = new_servers_dir
            config['servers_dir'] = new_servers_dir
        except Exception as e:
            # Revert on failure
            config['servers_dir'] = old_servers_dir
            return jsonify({"error": f"Failed to move servers directory: {e}"}), 500
        
    # --- Handle Configs Directory Change ---
    if new_configs_dir and new_configs_dir != old_configs_dir:
        try:
            if not os.path.exists(new_configs_dir):
                os.makedirs(new_configs_dir)
            
            if os.path.isdir(old_configs_dir):
                print(f"Moving config files from {old_configs_dir} to {new_configs_dir}")
                for item in os.listdir(old_configs_dir):
                    s = os.path.join(old_configs_dir, item)
                    d = os.path.join(new_configs_dir, item)
                    if os.path.isdir(s):
                        shutil.copytree(s, d, dirs_exist_ok=True)
                    else:
                        shutil.copy2(s, d)
                shutil.rmtree(old_configs_dir)

            CONFIGS_DIR = new_configs_dir
            config['configs_dir'] = new_configs_dir
        except Exception as e:
            # Revert this part of the change if it fails
            config['configs_dir'] = old_configs_dir
            # Also revert the servers dir change if it happened in the same request
            config['servers_dir'] = old_servers_dir
            return jsonify({"error": f"Failed to move config directory: {e}"}), 500

    save_config(config)
    # Update global vars after successful save
    SERVERS_DIR = config['servers_dir']
    CONFIGS_DIR = config['configs_dir']
    return jsonify({'message': 'Settings saved successfully.'})

@app.route('/api/minecraft/versions', methods=['GET'])
@api_auth_required
def get_minecraft_versions(api_user=None):
    try:
        url = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
        response = requests.get(url)
        response.raise_for_status()
        manifest = response.json()
        
        # We're only interested in 'release' versions for stability
        versions = [v['id'] for v in manifest['versions'] if v['type'] == 'release']
        return jsonify(versions)
    except requests.RequestException as e:
        return jsonify({'error': f"Failed to fetch version manifest: {e}"}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/loaders/<loader>/versions')
@api_auth_required
def get_loader_versions(loader, api_user=None):
    try:
        if loader == 'vanilla':
            url = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
            response = requests.get(url)
            response.raise_for_status()
            manifest = response.json()
            versions = [v['id'] for v in manifest['versions'] if v['type'] == 'release']
            return jsonify(versions)
        elif loader in ['paper', 'purpur']:
            url = f"https://api.papermc.io/v2/projects/{loader}" if loader == 'paper' else f"https://api.purpurmc.org/v2/{loader}"
            response = requests.get(url)
            response.raise_for_status()
            versions_data = response.json()
            return jsonify(versions_data['versions'])
        elif loader in ['fabric', 'quilt']:
            # For Fabric and Quilt, we just get the main Minecraft versions they support
            url = "https://meta.fabricmc.net/v2/versions/game"
            response = requests.get(url)
            response.raise_for_status()
            # We are interested in stable releases
            versions = [v['version'] for v in response.json() if v['stable']]
            return jsonify(versions)
        elif loader in ['forge', 'neoforge']:
            # Forge/NeoForge versioning is more complex, often tied to Minecraft version.
            # For simplicity, we'll return Minecraft versions, and fetch the latest build for it.
            url = "https://meta.fabricmc.net/v2/versions/game"
            response = requests.get(url)
            response.raise_for_status()
            versions = [v['version'] for v in response.json() if v['stable']]
            return jsonify(versions)
        else:
            return jsonify({'error': 'Unsupported loader'}), 400
    except requests.RequestException as e:
        return jsonify({'error': f"Failed to fetch versions for {loader}: {e}"}), 500

@app.route('/api/servers/<server_name>/change-software', methods=['POST'])
@api_auth_required
def change_server_software(server_name, api_user=None):
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({'error': 'Server not found'}), 404

    data = request.get_json()
    loader = data.get('loader', 'vanilla')
    version = data.get('version')
    if not version:
        return jsonify({'error': 'Version not specified'}), 400

    try:
        jar_path = os.path.join(server_path, 'server.jar')
        if os.path.exists(jar_path):
            os.remove(jar_path)

        download_url = None
        if loader == 'vanilla':
            manifest_url = "https://launchermeta.mojang.com/mc/game/version_manifest.json"
            manifest_res = requests.get(manifest_url)
            manifest_res.raise_for_status()
            manifest = manifest_res.json()
            version_info = next((v for v in manifest['versions'] if v['id'] == version), None)
            if not version_info:
                return jsonify({'error': 'Specified version not found in manifest'}), 404
            
            version_url = version_info['url']
            version_data_res = requests.get(version_url)
            version_data_res.raise_for_status()
            version_data = version_data_res.json()
            download_url = version_data['downloads']['server']['url']
        
        elif loader == 'paper':
            build_url = f"https://api.papermc.io/v2/projects/paper/versions/{version}/builds"
            build_res = requests.get(build_url)
            build_res.raise_for_status()
            latest_build = build_res.json()['builds'][-1]
            build_number = latest_build['build']
            jar_name = latest_build['downloads']['application']['name']
            download_url = f"https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{build_number}/downloads/{jar_name}"
        
        elif loader == 'purpur':
            build_url = f"https://api.purpurmc.org/v2/purpur/{version}"
            build_res = requests.get(build_url)
            build_res.raise_for_status()
            latest_build = build_res.json()['builds']['latest']
            download_url = f"https://api.purpurmc.org/v2/purpur/{version}/{latest_build}/download"

        elif loader in ['fabric', 'quilt', 'forge', 'neoforge']:
            # These loaders use installers, which is more complex than a simple download.
            # For now, we'll just log that it's not a direct download.
            # The actual installation logic for these should be a separate, more involved function.
            print(f"Note: '{loader}' uses an installer. A simple JAR download is not sufficient.")
            return jsonify({'error': f"'{loader}' installation via this method is not yet supported. Please create a new server for now."}), 501

        if not download_url:
            return jsonify({'error': f"Could not find a download for {loader} {version}"}), 404

        download_res = requests.get(download_url, stream=True)
        download_res.raise_for_status()
        
        with open(jar_path, 'wb') as f:
            for chunk in download_res.iter_content(chunk_size=8192):
                f.write(chunk)
        
        metadata_path = os.path.join(server_path, '.metadata')
        metadata = {}
        if os.path.exists(metadata_path):
            with open(metadata_path, 'r') as f:
                try:
                    metadata = json.load(f)
                except json.JSONDecodeError:
                    pass # Overwrite if invalid json
        
        metadata['version'] = version
        metadata['loader'] = loader
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=4)

        return jsonify({'message': f'Server software changed to {loader} {version} successfully.'})

    except requests.RequestException as e:
        return jsonify({'error': f"Failed to download new version: {e}"}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/servers/<server_name>/files/upload', methods=['POST'])
@api_auth_required
def upload_files(server_name, api_user=None):
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404

    path = request.form.get('path', '.')
    destination_path = os.path.join(server_path, path)

    if not os.path.isdir(destination_path):
        return jsonify({'error': 'Destination directory does not exist'}), 400

    files = request.files.getlist('files[]')
    
    if not files or (len(files) == 1 and files[0].filename == ''):
        return jsonify({'error': 'No selected files'}), 400

    try:
        uploaded_count = 0
        for file in files:
            if file and file.filename:
                filename = secure_filename(file.filename)
                file.save(os.path.join(destination_path, filename))
                uploaded_count += 1
        return jsonify({'message': f'{uploaded_count} file(s) uploaded successfully to {path}'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_server_config_dir(server_name):
    """Helper to get the config directory for a specific server."""
    return os.path.join(CONFIGS_DIR, server_name)

def migrate_scripts_to_configs_dir():
    """
    One-time migration to move scripts from inside server folders
    to the centralized configs directory.
    """
    if not os.path.isdir(SERVERS_DIR):
        print("Migration skipped: Servers directory does not exist.")
        return

    print("Checking for script migration...")
    for server_name in os.listdir(SERVERS_DIR):
        server_path = os.path.join(SERVERS_DIR, server_name)
        if os.path.isdir(server_path):
            old_start_script = os.path.join(server_path, 'start_script.json')
            old_install_script = os.path.join(server_path, 'install_script.json')

            if os.path.exists(old_start_script) or os.path.exists(old_install_script):
                print(f"Found old scripts for server '{server_name}'. Migrating...")
                new_config_dir = get_server_config_dir(server_name)
                os.makedirs(new_config_dir, exist_ok=True)
                
                if os.path.exists(old_start_script):
                    shutil.move(old_start_script, os.path.join(new_config_dir, 'start_script.json'))
                    print(f" - Moved start_script.json for {server_name}")
                if os.path.exists(old_install_script):
                    shutil.move(old_install_script, os.path.join(new_config_dir, 'install_script.json'))
                    print(f" - Moved install_script.json for {server_name}")
    
    # Mark migration as complete
    config['migrated_scripts_to_config_dir'] = True
    save_config(config)
    print("Script migration check complete.")

def parse_properties(file_path):
    """Parses a .properties file into a dictionary, preserving the order."""
    properties = {}
    if not os.path.exists(file_path):
        return properties
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    properties[key.strip()] = value.strip()
    return properties

@app.route('/api/servers/<server_name>/properties', methods=['GET'])
@api_require_permission('can_view')
def get_server_properties_endpoint(server_name, api_user=None):
    """Gets the full server.properties file as a JSON object."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    props_file = os.path.join(server_path, 'server.properties')
    if not os.path.exists(props_file):
        return jsonify({}) # Return empty object if no properties file
        
    properties = parse_properties(props_file)
    return jsonify(properties)

@app.route('/api/servers/<server_name>/properties', methods=['POST'])
@api_require_permission('can_edit_config')
def save_server_properties_endpoint(server_name, api_user=None):
    """Updates the server.properties file from a JSON object."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
        
    new_props = request.get_json()
    if not new_props:
        return jsonify({"error": "No properties data provided"}), 400

    props_file = os.path.join(server_path, 'server.properties')
    
    if not os.path.exists(props_file):
        with open(props_file, 'w', encoding='utf-8') as f:
            for key, value in new_props.items():
                f.write(f"{key}={value}\n")
        return jsonify({"message": "server.properties created and saved."})

    try:
        with open(props_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        with open(props_file, 'w', encoding='utf-8') as f:
            updated_keys = set(new_props.keys())
            for line in lines:
                stripped_line = line.strip()
                if not stripped_line.startswith('#') and '=' in stripped_line:
                    key = stripped_line.split('=', 1)[0].strip()
                    if key in new_props:
                        f.write(f"{key}={new_props[key]}\n")
                        updated_keys.discard(key)
                    else:
                        f.write(line)
                else:
                    f.write(line)
            
            for key in updated_keys:
                f.write(f"{key}={new_props[key]}\n")

        return jsonify({"message": "Server properties updated successfully."})
    except Exception as e:
        return jsonify({"error": f"Failed to write to server.properties: {e}"}), 500

# --- Backup Management ---
BACKUP_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backups.json')
scheduler = BackgroundScheduler(daemon=True)

class BackupManager:
    def __init__(self):
        self.config = self._load_config()

    def _load_config(self):
        if not os.path.exists(BACKUP_CONFIG_FILE):
            return {}
        try:
            with open(BACKUP_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _save_config(self):
        with open(BACKUP_CONFIG_FILE, 'w') as f:
            json.dump(self.config, f, indent=4)

    def get_server_backup_config(self, server_name):
        return self.config.get(server_name, {
            "location": "",
            "frequency": "disabled",
            "retention": 7
        })

    def update_server_backup_config(self, server_name, settings):
        self.config[server_name] = {
            "location": settings.get("location", ""),
            "frequency": settings.get("frequency", "disabled"),
            "retention": int(settings.get("retention", 7))
        }
        self._save_config()
        self.schedule_backup(server_name)

    def run_backup(self, server_name):
        server_config = self.get_server_backup_config(server_name)
        if server_config["frequency"] == "disabled" or not server_config["location"]:
            print(f"Backup for '{server_name}' is disabled or location is not set. Skipping.")
            return

        server_path = os.path.join(SERVERS_DIR, server_name)
        backup_dir = server_config["location"]
        retention = server_config["retention"]
        
        os.makedirs(backup_dir, exist_ok=True)
        
        timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
        backup_filename = f"{server_name}_{timestamp}.zip"
        backup_filepath = os.path.join(backup_dir, backup_filename)
        
        print(f"Starting backup for '{server_name}' to '{backup_filepath}'...")
        try:
            with zipfile.ZipFile(backup_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, _, files in os.walk(server_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        # Exclude backup files from the backup itself to prevent recursion
                        if not file_path.startswith(backup_dir):
                            zipf.write(file_path, os.path.relpath(file_path, server_path))
            
            print(f"Backup for '{server_name}' completed successfully.")
            self.enforce_retention(backup_dir, retention)
        except Exception as e:
            print(f"Error during backup for '{server_name}': {e}")

    def enforce_retention(self, backup_dir, retention):
        try:
            backups = sorted(
                [os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.endswith('.zip')],
                key=os.path.getmtime
            )
            
            if len(backups) > retention:
                backups_to_delete = backups[:len(backups) - retention]
                for backup in backups_to_delete:
                    os.remove(backup)
                    print(f"Deleted old backup: {backup}")
        except Exception as e:
            print(f"Error enforcing retention policy: {e}")

    def schedule_backup(self, server_name):
        job_id = f"backup_{server_name}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)

        server_config = self.get_server_backup_config(server_name)
        frequency = server_config["frequency"]
        
        trigger = None
        if frequency == 'daily':
            trigger = CronTrigger(hour=3) # 3 AM daily
        elif frequency == 'weekly':
            trigger = CronTrigger(day_of_week='sun', hour=3) # 3 AM every Sunday
        elif frequency == 'monthly':
            trigger = CronTrigger(day=1, hour=3) # 3 AM on the 1st of the month

        if trigger:
            scheduler.add_job(
                self.run_backup,
                trigger=trigger,
                args=[server_name],
                id=job_id,
                replace_existing=True
            )
            print(f"Scheduled backup for '{server_name}' ({frequency}).")

backup_manager = BackupManager()

@app.route('/api/servers/<server_name>/backups/settings', methods=['GET'])
@api_auth_required
def get_backup_settings(server_name, api_user=None):
    return jsonify(backup_manager.get_server_backup_config(server_name))

@app.route('/api/servers/<server_name>/backups/settings', methods=['POST'])
@api_auth_required
def save_backup_settings(server_name, api_user=None):
    settings = request.get_json()
    if not settings:
        return jsonify({"error": "No settings provided"}), 400
    backup_manager.update_server_backup_config(server_name, settings)
    return jsonify({"message": "Backup settings saved successfully."})

@app.route('/api/servers/<server_name>/backups/now', methods=['POST'])
@api_auth_required
def trigger_backup_now(server_name, api_user=None):
    """Triggers an immediate backup for a specific server."""
    try:
        # Run in a background thread to not block the request
        thread = Thread(target=backup_manager.run_backup, args=[server_name])
        thread.daemon = True
        thread.start()
        return jsonify({"message": "Backup process started in the background."})
    except Exception as e:
        return jsonify({"error": f"Failed to start backup process: {e}"}), 500

# --- Task Management ---
TASK_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scheduler.json')

def execute_task(server_name, action, command=None):
    """The function executed by the scheduler for a given task."""
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Executing scheduled task for server '{server_name}': Action='{action}'")
    if action == 'start':
        start_server(server_name)
    elif action == 'stop':
        stop_server(server_name)
    elif action == 'restart':
        restart_server_logic(server_name)
    elif action == 'command' and command:
        screen_session_name = get_screen_session_name(server_name)
        base_command = ['wsl'] if sys.platform == "win32" else []
        if is_server_running(server_name):
            try:
                full_command = base_command + ['screen', '-S', screen_session_name, '-p', '0', '-X', 'stuff', f"{command}\n"]
                subprocess.run(full_command, check=True, text=True)
                print(f"Successfully sent command '{command}' to '{server_name}'")
            except Exception as e:
                print(f"Failed to send scheduled command '{command}' to '{server_name}': {e}")
        else:
            print(f"Server '{server_name}' is not running. Cannot send scheduled command.")

class TaskManager:
    def __init__(self):
        self.config = self._load_config()

    def _load_config(self):
        if not os.path.exists(TASK_CONFIG_FILE):
            return {}
        try:
            with open(TASK_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    def _save_config(self):
        with open(TASK_CONFIG_FILE, 'w') as f:
            json.dump(self.config, f, indent=4)

    def get_server_tasks(self, server_name):
        return self.config.get(server_name, [])

    def get_task(self, server_name, task_id):
        tasks = self.get_server_tasks(server_name)
        return next((task for task in tasks if task['id'] == task_id), None)

    def add_or_update_task(self, server_name, task_data):
        tasks = self.get_server_tasks(server_name)
        task_id = task_data.get('id', str(uuid.uuid4()))
        
        existing_task_index = -1
        for i, t in enumerate(tasks):
            if t['id'] == task_id:
                existing_task_index = i
                break

        new_task = {
            'id': task_id,
            'name': task_data['name'],
            'cron': task_data['cron'],
            'action': task_data['action'],
            'command': task_data.get('command'),
            'enabled': task_data.get('enabled', True)
        }
        
        if existing_task_index != -1:
            tasks[existing_task_index] = new_task
        else:
            tasks.append(new_task)
        
        self.config[server_name] = tasks
        self._save_config()
        self.schedule_task(server_name, new_task)
        return new_task

    def delete_task(self, server_name, task_id):
        tasks = self.get_server_tasks(server_name)
        task_to_delete = self.get_task(server_name, task_id)
        if not task_to_delete:
            return False
            
        self.config[server_name] = [t for t in tasks if t['id'] != task_id]
        self._save_config()

        job_id = f"task_{server_name}_{task_id}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        
        return True

    def schedule_task(self, server_name, task):
        job_id = f"task_{server_name}_{task['id']}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        
        if not task.get('enabled', True):
            print(f"Task '{task['name']}' for '{server_name}' is disabled. Skipping schedule.")
            return

        try:
            trigger = CronTrigger.from_crontab(task['cron'])
            scheduler.add_job(
                execute_task,
                trigger=trigger,
                args=[server_name, task['action'], task.get('command')],
                id=job_id,
                name=f"{server_name} - {task['name']}",
                replace_existing=True
            )
            print(f"Scheduled task '{task['name']}' for '{server_name}' ({task['cron']}).")
        except ValueError as e:
            print(f"Error scheduling task {job_id}: Invalid cron string '{task['cron']}'. {e}")
        except Exception as e:
            print(f"Error scheduling task {job_id}: {e}")
    
    def schedule_all_tasks(self):
        for server_name, tasks in self.config.items():
            for task in tasks:
                self.schedule_task(server_name, task)

task_manager = TaskManager()

@app.route('/api/servers/<server_name>/tasks', methods=['GET'])
@api_auth_required
def get_tasks(server_name, api_user=None):
    tasks = task_manager.get_server_tasks(server_name)
    return jsonify(tasks)

@app.route('/api/servers/<server_name>/tasks', methods=['POST'])
@api_auth_required
def create_task(server_name, api_user=None):
    data = request.get_json()
    if not data or not all(k in data for k in ['name', 'cron', 'action']):
        return jsonify({"error": "Missing required task data"}), 400
    try:
        CronTrigger.from_crontab(data['cron'])
    except ValueError as e:
        return jsonify({"error": f"Invalid cron string: {e}"}), 400
    new_task = task_manager.add_or_update_task(server_name, data)
    return jsonify(new_task), 201

@app.route('/api/servers/<server_name>/tasks/<task_id>', methods=['PUT'])
@api_auth_required
def update_task(server_name, task_id, api_user=None):
    data = request.get_json()
    if not data or not all(k in data for k in ['name', 'cron', 'action']):
        return jsonify({"error": "Missing required task data"}), 400
    if task_manager.get_task(server_name, task_id) is None:
        return jsonify({"error": "Task not found"}), 404
    try:
        CronTrigger.from_crontab(data['cron'])
    except ValueError as e:
        return jsonify({"error": f"Invalid cron string: {e}"}), 400

    data['id'] = task_id # ensure the id is part of the data
    updated_task = task_manager.add_or_update_task(server_name, data)
    return jsonify(updated_task)

@app.route('/api/servers/<server_name>/tasks/<task_id>', methods=['DELETE'])
@api_auth_required
def delete_task(server_name, task_id, api_user=None):
    if task_manager.delete_task(server_name, task_id):
        return jsonify({"message": "Task deleted successfully"})
    else:
        return jsonify({"error": "Task not found"}), 404

def initialize_app():
    migrate_scripts_to_configs_dir()
    # Schedule backups for all configured servers on startup
    for server_name in backup_manager.config:
        backup_manager.schedule_backup(server_name)
    task_manager.schedule_all_tasks()
    if not scheduler.running:
        scheduler.start()

def restart_server_logic(server_name):
    """A blocking function that attempts to stop and then start a server."""
    stop_result, stop_status = stop_server(server_name)
    # Check if stop was successful or if the server was already stopped.
    if stop_status not in [200, 409]:
        print(f"ERROR [{server_name}]: Could not stop server before restart: {stop_result.get('error')}")
        return {'error': f"Could not stop server before restart: {stop_result.get('error')}"}, 500
    
    # Wait a moment for resources to free up before starting again.
    time.sleep(2) 
    
    start_result, start_status = start_server(server_name)
    if start_status != 200:
        print(f"ERROR [{server_name}]: Server stopped but failed to start again: {start_result.get('error')}")
        return start_result, start_status

    return {'message': f'Server {server_name} is restarting.'}, 200

# --- Player Management (Whitelist & Operators) ---

def get_player_whitelist_path(server_name):
    """Returns the path to whitelist.json for a server."""
    return os.path.join(SERVERS_DIR, server_name, 'whitelist.json')

def get_player_ops_path(server_name):
    """Returns the path to ops.json for a server."""
    return os.path.join(SERVERS_DIR, server_name, 'ops.json')

def load_whitelist(server_name):
    """Loads the whitelist from whitelist.json."""
    path = get_player_whitelist_path(server_name)
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_whitelist(server_name, whitelist):
    """Saves the whitelist to whitelist.json."""
    path = get_player_whitelist_path(server_name)
    with open(path, 'w') as f:
        json.dump(whitelist, f, indent=2)

def load_ops(server_name):
    """Loads operators from ops.json."""
    path = get_player_ops_path(server_name)
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

def save_ops(server_name, ops):
    """Saves operators to ops.json."""
    path = get_player_ops_path(server_name)
    with open(path, 'w') as f:
        json.dump(ops, f, indent=2)

def get_uuid_from_username(username):
    """Fetches player UUID from Mojang API."""
    try:
        response = requests.get(f'https://api.mojang.com/users/profiles/minecraft/{username}', timeout=5)
        if response.status_code == 200:
            data = response.json()
            # Format UUID with dashes
            uuid_raw = data['id']
            uuid_formatted = f"{uuid_raw[:8]}-{uuid_raw[8:12]}-{uuid_raw[12:16]}-{uuid_raw[16:20]}-{uuid_raw[20:]}"
            return {'uuid': uuid_formatted, 'name': data['name']}
        elif response.status_code == 404:
            return None
        else:
            return None
    except Exception as e:
        print(f"Error fetching UUID for {username}: {e}")
        return None

@app.route('/api/servers/<server_name>/whitelist', methods=['GET'])
@api_auth_required
def get_whitelist(server_name, api_user=None):
    """Get the whitelist for a server."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    whitelist = load_whitelist(server_name)
    return jsonify(whitelist)

@app.route('/api/servers/<server_name>/whitelist', methods=['POST'])
@api_auth_required
def add_to_whitelist(server_name, api_user=None):
    """Add a player to the whitelist."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    data = request.get_json()
    username = data.get('username')
    
    if not username:
        return jsonify({"error": "Username is required"}), 400
    
    # Get UUID from Mojang API
    player_data = get_uuid_from_username(username)
    if not player_data:
        return jsonify({"error": f"Player '{username}' not found"}), 404
    
    whitelist = load_whitelist(server_name)
    
    # Check if player is already whitelisted
    if any(p['uuid'] == player_data['uuid'] for p in whitelist):
        return jsonify({"error": "Player is already whitelisted"}), 409
    
    # Add player to whitelist
    whitelist.append({
        'uuid': player_data['uuid'],
        'name': player_data['name']
    })
    save_whitelist(server_name, whitelist)
    
    return jsonify({"message": f"Player '{player_data['name']}' added to whitelist", "player": player_data}), 201

@app.route('/api/servers/<server_name>/whitelist/<player_uuid>', methods=['DELETE'])
@api_auth_required
def remove_from_whitelist(server_name, player_uuid, api_user=None):
    """Remove a player from the whitelist."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    whitelist = load_whitelist(server_name)
    initial_length = len(whitelist)
    whitelist = [p for p in whitelist if p['uuid'] != player_uuid]
    
    if len(whitelist) == initial_length:
        return jsonify({"error": "Player not found in whitelist"}), 404
    
    save_whitelist(server_name, whitelist)
    return jsonify({"message": "Player removed from whitelist"}), 200

@app.route('/api/servers/<server_name>/operators', methods=['GET'])
@api_auth_required
def get_operators(server_name, api_user=None):
    """Get the operators list for a server."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    ops = load_ops(server_name)
    return jsonify(ops)

@app.route('/api/servers/<server_name>/operators', methods=['POST'])
@api_auth_required
def add_operator(server_name, api_user=None):
    """Add a player as operator."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    data = request.get_json()
    username = data.get('username')
    level = int(data.get('level', 4))  # Default to level 4 (full permissions)
    
    if not username:
        return jsonify({"error": "Username is required"}), 400
    
    if level not in [1, 2, 3, 4]:
        return jsonify({"error": "Permission level must be between 1 and 4"}), 400
    
    # Get UUID from Mojang API
    player_data = get_uuid_from_username(username)
    if not player_data:
        return jsonify({"error": f"Player '{username}' not found"}), 404
    
    ops = load_ops(server_name)
    
    # Check if player is already an operator
    existing_op = next((op for op in ops if op['uuid'] == player_data['uuid']), None)
    if existing_op:
        # Update permission level
        existing_op['level'] = level
        save_ops(server_name, ops)
        return jsonify({"message": f"Updated operator '{player_data['name']}' to level {level}", "operator": existing_op}), 200
    
    # Add player as operator
    new_op = {
        'uuid': player_data['uuid'],
        'name': player_data['name'],
        'level': level,
        'bypassesPlayerLimit': False
    }
    ops.append(new_op)
    save_ops(server_name, ops)
    
    return jsonify({"message": f"Player '{player_data['name']}' added as operator (level {level})", "operator": new_op}), 201

@app.route('/api/servers/<server_name>/operators/<player_uuid>', methods=['DELETE'])
@api_auth_required
def remove_operator(server_name, player_uuid, api_user=None):
    """Remove operator status from a player."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    ops = load_ops(server_name)
    initial_length = len(ops)
    ops = [op for op in ops if op['uuid'] != player_uuid]
    
    if len(ops) == initial_length:
        return jsonify({"error": "Player not found in operators list"}), 404
    
    save_ops(server_name, ops)
    return jsonify({"message": "Operator status removed"}), 200

# --- Player Session Analytics ---

ANALYTICS_FILE = 'player_analytics.json'

def get_analytics_path(server_name):
    """Returns the path to player analytics file."""
    server_config_dir = get_server_config_dir(server_name)
    return os.path.join(server_config_dir, ANALYTICS_FILE)

def load_analytics(server_name):
    """Loads player analytics data."""
    path = get_analytics_path(server_name)
    if not os.path.exists(path):
        return {'players': {}, 'sessions': []}
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {'players': {}, 'sessions': []}

def save_analytics(server_name, analytics_data):
    """Saves player analytics data."""
    path = get_analytics_path(server_name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(analytics_data, f, indent=2)

def parse_log_for_sessions(server_name):
    """Parse server logs to extract player join/leave events."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    log_file = os.path.join(server_path, 'logs', 'latest.log')
    
    if not os.path.exists(log_file):
        return []
    
    analytics = load_analytics(server_name)
    players_data = analytics.get('players', {})
    sessions = analytics.get('sessions', [])
    active_sessions = {}
    
    # Regular expressions for join/leave events
    join_pattern = re.compile(r'\[.*?\]: (.*?) joined the game')
    leave_pattern = re.compile(r'\[.*?\]: (.*?) left the game')
    timestamp_pattern = re.compile(r'\[([\d:]+)\]')
    
    try:
        with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                # Extract timestamp
                time_match = timestamp_pattern.search(line)
                if not time_match:
                    continue
                
                timestamp = time_match.group(1)
                current_time = time.time()
                
                # Check for join event
                join_match = join_pattern.search(line)
                if join_match:
                    player_name = join_match.group(1)
                    
                    # Initialize player data if not exists
                    if player_name not in players_data:
                        players_data[player_name] = {
                            'first_join': current_time,
                            'last_join': current_time,
                            'total_playtime': 0,
                            'join_count': 0
                        }
                    
                    players_data[player_name]['last_join'] = current_time
                    players_data[player_name]['join_count'] += 1
                    
                    # Start a new session
                    active_sessions[player_name] = {
                        'player': player_name,
                        'join_time': current_time,
                        'timestamp': timestamp
                    }
                
                # Check for leave event
                leave_match = leave_pattern.search(line)
                if leave_match:
                    player_name = leave_match.group(1)
                    
                    if player_name in active_sessions:
                        session = active_sessions[player_name]
                        leave_time = current_time
                        duration = leave_time - session['join_time']
                        
                        # Update player total playtime
                        if player_name in players_data:
                            players_data[player_name]['total_playtime'] += duration
                        
                        # Record session
                        sessions.append({
                            'player': player_name,
                            'join_time': session['join_time'],
                            'leave_time': leave_time,
                            'duration': duration
                        })
                        
                        del active_sessions[player_name]
        
        # Save updated analytics
        analytics['players'] = players_data
        analytics['sessions'] = sessions
        save_analytics(server_name, analytics)
        
        return analytics
        
    except Exception as e:
        print(f"Error parsing logs for analytics: {e}")
        return analytics

@app.route('/api/servers/<server_name>/analytics/refresh', methods=['POST'])
@api_auth_required
def refresh_analytics(server_name, api_user=None):
    """Parse logs and update analytics data."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    try:
        analytics = parse_log_for_sessions(server_name)
        return jsonify({"message": "Analytics refreshed successfully", "data": analytics}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to refresh analytics: {e}"}), 500

@app.route('/api/servers/<server_name>/analytics/playtime', methods=['GET'])
@api_auth_required
def get_player_playtime(server_name, api_user=None):
    """Get player playtime statistics."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    analytics = load_analytics(server_name)
    players_data = analytics.get('players', {})
    
    # Convert to list and sort by total playtime
    playtime_list = []
    for player_name, data in players_data.items():
        playtime_list.append({
            'player': player_name,
            'total_playtime': data['total_playtime'],
            'total_playtime_hours': round(data['total_playtime'] / 3600, 2),
            'join_count': data['join_count'],
            'first_join': data['first_join'],
            'last_join': data['last_join']
        })
    
    playtime_list.sort(key=lambda x: x['total_playtime'], reverse=True)
    return jsonify(playtime_list)

@app.route('/api/servers/<server_name>/analytics/peak-hours', methods=['GET'])
@api_auth_required
def get_peak_hours(server_name, api_user=None):
    """Get peak player hours statistics."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    analytics = load_analytics(server_name)
    sessions = analytics.get('sessions', [])
    
    # Initialize hour buckets (0-23)
    hour_counts = {str(hour): 0 for hour in range(24)}
    
    for session in sessions:
        join_time = session['join_time']
        leave_time = session['leave_time']
        
        # Count each hour the player was online
        join_datetime = time.localtime(join_time)
        leave_datetime = time.localtime(leave_time)
        
        current_hour = join_datetime.tm_hour
        end_hour = leave_datetime.tm_hour
        
        # Handle sessions spanning multiple hours
        hours_online = int((leave_time - join_time) / 3600) + 1
        for i in range(hours_online):
            hour_key = str((current_hour + i) % 24)
            hour_counts[hour_key] += 1
    
    return jsonify(hour_counts)

@app.route('/api/servers/<server_name>/analytics/sessions', methods=['GET'])
@api_auth_required
def get_recent_sessions(server_name, api_user=None):
    """Get recent player sessions."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    analytics = load_analytics(server_name)
    sessions = analytics.get('sessions', [])
    
    # Get the last 50 sessions
    recent_sessions = sessions[-50:] if len(sessions) > 50 else sessions
    recent_sessions.reverse()  # Most recent first
    
    # Format for display
    formatted_sessions = []
    for session in recent_sessions:
        formatted_sessions.append({
            'player': session['player'],
            'join_time': session['join_time'],
            'leave_time': session.get('leave_time'),
            'duration': session.get('duration', 0),
            'duration_minutes': round(session.get('duration', 0) / 60, 2)
        })
    
    return jsonify(formatted_sessions)

@app.route('/api/servers/<server_name>/analytics/online', methods=['GET'])
@api_auth_required
def get_online_players(server_name, api_user=None):
    """Get currently online players by parsing the latest log."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    log_file = os.path.join(server_path, 'logs', 'latest.log')
    if not os.path.exists(log_file):
        return jsonify([])
    
    online_players = set()
    join_pattern = re.compile(r'\[.*?\]: (.*?) joined the game')
    leave_pattern = re.compile(r'\[.*?\]: (.*?) left the game')
    
    try:
        with open(log_file, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                join_match = join_pattern.search(line)
                if join_match:
                    online_players.add(join_match.group(1))
                
                leave_match = leave_pattern.search(line)
                if leave_match:
                    online_players.discard(leave_match.group(1))
        
        return jsonify(list(online_players))
    except Exception as e:
        print(f"Error getting online players: {e}")
        return jsonify([])

# --- Plugin/Mod Management ---

def get_plugins_folder_path(server_name):
    """Returns the path to the plugins/mods folder based on server type."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    metadata = get_server_metadata(server_path)
    server_type = metadata.get('server_type', 'vanilla').lower()
    
    # Plugin-based servers use 'plugins' folder
    if server_type in ['paper', 'purpur', 'spigot', 'bukkit']:
        return os.path.join(server_path, 'plugins')
    # Mod-based servers use 'mods' folder
    elif server_type in ['fabric', 'forge', 'neoforge', 'quilt']:
        return os.path.join(server_path, 'mods')
    else:
        return None

def supports_plugins_or_mods(server_name):
    """Check if a server supports plugins or mods."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    metadata = get_server_metadata(server_path)
    server_type = metadata.get('server_type', 'vanilla').lower()
    return server_type in ['paper', 'purpur', 'spigot', 'bukkit', 'fabric', 'forge', 'neoforge', 'quilt']

@app.route('/api/servers/<server_name>/plugins', methods=['GET'])
@api_require_permission('can_manage_plugins', 'server_name')
def list_plugins(server_name, api_user=None):
    """Lists all installed plugins/mods for a server."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    if not supports_plugins_or_mods(server_name):
        return jsonify({"error": "This server type does not support plugins or mods"}), 400
    
    plugins_folder = get_plugins_folder_path(server_name)
    if not plugins_folder or not os.path.exists(plugins_folder):
        os.makedirs(plugins_folder, exist_ok=True)
        return jsonify([])
    
    plugins = []
    for filename in os.listdir(plugins_folder):
        if filename.endswith('.jar'):
            file_path = os.path.join(plugins_folder, filename)
            file_size = os.path.getsize(file_path)
            plugins.append({
                'name': filename,
                'filename': filename,
                'size': file_size,
                'size_mb': round(file_size / (1024 * 1024), 2)
            })
    
    return jsonify(plugins)

@app.route('/api/servers/<server_name>/plugins/search', methods=['GET'])
@api_require_permission('can_manage_plugins', 'server_name')
def search_plugins(server_name, api_user=None):
    """Search for plugins/mods from Modrinth."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    if not supports_plugins_or_mods(server_name):
        return jsonify({"error": "This server type does not support plugins or mods"}), 400
    
    query = request.args.get('query', '')
    metadata = get_server_metadata(server_path)
    server_type = metadata.get('server_type', 'vanilla').lower()
    mc_version = metadata.get('version', '')
    
    # Determine facets based on server type
    if server_type in ['paper', 'purpur', 'spigot', 'bukkit']:
        facets = [["project_type:plugin"], [f"versions:{mc_version}"]]
    elif server_type in ['fabric', 'quilt']:
        facets = [["project_type:mod"], [f"versions:{mc_version}"], [f"categories:{server_type}"]]
    elif server_type in ['forge', 'neoforge']:
        facets = [["project_type:mod"], [f"versions:{mc_version}"], ["categories:forge"]]
    else:
        return jsonify([])
    
    try:
        # Search Modrinth API
        url = "https://api.modrinth.com/v2/search"
        params = {
            'query': query,
            'facets': json.dumps(facets),
            'limit': 20
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for hit in data.get('hits', []):
            results.append({
                'id': hit.get('project_id'),
                'name': hit.get('title'),
                'slug': hit.get('slug'),
                'description': hit.get('description', ''),
                'author': hit.get('author', 'Unknown'),
                'downloads': hit.get('downloads', 0),
                'icon_url': hit.get('icon_url'),
                'categories': hit.get('categories', []),
                'client_side': hit.get('client_side', 'unknown'),
                'server_side': hit.get('server_side', 'unknown'),
                'source': 'modrinth'
            })
        
        return jsonify(results)
        
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to search plugins: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/api/servers/<server_name>/plugins/install', methods=['POST'])
@api_require_permission('can_manage_plugins', 'server_name')
def install_plugin(server_name, api_user=None):
    """Install a plugin/mod from Modrinth."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    if not supports_plugins_or_mods(server_name):
        return jsonify({"error": "This server type does not support plugins or mods"}), 400
    
    data = request.get_json()
    project_id = data.get('project_id')
    
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    
    metadata = get_server_metadata(server_path)
    mc_version = metadata.get('version', '')
    server_type = metadata.get('server_type', 'vanilla').lower()
    
    plugins_folder = get_plugins_folder_path(server_name)
    os.makedirs(plugins_folder, exist_ok=True)
    
    try:
        # Get project versions from Modrinth
        url = f"https://api.modrinth.com/v2/project/{project_id}/version"
        params = {
            'game_versions': json.dumps([mc_version])
        }
        
        # Add loader filter
        if server_type in ['fabric', 'quilt', 'forge', 'neoforge']:
            params['loaders'] = json.dumps([server_type])
        elif server_type in ['paper', 'purpur']:
            params['loaders'] = json.dumps(['paper', 'spigot', 'bukkit'])
        elif server_type == 'spigot':
            params['loaders'] = json.dumps(['spigot', 'bukkit'])
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        versions = response.json()
        
        if not versions:
            return jsonify({"error": "No compatible version found for your Minecraft version"}), 404
        
        # Get the latest version
        latest_version = versions[0]
        
        # Find the primary file
        primary_file = None
        for file in latest_version.get('files', []):
            if file.get('primary', False):
                primary_file = file
                break
        
        if not primary_file:
            primary_file = latest_version['files'][0] if latest_version.get('files') else None
        
        if not primary_file:
            return jsonify({"error": "No downloadable file found"}), 404
        
        download_url = primary_file.get('url')
        filename = primary_file.get('filename')
        
        # Download the file
        file_response = requests.get(download_url, stream=True, timeout=30)
        file_response.raise_for_status()
        
        file_path = os.path.join(plugins_folder, filename)
        with open(file_path, 'wb') as f:
            for chunk in file_response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return jsonify({
            "message": f"Successfully installed {filename}",
            "filename": filename,
            "version": latest_version.get('version_number')
        }), 201
        
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to download plugin: {e}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {e}"}), 500

@app.route('/api/servers/<server_name>/plugins/<path:filename>', methods=['DELETE'])
@api_require_permission('can_manage_plugins', 'server_name')
def delete_plugin(server_name, filename, api_user=None):
    """Delete a plugin/mod file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    if not supports_plugins_or_mods(server_name):
        return jsonify({"error": "This server type does not support plugins or mods"}), 400
    
    plugins_folder = get_plugins_folder_path(server_name)
    if not plugins_folder:
        return jsonify({"error": "Plugins folder not found"}), 404
    
    # Security: prevent directory traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        return jsonify({"error": "Invalid filename"}), 400
    
    file_path = os.path.join(plugins_folder, filename)
    
    if not os.path.exists(file_path):
        return jsonify({"error": "Plugin file not found"}), 404
    
    try:
        os.remove(file_path)
        return jsonify({"message": f"Successfully deleted {filename}"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to delete plugin: {e}"}), 500

@app.route('/api/servers/<server_name>/plugins/info/<project_id>', methods=['GET'])
@api_require_permission('can_manage_plugins', 'server_name')
def get_plugin_info(server_name, project_id, api_user=None):
    """Get detailed information about a plugin from Modrinth."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    try:
        url = f"https://api.modrinth.com/v2/project/{project_id}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        project_data = response.json()
        
        return jsonify({
            'id': project_data.get('id'),
            'slug': project_data.get('slug'),
            'title': project_data.get('title'),
            'description': project_data.get('description'),
            'body': project_data.get('body'),
            'categories': project_data.get('categories', []),
            'client_side': project_data.get('client_side'),
            'server_side': project_data.get('server_side'),
            'downloads': project_data.get('downloads', 0),
            'followers': project_data.get('followers', 0),
            'icon_url': project_data.get('icon_url'),
            'license': project_data.get('license', {}).get('name'),
            'versions': project_data.get('versions', []),
            'source_url': project_data.get('source_url'),
            'wiki_url': project_data.get('wiki_url'),
            'discord_url': project_data.get('discord_url')
        })
        
    except requests.RequestException as e:
        return jsonify({"error": f"Failed to fetch plugin info: {e}"}), 500

@app.route('/api/servers/<server_name>/supports-plugins', methods=['GET'])
@api_auth_required
def check_plugin_support(server_name, api_user=None):
    """Check if the server supports plugins/mods."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    metadata = get_server_metadata(server_path)
    server_type = metadata.get('server_type', 'vanilla').lower()
    
    supports = supports_plugins_or_mods(server_name)
    folder_type = 'plugins' if server_type in ['paper', 'purpur', 'spigot', 'bukkit'] else 'mods'
    
    return jsonify({
        'supports': supports,
        'server_type': server_type,
        'folder_type': folder_type
    })

# --- World Management ---

def get_directory_size(path):
    """Calculate the total size of a directory in bytes."""
    total_size = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_size += os.path.getsize(filepath)
                except OSError:
                    continue
    except OSError:
        pass
    return total_size

def get_world_folders(server_path):
    """Find all world folders in a server directory."""
    worlds = []
    
    # Common world folder patterns
    world_indicators = ['level.dat', 'session.lock']
    
    # Check main directory and subdirectories
    for item in os.listdir(server_path):
        item_path = os.path.join(server_path, item)
        if os.path.isdir(item_path):
            # Check if this directory contains world data
            has_world_data = any(
                os.path.exists(os.path.join(item_path, indicator))
                for indicator in world_indicators
            )
            
            if has_world_data:
                size = get_directory_size(item_path)
                worlds.append({
                    'name': item,
                    'path': item,
                    'size': size,
                    'size_mb': round(size / (1024 * 1024), 2),
                    'has_nether': os.path.isdir(os.path.join(item_path, 'DIM-1')),
                    'has_end': os.path.isdir(os.path.join(item_path, 'DIM1'))
                })
    
    return worlds

@app.route('/api/servers/<server_name>/worlds', methods=['GET'])
@api_auth_required
def list_worlds(server_name, api_user=None):
    """List all world folders in the server directory."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    try:
        worlds = get_world_folders(server_path)
        return jsonify(worlds)
    except Exception as e:
        return jsonify({"error": f"Failed to list worlds: {e}"}), 500

@app.route('/api/servers/<server_name>/worlds/<world_name>/download', methods=['GET'])
@api_auth_required
def download_world(server_name, world_name, api_user=None):
    """Download a world folder as a ZIP file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    # Sanitize world name
    if '..' in world_name or '/' in world_name or '\\' in world_name:
        return jsonify({"error": "Invalid world name"}), 400
    
    world_path = os.path.join(server_path, world_name)
    if not os.path.isdir(world_path):
        return jsonify({"error": "World not found"}), 404
    
    # Check if level.dat exists to confirm it's a world folder
    if not os.path.exists(os.path.join(world_path, 'level.dat')):
        return jsonify({"error": "Not a valid world folder"}), 400
    
    try:
        # Create a temporary ZIP file
        zip_filename = f"{world_name}_{time.strftime('%Y%m%d_%H%M%S')}.zip"
        zip_path = os.path.join(server_path, zip_filename)
        
        # Create ZIP file
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(world_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, server_path)
                    zipf.write(file_path, arcname)
        
        # Send the file
        response = send_from_directory(
            server_path,
            zip_filename,
            as_attachment=True,
            download_name=zip_filename
        )
        
        # Schedule deletion of the ZIP file after sending
        @response.call_on_close
        def cleanup():
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception as e:
                print(f"Error cleaning up ZIP file: {e}")
        
        return response
        
    except Exception as e:
        return jsonify({"error": f"Failed to create world download: {e}"}), 500

@app.route('/api/servers/<server_name>/worlds/upload', methods=['POST'])
@api_auth_required
def upload_world(server_name, api_user=None):
    """Upload and extract a world ZIP file."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    # Check if server is running
    if is_server_running(server_name):
        return jsonify({"error": "Cannot upload world while server is running. Please stop the server first."}), 400
    
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.endswith('.zip'):
        return jsonify({"error": "File must be a ZIP archive"}), 400
    
    world_name = request.form.get('world_name', 'world')
    
    # Sanitize world name
    world_name = secure_filename(world_name)
    if not world_name:
        world_name = 'world'
    
    world_path = os.path.join(server_path, world_name)
    
    try:
        # Save uploaded file temporarily
        temp_zip = os.path.join(server_path, f'temp_world_{uuid.uuid4().hex}.zip')
        file.save(temp_zip)
        
        # Backup existing world if it exists
        if os.path.exists(world_path):
            backup_path = os.path.join(server_path, f'{world_name}_backup_{time.strftime("%Y%m%d_%H%M%S")}')
            shutil.move(world_path, backup_path)
        
        # Extract ZIP file
        os.makedirs(world_path, exist_ok=True)
        
        with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
            # Check if ZIP contains a single top-level directory
            namelist = zip_ref.namelist()
            if namelist:
                first_item = namelist[0]
                if '/' in first_item:
                    # ZIP has a top-level directory, extract and move contents
                    temp_extract = os.path.join(server_path, f'temp_extract_{uuid.uuid4().hex}')
                    zip_ref.extractall(temp_extract)
                    
                    # Find the world folder inside
                    extracted_items = os.listdir(temp_extract)
                    if len(extracted_items) == 1 and os.path.isdir(os.path.join(temp_extract, extracted_items[0])):
                        # Move contents of the single directory
                        extracted_world = os.path.join(temp_extract, extracted_items[0])
                        for item in os.listdir(extracted_world):
                            shutil.move(
                                os.path.join(extracted_world, item),
                                os.path.join(world_path, item)
                            )
                        shutil.rmtree(temp_extract)
                    else:
                        # Move all extracted items
                        for item in extracted_items:
                            shutil.move(
                                os.path.join(temp_extract, item),
                                os.path.join(world_path, item)
                            )
                        shutil.rmtree(temp_extract)
                else:
                    # Extract directly
                    zip_ref.extractall(world_path)
        
        # Clean up temp ZIP
        os.remove(temp_zip)
        
        # Verify it's a valid world
        if not os.path.exists(os.path.join(world_path, 'level.dat')):
            return jsonify({"error": "Uploaded file does not contain a valid Minecraft world (missing level.dat)"}), 400
        
        return jsonify({"message": f"World '{world_name}' uploaded successfully"}), 201
        
    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid ZIP file"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to upload world: {e}"}), 500
    finally:
        # Clean up temp file if it still exists
        if 'temp_zip' in locals() and os.path.exists(temp_zip):
            try:
                os.remove(temp_zip)
            except:
                pass

@app.route('/api/servers/<server_name>/worlds/<world_name>/dimension/<dimension>', methods=['DELETE'])
@api_auth_required
def reset_dimension(server_name, world_name, dimension, api_user=None):
    """Reset a world dimension (Nether or End)."""
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    # Check if server is running
    if is_server_running(server_name):
        return jsonify({"error": "Cannot reset dimension while server is running. Please stop the server first."}), 400
    
    # Sanitize names
    if '..' in world_name or '/' in world_name or '\\' in world_name:
        return jsonify({"error": "Invalid world name"}), 400
    
    world_path = os.path.join(server_path, world_name)
    if not os.path.isdir(world_path):
        return jsonify({"error": "World not found"}), 404
    
    # Map dimension names to folder names
    dimension_folders = {
        'nether': 'DIM-1',
        'end': 'DIM1'
    }
    
    if dimension not in dimension_folders:
        return jsonify({"error": "Invalid dimension. Must be 'nether' or 'end'"}), 400
    
    dimension_path = os.path.join(world_path, dimension_folders[dimension])
    
    if not os.path.exists(dimension_path):
        return jsonify({"error": f"{dimension.capitalize()} dimension does not exist"}), 404
    
    try:
        # Create backup before deletion
        backup_path = os.path.join(
            server_path,
            f'{world_name}_{dimension}_backup_{time.strftime("%Y%m%d_%H%M%S")}'
        )
        shutil.copytree(dimension_path, backup_path)
        
        # Delete dimension
        shutil.rmtree(dimension_path)
        
        return jsonify({
            "message": f"{dimension.capitalize()} dimension reset successfully. Backup saved to {os.path.basename(backup_path)}"
        }), 200
        
    except Exception as e:
        return jsonify({"error": f"Failed to reset dimension: {e}"}), 500

# --- Frontend Routes ---

@app.route('/')
def serve_index():
    """Serve the main index.html page."""
    return send_from_directory('..', 'index.html')

@app.route('/server-details.html')
def serve_server_details():
    """Serve the server details page."""
    return send_from_directory('..', 'server-details.html')

@app.route('/credits.html')
def serve_credits():
    """Serve the credits page."""
    return send_from_directory('..', 'credits.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files (CSS, JS, images)."""
    return send_from_directory('..', path)

# --- Server Templates ---

def ensure_templates_dir():
    """Ensure the templates directory exists."""
    os.makedirs(TEMPLATES_DIR, exist_ok=True)

@app.route('/api/templates', methods=['GET'])
@api_auth_required
def list_templates(api_user=None):
    """List all saved server templates."""
    ensure_templates_dir()
    
    templates = []
    try:
        for filename in os.listdir(TEMPLATES_DIR):
            if filename.endswith('.json'):
                template_path = os.path.join(TEMPLATES_DIR, filename)
                try:
                    with open(template_path, 'r') as f:
                        template_data = json.load(f)
                        templates.append({
                            'id': filename[:-5],  # Remove .json extension
                            'name': template_data.get('name', filename[:-5]),
                            'description': template_data.get('description', ''),
                            'server_type': template_data.get('server_type', 'Unknown'),
                            'version': template_data.get('version', 'Unknown'),
                            'created_at': template_data.get('created_at', ''),
                            'created_from': template_data.get('created_from', '')
                        })
                except (json.JSONDecodeError, IOError):
                    continue
        
        return jsonify(templates)
    except Exception as e:
        return jsonify({"error": f"Failed to list templates: {e}"}), 500

@app.route('/api/templates', methods=['POST'])
@api_auth_required
def create_template(api_user=None):
    """Create a template from an existing server with selective content inclusion."""
    data = request.get_json()
    server_name = data.get('server_name')
    template_name = data.get('template_name')
    description = data.get('description', '')
    
    # Inclusion options (all default to True for backward compatibility)
    include_world = data.get('include_world', False)
    include_plugins = data.get('include_plugins', False)
    include_whitelist = data.get('include_whitelist', False)
    include_ops = data.get('include_ops', False)
    include_server_configs = data.get('include_server_configs', True)
    
    if not server_name or not template_name:
        return jsonify({"error": "server_name and template_name are required"}), 400
    
    server_path = os.path.join(SERVERS_DIR, server_name)
    if not os.path.isdir(server_path):
        return jsonify({"error": "Server not found"}), 404
    
    # Sanitize template name
    template_id = secure_filename(template_name)
    if not template_id:
        return jsonify({"error": "Invalid template name"}), 400
    
    ensure_templates_dir()
    template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    template_data_dir = os.path.join(TEMPLATES_DIR, f'{template_id}_data')
    
    try:
        # Get server metadata
        metadata = get_server_metadata(server_path)
        properties = get_server_properties(server_path)
        
        # Load start script if exists
        start_script_path = get_start_script_path(server_name)
        start_script = {"commands": []}
        if os.path.exists(start_script_path):
            with open(start_script_path, 'r') as f:
                start_script = json.load(f)
        
        # Load install script if exists
        install_script_path = get_install_script_path(server_name)
        install_script = {"commands": []}
        if os.path.exists(install_script_path):
            with open(install_script_path, 'r') as f:
                install_script = json.load(f)
        
        # Create template base
        template = {
            'name': template_name,
            'description': description,
            'server_type': metadata.get('server_type', 'vanilla'),
            'version': metadata.get('version', 'Unknown'),
            'created_at': time.strftime('%Y-%m-%d %H:%M:%S'),
            'created_from': server_name,
            'includes': {
                'world': include_world,
                'plugins': include_plugins,
                'whitelist': include_whitelist,
                'ops': include_ops,
                'server_configs': include_server_configs
            },
            'config': {
                'start_script': start_script,
                'install_script': install_script
            }
        }
        
        # Include server properties/configs if requested
        if include_server_configs:
            template['config']['properties'] = properties
            template['config']['metadata'] = metadata
        
        # Create data directory for large files
        os.makedirs(template_data_dir, exist_ok=True)
        
        # Include whitelist if requested
        if include_whitelist:
            whitelist_file = os.path.join(server_path, 'whitelist.json')
            if os.path.exists(whitelist_file):
                with open(whitelist_file, 'r') as f:
                    template['config']['whitelist'] = json.load(f)
        
        # Include operators if requested
        if include_ops:
            ops_file = os.path.join(server_path, 'ops.json')
            if os.path.exists(ops_file):
                with open(ops_file, 'r') as f:
                    template['config']['ops'] = json.load(f)
        
        # Include plugins/mods if requested
        if include_plugins:
            plugins_folder = get_plugins_folder_path(server_name)
            if plugins_folder and os.path.exists(plugins_folder):
                plugins_dest = os.path.join(template_data_dir, os.path.basename(plugins_folder))
                shutil.copytree(plugins_folder, plugins_dest, dirs_exist_ok=True)
                template['config']['has_plugins_data'] = True
        
        # Include world if requested
        if include_world:
            # Copy main world folders
            world_folders = []
            for world_name in ['world', 'world_nether', 'world_the_end']:
                world_path = os.path.join(server_path, world_name)
                if os.path.exists(world_path):
                    world_dest = os.path.join(template_data_dir, world_name)
                    shutil.copytree(world_path, world_dest, dirs_exist_ok=True)
                    world_folders.append(world_name)
            
            if world_folders:
                template['config']['world_folders'] = world_folders
                template['config']['has_world_data'] = True
        
        # Save template JSON
        with open(template_file, 'w') as f:
            json.dump(template, f, indent=4)
        
        return jsonify({
            "message": f"Template '{template_name}' created successfully",
            "template_id": template_id,
            "includes": template['includes']
        }), 201
        
    except Exception as e:
        # Cleanup on error
        if os.path.exists(template_data_dir):
            shutil.rmtree(template_data_dir)
        return jsonify({"error": f"Failed to create template: {e}"}), 500

@app.route('/api/templates/<template_id>', methods=['GET'])
@api_auth_required
def get_template(template_id, api_user=None):
    """Get a specific template."""
    ensure_templates_dir()
    
    # Sanitize template ID
    template_id = secure_filename(template_id)
    template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    
    if not os.path.exists(template_file):
        return jsonify({"error": "Template not found"}), 404
    
    try:
        with open(template_file, 'r') as f:
            template = json.load(f)
        return jsonify(template)
    except Exception as e:
        return jsonify({"error": f"Failed to load template: {e}"}), 500

@app.route('/api/templates/<template_id>', methods=['DELETE'])
@api_auth_required
def delete_template(template_id, api_user=None):
    """Delete a template and its associated data."""
    ensure_templates_dir()
    
    # Sanitize template ID
    template_id = secure_filename(template_id)
    template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    template_data_dir = os.path.join(TEMPLATES_DIR, f'{template_id}_data')
    
    if not os.path.exists(template_file):
        return jsonify({"error": "Template not found"}), 404
    
    try:
        # Delete template JSON file
        os.remove(template_file)
        
        # Delete template data directory if it exists
        if os.path.exists(template_data_dir):
            shutil.rmtree(template_data_dir)
        
        return jsonify({"message": f"Template '{template_id}' deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to delete template: {e}"}), 500

@app.route('/api/templates/<template_id>/export', methods=['GET'])
@api_auth_required
def export_template(template_id, api_user=None):
    """Export a template as downloadable JSON."""
    ensure_templates_dir()
    
    # Sanitize template ID
    template_id = secure_filename(template_id)
    template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    
    if not os.path.exists(template_file):
        return jsonify({"error": "Template not found"}), 404
    
    try:
        return send_from_directory(
            TEMPLATES_DIR,
            f'{template_id}.json',
            as_attachment=True,
            download_name=f'server_template_{template_id}.json'
        )
    except Exception as e:
        return jsonify({"error": f"Failed to export template: {e}"}), 500

@app.route('/api/templates/import', methods=['POST'])
@api_auth_required
def import_template(api_user=None):
    """Import a template from uploaded JSON file."""
    ensure_templates_dir()
    
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.endswith('.json'):
        return jsonify({"error": "File must be a JSON file"}), 400
    
    try:
        # Load and validate JSON
        template_data = json.load(file)
        
        # Validate required fields
        if 'name' not in template_data:
            return jsonify({"error": "Invalid template: missing 'name' field"}), 400
        
        # Generate template ID from name
        template_id = secure_filename(template_data['name'])
        if not template_id:
            template_id = f"imported_{int(time.time())}"
        
        template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
        
        # Check if template already exists
        counter = 1
        original_id = template_id
        while os.path.exists(template_file):
            template_id = f"{original_id}_{counter}"
            template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
            counter += 1
        
        # Save template
        with open(template_file, 'w') as f:
            json.dump(template_data, f, indent=4)
        
        return jsonify({
            "message": f"Template imported successfully as '{template_id}'",
            "template_id": template_id
        }), 201
        
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON file"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to import template: {e}"}), 500

@app.route('/api/servers/create-from-template', methods=['POST'])
@api_auth_required
def create_server_from_template(api_user=None):
    """Create a new server from a template with all included content."""
    data = request.get_json()
    template_id = data.get('template_id')
    server_name = data.get('server_name')
    port = data.get('port', 25565)
    
    if not template_id or not server_name:
        return jsonify({"error": "template_id and server_name are required"}), 400
    
    # Sanitize server name
    if not re.match("^[a-zA-Z0-9_-]+$", server_name):
        return jsonify({"error": "Invalid server name format"}), 400
    
    # Check if server already exists
    server_path = os.path.join(SERVERS_DIR, server_name)
    if os.path.exists(server_path):
        return jsonify({"error": "A server with this name already exists"}), 409
    
    # Check port
    if is_port_in_use(port):
        return jsonify({"error": f"Port {port} is already in use"}), 409
    
    # Load template
    template_id = secure_filename(template_id)
    template_file = os.path.join(TEMPLATES_DIR, f'{template_id}.json')
    template_data_dir = os.path.join(TEMPLATES_DIR, f'{template_id}_data')
    
    if not os.path.exists(template_file):
        return jsonify({"error": "Template not found"}), 404
    
    try:
        with open(template_file, 'r') as f:
            template = json.load(f)
        
        # Create server directory
        os.makedirs(server_path)
        
        # Apply template configuration
        config_data = template.get('config', {})
        includes = template.get('includes', {})
        
        # Write EULA
        with open(os.path.join(server_path, 'eula.txt'), 'w') as f:
            f.write('eula=true\n')
        
        # Write server.properties with template values OR create default
        properties = config_data.get('properties', {})
        properties['server-port'] = str(port)  # Always override port with new value
        
        props_file = os.path.join(server_path, 'server.properties')
        with open(props_file, 'w') as f:
            if properties:
                for key, value in properties.items():
                    f.write(f"{key}={value}\n")
            else:
                # Create minimal properties if none in template
                f.write(f"server-port={port}\n")
                f.write("motd=Server created from template\n")
        
        # Write metadata
        metadata = config_data.get('metadata', {})
        if not metadata:
            # Create minimal metadata if none in template
            metadata = {
                'server_type': template.get('server_type', 'vanilla'),
                'version': template.get('version', '1.21.1')
            }
        metadata['created_from_template'] = template_id
        write_server_metadata(server_path, metadata)
        
        # Create server config directory
        server_config_dir = get_server_config_dir(server_name)
        os.makedirs(server_config_dir, exist_ok=True)
        
        # Write start script
        start_script = config_data.get('start_script', {"commands": ["java -Xmx2G -Xms1G -jar server.jar nogui"]})
        start_script_path = get_start_script_path(server_name)
        with open(start_script_path, 'w') as f:
            json.dump(start_script, f, indent=4)
        
        # Write install script if present
        install_script = config_data.get('install_script', {})
        if install_script.get('commands'):
            install_script_path = get_install_script_path(server_name)
            with open(install_script_path, 'w') as f:
                json.dump(install_script, f, indent=4)
        
        # Restore whitelist if included
        if includes.get('whitelist') and 'whitelist' in config_data:
            whitelist_file = os.path.join(server_path, 'whitelist.json')
            with open(whitelist_file, 'w') as f:
                json.dump(config_data['whitelist'], f, indent=2)
        
        # Restore operators if included
        if includes.get('ops') and 'ops' in config_data:
            ops_file = os.path.join(server_path, 'ops.json')
            with open(ops_file, 'w') as f:
                json.dump(config_data['ops'], f, indent=2)
        
        # Restore plugins/mods if included
        if includes.get('plugins') and config_data.get('has_plugins_data'):
            # Determine plugin folder name based on server type
            server_type = metadata.get('server_type', 'vanilla')
            if server_type in ['paper', 'purpur', 'spigot', 'bukkit']:
                plugins_folder_name = 'plugins'
            else:
                plugins_folder_name = 'mods'
            
            plugins_source = os.path.join(template_data_dir, plugins_folder_name)
            if os.path.exists(plugins_source):
                plugins_dest = os.path.join(server_path, plugins_folder_name)
                shutil.copytree(plugins_source, plugins_dest)
        
        # Restore world if included
        if includes.get('world') and config_data.get('has_world_data'):
            world_folders = config_data.get('world_folders', [])
            for world_name in world_folders:
                world_source = os.path.join(template_data_dir, world_name)
                if os.path.exists(world_source):
                    world_dest = os.path.join(server_path, world_name)
                    shutil.copytree(world_source, world_dest)
        
        # Download server JAR
        server_type = metadata.get('server_type', 'vanilla')
        version = metadata.get('version', '1.21.1')
        jar_url = f"https://mcutils.com/api/server-jars/{server_type}/{version}/download"
        jar_path = os.path.join(server_path, 'server.jar')
        download_jar(jar_url, jar_path)
        
        # Build message about what was included
        included_items = []
        if includes.get('world'):
            included_items.append('world')
        if includes.get('plugins'):
            included_items.append('plugins/mods')
        if includes.get('whitelist'):
            included_items.append('whitelist')
        if includes.get('ops'):
            included_items.append('operators')
        if includes.get('server_configs'):
            included_items.append('configs')
        
        message = f"Server '{server_name}' created from template '{template.get('name', template_id)}'"
        if included_items:
            message += f" with {', '.join(included_items)}"
        
        return jsonify({
            "message": message,
            "server_name": server_name,
            "included": included_items
        }), 201
        
    except Exception as e:
        # Cleanup on error
        if os.path.exists(server_path):
            shutil.rmtree(server_path)
        return jsonify({"error": f"Failed to create server from template: {e}"}), 500

if __name__ == '__main__':
    initialize_app()
    
    # Load host and port from config
    host = config.get('host', '127.0.0.1')
    port = config.get('port', 5000)
    debug = config.get('debug', False)
    
    print(f"\n{'='*60}")
    print(f"🚀 MineServerGUI Backend Starting...")
    print(f"{'='*60}")
    print(f"📍 Host: {host}")
    print(f"🔌 Port: {port}")
    print(f"🌐 URL: http://{host if host != '0.0.0.0' else 'localhost'}:{port}")
    print(f"🐛 Debug: {debug}")
    print(f"{'='*60}\n")
    
    app.run(host=host, port=port, debug=debug, use_reloader=False)
else: # When run with 'flask run'
    initialize_app() 