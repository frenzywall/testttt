"""
Configuration management
This file contains all configuration and environment variables from app.py
"""
import os
import secrets
import hashlib
import tempfile
import logging

# Configure logging
logger = logging.getLogger(__name__)

# --- Supported Environment Variables ---
# SECRET_KEY: Flask secret key
# FLASK_DEBUG: Enable Flask debug mode (0/1)
# PORT: Flask app port
# TRUST_PROXY: Enable proxy trust for reverse proxy support (true/false)
# SESSION_TIMEOUT_SECONDS: Session timeout for users (seconds)
# SESSION_TIMEOUT_HOURS: Session timeout for users (hours)
# PERMANENT_SESSION_LIFETIME_DAYS: Session lifetime for admin users (days)
# REDIS_HOST: Redis host
# REDIS_PORT: Redis port
# REDIS_DB: Redis DB for app data (default 0)
# REDIS_SESSION_DB: Redis DB for session data (default 1)
# REDIS_SOCKET_TIMEOUT: Redis socket timeout (seconds)
# REDIS_SOCKET_CONNECT_TIMEOUT: Redis socket connect timeout (seconds)
# REDIS_HEALTH_CHECK_INTERVAL: Redis health check interval (seconds)
# ADMIN_USERNAME: Default admin username
# ADMIN_PASSWORD: Default admin password
# PASSKEY: Passkey for restricted actions
# RATE_LIMIT: Rate limit (requests per window)
# RATE_WINDOW: Rate limit window (seconds)
# HISTORY_LIMIT: Max history entries
# TEMP_DIR: Temp file directory
# GEMINI_API_KEY: Google Gemini API key
# GEMINI_MODEL: Google Gemini model name
# SIGNUP_ENABLED: Enable sign-up feature (true/false)
# GUEST_ACCESS_ENABLED: Enable guest skip-login feature (true/false)

# --- Load config from environment variables ---
SESSION_TIMEOUT_SECONDS = int(os.environ.get('SESSION_TIMEOUT_SECONDS', 20))
REAUTH_TIMEOUT_SECONDS = int(os.environ.get('REAUTH_TIMEOUT_SECONDS', 300))  # Default 5 minutes
PERMANENT_SESSION_LIFETIME_DAYS = int(os.environ.get('PERMANENT_SESSION_LIFETIME_DAYS', 365))
REDIS_HOST = os.environ.get('REDIS_HOST', 'redis')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
REDIS_PASSWORD = os.environ.get('REDIS_PASSWORD', 'your-redis-password')
REDIS_DB = int(os.environ.get('REDIS_DB', 0))
REDIS_SESSION_DB = int(os.environ.get('REDIS_SESSION_DB', 1))
REDIS_HISTORY_DB = int(os.environ.get('REDIS_HISTORY_DB', 2))
REDIS_SOCKET_TIMEOUT = int(os.environ.get('REDIS_SOCKET_TIMEOUT', 5))
REDIS_SOCKET_CONNECT_TIMEOUT = int(os.environ.get('REDIS_SOCKET_CONNECT_TIMEOUT', 5))
REDIS_HEALTH_CHECK_INTERVAL = int(os.environ.get('REDIS_HEALTH_CHECK_INTERVAL', 30))
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'adminpass')
PASSKEY = os.environ.get('PASSKEY')
RATE_LIMIT = int(os.environ.get('RATE_LIMIT', 5))
RATE_WINDOW = int(os.environ.get('RATE_WINDOW', 60))

HISTORY_LIMIT = int(os.environ.get('HISTORY_LIMIT', 1000))
TEMP_DIR = os.environ.get('TEMP_DIR', '/app/temp')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')
SIGNUP_ENABLED = os.environ.get('SIGNUP_ENABLED', 'false').lower() == 'true'
SIGNUP_REDIS_KEY = 'signup_enabled'
GUEST_ACCESS_ENABLED = os.environ.get('GUEST_ACCESS_ENABLED', 'false').lower() == 'true'
GUEST_ACCESS_REDIS_KEY = 'guest_access_enabled'
EXISTING_USER_MATCH_MESSAGE = 'existing_user_match'

# Add environment variable for Redis connection pool size
REDIS_MAX_CONNECTIONS = int(os.environ.get('REDIS_MAX_CONNECTIONS', 20))  # Default pool size

# Rate limiting configuration
RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'

# --- Session Timeout and Forced Logout Enhancements ---
LOGOUT_VERSION_HASH_KEY = 'logout_versions'  # Redis hash to store all user logout_versions

# User management config
USERS_KEY = 'users'

# SSE (Server-Sent Events) configuration
SSE_CHANNEL_PREFIX = 'sse_channel_'
SSE_QUEUE_PREFIX = 'sse_queue_'

# Passkey configuration
if not PASSKEY:
    logger.warning("No passkey set! Authentication will be disabled until PASSKEY is properly configured.")
    PASSKEY = secrets.token_hex(32)  

PASSKEY_HASH = hashlib.sha256(PASSKEY.encode()).hexdigest()

# Temp directory setup
temp_dir = os.getenv('TEMP_DIR', '/app/temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

# Log session timeout configuration
logger.info(f"Session timeout configured for {SESSION_TIMEOUT_SECONDS} seconds (testing mode)")
