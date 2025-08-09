from flask import Flask, render_template, request, jsonify, session, make_response, redirect, url_for, Response, stream_with_context
from datetime import datetime, timezone, timedelta
from dateutil import parser
import pytz
import extract_msg
import requests
import os
import re
import tempfile
import redis
import json
import hmac
import hashlib
import secrets
from functools import wraps
import time
import logging
from google import genai
from google.genai import types
import bcrypt
import threading
from flask import g
from flask_session import Session

# Thread synchronization for search index operations
search_index_lock = threading.Lock()
searchhaus_index_busy = False
search_index_last_rebuild = 0


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OptimizedKeyManager:
    """
    Use Redis hash tags to group related keys for efficient management
    
    Technical Benefits:
    1. All related keys stored on same Redis node (cluster support)
    2. Atomic operations across related keys
    3. Efficient bulk operations
    4. Better memory locality
    """
    def __init__(self, redis_client):
        self.redis = redis_client
        self.history_prefix = "{history}"
    
    def get_history_item_key(self, timestamp):
        return f"{self.history_prefix}:item:{timestamp}"
    
    def get_metadata_key(self):
        return f"{self.history_prefix}:metadata"
    
    def get_search_key(self, search_type, term):
        return f"{self.history_prefix}:search:{search_type}:{term}"
    
    def get_cache_key(self, cache_type, term):
        return f"{self.history_prefix}:cache:{cache_type}:{term}"
    
    def get_all_history_pattern(self):
        return f"{self.history_prefix}:*"

app = Flask(__name__, static_folder='static', static_url_path='/static')

app.secret_key = os.environ.get('SECRET_KEY')
if not app.secret_key:
    app.secret_key = secrets.token_hex(16)
    logger.warning("Using randomly generated secret key. Set SECRET_KEY environment variable for production.")


# --- Supported Environment Variables ---
# SECRET_KEY: Flask secret key
# FLASK_DEBUG: Enable Flask debug mode (0/1)
# PORT: Flask app port
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

# --- Load config from environment variables ---
SESSION_TIMEOUT_SECONDS = int(os.environ.get('SESSION_TIMEOUT_SECONDS', 20))
REAUTH_TIMEOUT_SECONDS = int(os.environ.get('REAUTH_TIMEOUT_SECONDS', 300))  # Default 5 minutes
PERMANENT_SESSION_LIFETIME_DAYS = int(os.environ.get('PERMANENT_SESSION_LIFETIME_DAYS', 365))
REDIS_HOST = os.environ.get('REDIS_HOST', 'redis')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
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
EXISTING_USER_MATCH_MESSAGE = 'existing_user_match'


# Server-side caching for history
class HistoryCache:
    def __init__(self):
        self.cache = {}
        self.etags = {}
    
    def get_cache_key(self, search_term=None, page=None, per_page=None):
        if search_term:
            return f"search_{hashlib.md5(search_term.encode()).hexdigest()}"
        else:
            return f"page_{page}_{per_page}"
    
    def get_etag(self, cache_key):
        return self.etags.get(cache_key, "0")
    
    def set_cache(self, cache_key, data, etag):
        self.cache[cache_key] = {
            'data': data,
            'timestamp': time.time(),
            'etag': etag
        }
        self.etags[cache_key] = etag
    
    def get_cache(self, cache_key):
        cached = self.cache.get(cache_key)
        if cached and (time.time() - cached['timestamp']) < 300:  # 5 min TTL
            return cached['data'], cached['etag']
        return None, None

# Global cache instance
history_cache = HistoryCache()

# Add environment variable for Redis connection pool size
REDIS_MAX_CONNECTIONS = int(os.environ.get('REDIS_MAX_CONNECTIONS', 20))  # Default pool size

logger.info(f"Session timeout configured for {SESSION_TIMEOUT_SECONDS} seconds (testing mode)")

# --- Redis client for app data (decode_responses=True, db=0) ---
try:
    redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL
    )
    redis_client = redis.Redis(connection_pool=redis_pool)
    redis_client.ping()
    logger.info("Successfully connected to Redis (app data) with connection pooling")
except redis.RedisError as e:
    logger.error(f"Redis connection error (app data): {str(e)}")
    raise  # Remove MockRedis fallback, fail hard if Redis is unavailable

# --- Redis client for Flask-Session (decode_responses=False, db=1) ---
from flask_session import Session
try:
    session_redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_SESSION_DB,  # Use a different DB for sessions
        decode_responses=False,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL
    )
    session_redis = redis.Redis(connection_pool=session_redis_pool)
    session_redis.ping()
    logger.info("Successfully connected to Redis (session data) with connection pooling")
except redis.RedisError as e:
    logger.error(f"Redis connection error (session data): {str(e)}")
    session_redis = None

# --- Redis client for History data (decode_responses=True, db=2) ---
try:
    history_redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_HISTORY_DB,  # Use a different DB for history data
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL
    )
    history_redis = redis.Redis(connection_pool=history_redis_pool)
    history_redis.ping()
    logger.info("Successfully connected to Redis (history data) with connection pooling")
    
    # Initialize key managers
    history_key_manager = OptimizedKeyManager(history_redis)
    
except redis.RedisError as e:
    logger.error(f"Redis connection error (history data): {str(e)}")
    history_redis = None
    history_key_manager = None

app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_REDIS'] = session_redis
app.config['SESSION_PERMANENT'] = True
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_KEY_PREFIX'] = 'flask_session:'
# Set a very long session lifetime for Flask-Session (admin users)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=PERMANENT_SESSION_LIFETIME_DAYS)  # 1 year default
Session(app)

# --- Session Timeout and Forced Logout Enhancements ---
LOGOUT_VERSION_HASH_KEY = 'logout_versions'  # Redis hash to store all user logout_versions



def is_session_expired():
    """Check if the current session has expired based on login time"""
    # Admin users never have session expiry
    if session.get('role') == 'admin':
        return False
    
    if not session.get('login_time'):
        return True
    
    try:
        login_time = datetime.fromisoformat(session['login_time'].replace('Z', '+00:00'))
        current_time = datetime.now(timezone.utc)
        elapsed_seconds = (current_time - login_time).total_seconds()
        return elapsed_seconds > SESSION_TIMEOUT_SECONDS
    except Exception as e:
        logger.error(f"Error checking session expiration: {str(e)}")
        return True

PASSKEY = os.environ.get('PASSKEY')
if not PASSKEY:
    logger.warning("No passkey set! Authentication will be disabled until PASSKEY is properly configured.")
    PASSKEY = secrets.token_hex(32)  

PASSKEY_HASH = hashlib.sha256(PASSKEY.encode()).hexdigest()

temp_dir = os.getenv('TEMP_DIR', '/app/temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')

RATE_LIMIT = int(os.getenv('RATE_LIMIT', 5))  
RATE_WINDOW = int(os.getenv('RATE_WINDOW', 60))  
RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'



def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if rate limiting is enabled
        if not RATE_LIMIT_ENABLED:
            return f(*args, **kwargs)
        
        ip = request.remote_addr
        current_time = int(time.time())
        redis_key = f"rate_limit:{ip}"
        try:
            # Use Redis INCR and EXPIRE for atomic rate limiting
            attempts = redis_client.incr(redis_key)
            if attempts == 1:
                redis_client.expire(redis_key, RATE_WINDOW)
            if attempts > RATE_LIMIT:
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return jsonify({
                    'status': 'error',
                    'message': 'Too many attempts. Please try again later.'
                }), 429
        except Exception as e:
            logger.error(f"Rate limiting error for IP {ip}: {str(e)}")
            # Fail open if Redis is down
            pass
        return f(*args, **kwargs)
    return decorated_function


def get_stored_data():
    """Get data from Redis with proper error handling"""
    try:
        data = redis_client.get('change_management_data')
        return json.loads(data) if data else None
    except Exception as e:
        logger.error(f"Error retrieving data from Redis: {str(e)}")
        return None

def save_stored_data(data):
    """Save data to Redis with proper error handling"""
    try:
        redis_client.set('change_management_data', json.dumps(data))
        return True
    except Exception as e:
        logger.error(f"Error saving data to Redis: {str(e)}")
        return False

def get_history_item_by_timestamp(timestamp):
    """Get a single history item by timestamp"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return None
        item_key = history_key_manager.get_history_item_key(timestamp)
        item_data = history_redis.get(item_key)
        if item_data:
            logger.debug(f"Retrieved history item: {item_key}")
            return json.loads(item_data)
        logger.warning(f"History item not found: {item_key}")
        return None
    except Exception as e:
        logger.error(f"Error getting history item {timestamp}: {str(e)}")
        return None





def save_to_history(data):
    """Save current data to history with individual Redis keys for better performance"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return False
        current_timestamp = datetime.now().timestamp()
        
        # Store the full history item as a separate Redis key
        history_item = {
            'timestamp': current_timestamp,
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'title': data.get('header_title', 'Change Weekend'),
            'data': data
        }
        
        # Use pipelining for bulk operations
        with history_redis.pipeline() as pipe:
            # Store individual item
            item_key = history_key_manager.get_history_item_key(current_timestamp)
            pipe.set(item_key, json.dumps(history_item))
            
            # Store metadata in sorted set for efficient pagination
            metadata = {
                'title': data.get('header_title', 'Change Weekend'),
                'date': data.get('date', ''),
                'service_count': len(data.get('services', []))
            }
            metadata_key = history_key_manager.get_metadata_key()
            # Ensure timestamp is stored as float for proper sorting
            pipe.zadd(metadata_key, {json.dumps(metadata): float(current_timestamp)})
            
            # Cleanup old entries (keep only HISTORY_LIMIT most recent)
            total_items = history_redis.zcard(metadata_key)
            if total_items > HISTORY_LIMIT:
                # Remove oldest items
                items_to_remove = total_items - HISTORY_LIMIT
                oldest_timestamps = history_redis.zrange(metadata_key, 0, items_to_remove - 1)
                for timestamp in oldest_timestamps:
                    pipe.delete(history_key_manager.get_history_item_key(timestamp))
                pipe.zremrangebyrank(metadata_key, 0, items_to_remove - 1)
            
            # Execute all operations in single network round trip
            pipe.execute()
        
        # Update search index for new data (async)
        threading.Thread(target=create_search_index, daemon=True).start()
        return True
    except Exception as e:
        logger.error(f"Error saving to history: {str(e)}")
        return False

def get_paginated_history_optimized(page, per_page):
    """Get paginated history using Redis ZREVRANGE for O(1) performance"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return [], {'current_page': page, 'per_page': per_page, 'total_items': 0, 'total_pages': 0, 'has_next': False, 'has_prev': False}
        metadata_key = history_key_manager.get_metadata_key()
        total_count = history_redis.zcard(metadata_key)
        
        if total_count == 0:
            return [], {'current_page': page, 'per_page': per_page, 'total_items': 0, 'total_pages': 0, 'has_next': False, 'has_prev': False}
        
        # Calculate range for this page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page - 1
        
        # Get metadata for this page using ZREVRANGE (newest first)
        metadata_items = history_redis.zrevrange(metadata_key, start_idx, end_idx, withscores=True)
        
        # Fetch only the needed items
        items = []
        for metadata_json, timestamp in metadata_items:
            item = get_history_item_by_timestamp(timestamp)
            if item:
                items.append(item)
        
        total_pages = (total_count + per_page - 1) // per_page
        
        return items, {
            'current_page': page,
            'per_page': per_page,
            'total_items': total_count,
            'total_pages': total_pages,
            'has_next': page < total_pages,
            'has_prev': page > 1
        }
        
    except Exception as e:
        logger.error(f"Error getting paginated history: {str(e)}")
        return [], {'current_page': page, 'per_page': per_page, 'total_items': 0, 'total_pages': 0, 'has_next': False, 'has_prev': False}



def extract_date_from_subject(subject):
    date_patterns = [
        r'\d{2}-\d{2}-\d{4}',
        r'\d{2}/\d{2}/\d{4}',
        r'\d{4}-\d{2}-\d{2}'
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, subject)
        if match:
            date_str = match.group(0)
        
            try:
                parsed_date = parser.parse(date_str)
                return parsed_date.strftime('%Y-%m-%d')
            except:
                return date_str
    return None

def get_ai_performance_stats():
    """Get AI performance stats from Redis"""
    try:
        stats_data = redis_client.get('ai_performance_stats')
        if stats_data:
            stats = json.loads(stats_data)
            # Convert datetime strings back to datetime objects
            if stats.get('last_request_time'):
                stats['last_request_time'] = datetime.fromisoformat(stats['last_request_time'])
            if stats.get('daily_reset_date'):
                stats['daily_reset_date'] = datetime.fromisoformat(stats['daily_reset_date']).date()
            return stats
        else:
            # Return default stats if none exist
            return {
                'requests_today': 0,
                'total_requests': 0,
                'response_times': [],
                'last_request_time': None,
                'success_count': 0,
                'error_count': 0,
                'daily_reset_date': datetime.now().date()
            }
    except Exception as e:
        logger.error(f"Error getting AI performance stats: {str(e)}")
        return {
            'requests_today': 0,
            'total_requests': 0,
            'response_times': [],
            'last_request_time': None,
            'success_count': 0,
            'error_count': 0,
            'daily_reset_date': datetime.now().date()
        }

def save_ai_performance_stats(stats):
    """Save AI performance stats to Redis"""
    try:
        # Convert datetime objects to strings for JSON serialization
        stats_copy = stats.copy()
        if stats_copy.get('last_request_time'):
            stats_copy['last_request_time'] = stats_copy['last_request_time'].isoformat()
        if stats_copy.get('daily_reset_date'):
            stats_copy['daily_reset_date'] = stats_copy['daily_reset_date'].isoformat()
        
        redis_client.set('ai_performance_stats', json.dumps(stats_copy))
        return True
    except Exception as e:
        logger.error(f"Error saving AI performance stats: {str(e)}")
        return False

def track_ai_request(response_time, success=True):
    """Track AI API request performance"""
    stats = get_ai_performance_stats()
    
    # Reset daily counters if it's a new day
    current_date = datetime.now().date()
    if stats['daily_reset_date'] != current_date:
        stats['requests_today'] = 0
        stats['daily_reset_date'] = current_date
        logger.info("Reset daily request counter for new day")
    
    # Update counters
    stats['requests_today'] += 1
    stats['total_requests'] += 1
    stats['last_request_time'] = datetime.now()
    
    if success:
        stats['success_count'] += 1
    else:
        stats['error_count'] += 1
    
    # Track response times (keep only last 100 for average)
    stats['response_times'].append(response_time)
    if len(stats['response_times']) > 100:
        stats['response_times'] = stats['response_times'][-100:]
    
    # Save to Redis
    save_ai_performance_stats(stats)
    
    # Debug logging
    logger.info(f"AI request tracked - Success: {success}, Response time: {response_time:.2f}s, Today's count: {stats['requests_today']}")

def calculate_performance_metrics():
    """Calculate performance metrics from tracked data"""
    stats = get_ai_performance_stats()
    
    # Debug logging
    logger.info(f"Calculating metrics - Total requests today: {stats['requests_today']}, Success: {stats['success_count']}, Errors: {stats['error_count']}")
    
    # Calculate average response time
    if stats['response_times']:
        avg_response_time = sum(stats['response_times']) / len(stats['response_times'])
        response_time_str = f"{avg_response_time:.2f}s"
    else:
        response_time_str = '--'
    
    # Calculate success rate
    total_requests = stats['success_count'] + stats['error_count']
    if total_requests > 0:
        success_rate = (stats['success_count'] / total_requests) * 100
        success_rate_str = f"{success_rate:.1f}%"
    else:
        success_rate_str = '--'
    
    # Format last request time
    if stats['last_request_time']:
        now = datetime.now()
        time_diff = now - stats['last_request_time']
        
        if time_diff.total_seconds() < 60:
            last_request_str = f"{int(time_diff.total_seconds())}s ago"
        elif time_diff.total_seconds() < 3600:
            last_request_str = f"{int(time_diff.total_seconds() / 60)}m ago"
        elif time_diff.total_seconds() < 86400:
            last_request_str = f"{int(time_diff.total_seconds() / 3600)}h ago"
        else:
            last_request_str = f"{int(time_diff.total_seconds() / 86400)}d ago"
    else:
        last_request_str = 'Never'
    
    metrics = {
        'responseTime': response_time_str,
        'successRate': success_rate_str,
        'requestCount': stats['requests_today'],
        'lastRequest': last_request_str
    }
    
    # Debug logging
    logger.info(f"Calculated metrics: {metrics}")
    
    return metrics

# --- Helper: Parse last_login as timezone-aware datetime ---
def parse_last_login(val):
    try:
        if val and val != '-':
            dt = datetime.fromisoformat(val)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        else:
            return datetime.min.replace(tzinfo=timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)

# User management config
ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'adminpass')
USERS_KEY = 'users'

# Helper: hash password
def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed.encode())

# Bootstrap admin user if no users exist (moved from @app.before_first_request)
def bootstrap_admin():
    # Use Redis transaction to avoid race condition
    for _ in range(5):  # Retry up to 5 times
        try:
            with redis_client.pipeline() as pipe:
                pipe.watch(USERS_KEY)
                users = pipe.get(USERS_KEY)
                if users:
                    pipe.unwatch()
                    return  # Admin already exists, nothing to do
                admin_user = {
                    'username': ADMIN_USERNAME,
                    'password': hash_password(ADMIN_PASSWORD),
                    'role': 'admin',
                    'last_login': '-'
                }
                pipe.multi()
                pipe.set(USERS_KEY, json.dumps({ADMIN_USERNAME: admin_user}))
                pipe.execute()
                return
        except redis.WatchError:
            # Key changed, retry
            continue
        except Exception as e:
            logger.error(f"Error bootstrapping admin user: {e}")
            break

# Call bootstrap_admin at startup
bootstrap_admin()

# Load signup setting from Redis
try:
    signup_setting = redis_client.get(SIGNUP_REDIS_KEY)
    if signup_setting is not None:
        SIGNUP_ENABLED = signup_setting == '1'
        logger.info(f"Loaded signup setting from Redis: {'enabled' if SIGNUP_ENABLED else 'disabled'}")
except Exception as e:
    logger.warning(f"Could not load signup setting from Redis: {str(e)}")

# Get users dict
def get_users():
    try:
        users = redis_client.get(USERS_KEY)
        return json.loads(users) if users else {}
    except Exception as e:
        logger.error(f"Error loading users: {e}")
        return None

def save_users(users):
    redis_client.set(USERS_KEY, json.dumps(users))

def get_admin_usernames():
    users = get_users()
    return [u for u, uobj in users.items() if uobj.get('role') == 'admin']

# Auth endpoints
@app.route('/login', methods=['POST'])
@rate_limit
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')
    users = get_users()
    user = users.get(username)
    if not user or not check_password(password, user['password']):
        return jsonify({'status': 'error', 'message': 'Invalid credentials'}), 401
    
    # Make session permanent and set session data
    session.permanent = True
    session['username'] = username
    session['role'] = user['role']
    session['login_time'] = datetime.now(timezone.utc).isoformat()
    session['last_activity'] = datetime.now(timezone.utc).isoformat()
    # Set logout_version for forced logout tracking
    try:
        logout_version = redis_client.hget(LOGOUT_VERSION_HASH_KEY, username) or secrets.token_hex(8)
    except Exception as e:
        logger.error(f"Error getting logout version for {username}: {str(e)}")
        logout_version = secrets.token_hex(8)
    session['logout_version'] = logout_version
    try:
        redis_client.hset(LOGOUT_VERSION_HASH_KEY, username, logout_version)
    except Exception as e:
        logger.error(f"Error setting logout version for {username}: {str(e)}")
    
    # Note: PERMANENT_SESSION_LIFETIME is set to 1 year globally
    # Custom session timeout logic is handled in require_login() for non-admin users
    if user['role'] == 'admin':
        logger.info(f"Admin user {username} logged in - session set to 1 year")
    else:
        logger.info(f"Regular user {username} logged in - session timeout: {SESSION_TIMEOUT_SECONDS} seconds")
    
    # Update last_login
    user['last_login'] = datetime.now(timezone.utc).isoformat()
    users[username] = user
    save_users(users)
    # Publish SSE login event to all admins
    for admin_username in get_admin_usernames():
        publish_sse_event(admin_username, 'login', {'username': username, 'last_login': user['last_login']})
    return jsonify({'status': 'success', 'username': username, 'role': user['role']})

@app.route('/logout', methods=['POST'])
def logout():
    username = session.get('username')
    if username:
        try:
            redis_client.hdel(LOGOUT_VERSION_HASH_KEY, username)
        except Exception as e:
            logger.error(f"Error clearing logout version for {username}: {str(e)}")
    session.clear()
    return jsonify({'status': 'success'})

@app.route('/current-user', methods=['GET'])
def current_user():
    username = session.get('username')
    role = session.get('role')
    if not username:
        return jsonify({'logged_in': False})
    
    return jsonify({
        'logged_in': True, 
        'username': username, 
        'role': role
    })

# Admin user management
@app.route('/users', methods=['GET', 'POST', 'DELETE', 'PUT'])
def manage_users():
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    try:
        users = get_users()
        if users is None:
            return jsonify({'status': 'error', 'message': 'Failed to load users'}), 500
        if request.method == 'GET':
            # Return users with last_login, sorted by last_login descending (latest first)
            user_list = [
                {'username': u, 'last_login': users[u].get('last_login', '-'), 'created_by': users[u].get('created_by', 'admin')}
                for u in users if users[u]['role'] != 'admin']
            user_list.sort(key=lambda x: parse_last_login(x['last_login']), reverse=True)
            return jsonify({'users': user_list})
        elif request.method == 'POST':
            data = request.json
            username = data.get('username', '').strip()
            password = data.get('password', '')
            if not username or not password:
                return jsonify({'status': 'error', 'message': 'Username and password required'}), 400
            if username in users:
                return jsonify({'status': 'error', 'message': 'User already exists'}), 400
            users[username] = {'username': username, 'password': hash_password(password), 'role': 'user', 'last_login': '-', 'created_by': 'admin'}
            save_users(users)
            return jsonify({'status': 'success'})
        elif request.method == 'DELETE':
            data = request.json
            username = data.get('username', '').strip()
            if not username or username not in users:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
            if users[username]['role'] == 'admin':
                return jsonify({'status': 'error', 'message': 'Cannot delete admin'}), 400
            del users[username]
            save_users(users)
            return jsonify({'status': 'success'})
        elif request.method == 'PUT':
            data = request.json
            username = data.get('username', '').strip()
            password = data.get('password', '')
            if not username or not password:
                return jsonify({'status': 'error', 'message': 'Username and password required'}), 400
            if username not in users:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
            if users[username]['role'] == 'admin':
                return jsonify({'status': 'error', 'message': 'Cannot update admin password here'}), 400
            users[username]['password'] = hash_password(password)
            save_users(users)
            return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"/users route error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@app.route('/change-password', methods=['POST'])
def change_password():
    username = session.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    users = get_users()
    user = users.get(username)
    data = request.json
    old = data.get('old_password', '')
    new = data.get('new_password', '')
    if not check_password(old, user['password']):
        return jsonify({'status': 'error', 'message': 'Old password incorrect'}), 400
    user['password'] = hash_password(new)
    users[username] = user
    save_users(users)
    return jsonify({'status': 'success'})

# --- SSE Pub/Sub Setup ---
SSE_CHANNEL_PREFIX = 'sse_channel_'

# Helper: Publish SSE event to a user
def publish_sse_event(username, event_type, data=None):
    channel = f'{SSE_CHANNEL_PREFIX}{username}'
    payload = {'event': event_type, 'data': data or {}}
    logger.info(f"Publishing SSE event '{event_type}' to {channel}: {payload}")
    redis_client.publish(channel, json.dumps(payload))

# SSE endpoint for logged-in user
@app.route('/events')
def sse_events():
    username = session.get('username')
    if not username:
        return Response('Unauthorized', status=401)
    
    channel = f'{SSE_CHANNEL_PREFIX}{username}'
    pubsub = redis_client.pubsub()
    pubsub.subscribe(channel)

    def event_stream():
        try:
            while True:
                message = pubsub.get_message(timeout=1.0)
                if message and message['type'] == 'message':
                    payload = json.loads(message['data'])
                    event = payload.get('event')
                    data = payload.get('data', {})
                    yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                time.sleep(0.5)
        finally:
            pubsub.close()
    
    headers = {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    return Response(stream_with_context(event_stream()), headers=headers)

# --- Update admin logout to use SSE ---
@app.route('/admin-logout-user', methods=['POST'])
def admin_logout_user():
    """Admin endpoint to log out a specific user"""
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    data = request.json
    target_username = data.get('username', '').strip()
    if not target_username:
        return jsonify({'status': 'error', 'message': 'Username required'}), 400
    
    try:
        # Check if user exists
        users = get_users()
        if target_username not in users:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        
        # Store new logout_version in Redis for server-side session invalidation
        new_version = secrets.token_hex(8)
        try:
            redis_client.hset(LOGOUT_VERSION_HASH_KEY, target_username, new_version)
        except Exception as e:
            logger.error(f"Error setting logout version for {target_username}: {str(e)}")
        
        # Send SSE logout event to the user
        publish_sse_event(target_username, 'logout', {'reason': 'Logged out by admin'})
        # Send SSE user-logout event to all admins except the user being logged out
        for admin_username in get_admin_usernames():
            if admin_username != target_username:
                publish_sse_event(admin_username, 'user-logout', {'username': target_username, 'by': session.get('username')})
        logger.info(f"Admin {session.get('username')} logged out user {target_username}")
        return jsonify({'status': 'success', 'message': f'Logout event sent for user {target_username}'})
            
    except Exception as e:
        logger.error(f"Error sending SSE logout event: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Failed to send logout event'}), 500



# Inject user info into templates
@app.context_processor
def inject_user():
    return dict(current_user=session.get('username'), current_role=session.get('role'))

@app.before_request
def require_login():
    allowed = [
        '/login', '/logout', '/current-user', '/ai-chat-enabled', '/signup-enabled', '/toggle-signup', '/signup', '/static/', '/favicon.ico', '/misc/', '/users', '/change-password', '/admin-logout-user', '/events',
        '/get-history', '/load-from-history', '/delete-from-history', '/rebuild-search-index'
    ]
    if request.path.startswith('/static/') or request.path.startswith('/misc/'):
        return
    if request.path in allowed or request.path.startswith('/users') or request.path.startswith('/change-password'):
        return
    if not session.get('username'):
        return redirect(url_for('login_page'))
    
    # --- Session Timeout Check (skip for admin users) ---
    if session.get('role') != 'admin':  # Only check timeout for non-admin users
        now = datetime.now(timezone.utc)
        last_activity_str = session.get('last_activity')
        if last_activity_str:
            try:
                last_activity = datetime.fromisoformat(last_activity_str.replace('Z', '+00:00'))
                if (now - last_activity).total_seconds() > SESSION_TIMEOUT_SECONDS:
                    session.clear()
                    return redirect(url_for('login_page'))
            except Exception as e:
                logger.error(f"Error parsing last_activity: {str(e)}")
                session.clear()
                return redirect(url_for('login_page'))
        else:
            session.clear()
            return redirect(url_for('login_page'))
    
    # --- Forced Logout Check ---
    username = session.get('username')
    if username:
        session_version = session.get('logout_version')
        try:
            redis_version = redis_client.hget(LOGOUT_VERSION_HASH_KEY, username)
        except Exception as e:
            logger.error(f"Error getting logout version for {username}: {str(e)}")
            redis_version = None
        if redis_version and session_version != redis_version:
            session.clear()
            resp = redirect(url_for('login_page'))
            resp.set_cookie('session', '', expires=0)
            return resp
    # --- Update last_activity ---
    session['last_activity'] = datetime.now(timezone.utc).isoformat()

@app.route('/signup-enabled', methods=['GET'])
def signup_enabled():
    """Get current sign-up status"""
    try:
        # Use Redis transaction for atomic operation
        with redis_client.pipeline() as pipe:
            pipe.watch(SIGNUP_REDIS_KEY)
            signup_setting = redis_client.get(SIGNUP_REDIS_KEY)
            
            if signup_setting is not None:
                global SIGNUP_ENABLED
                SIGNUP_ENABLED = signup_setting == '1'
            else:
                # Initialize Redis with current global value
                pipe.multi()
                pipe.set(SIGNUP_REDIS_KEY, '1' if SIGNUP_ENABLED else '0')
                pipe.execute()
    except Exception as e:
        logger.error(f"Error checking signup status from Redis: {str(e)}")
        # Fallback to global variable if Redis fails
        pass
    
    return jsonify({'enabled': SIGNUP_ENABLED})

@app.route('/toggle-signup', methods=['POST'])
@rate_limit
def toggle_signup():
    """Admin endpoint to toggle sign-up feature"""
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    
    try:
        # Use Redis transaction for atomic operation
        with redis_client.pipeline() as pipe:
            pipe.watch(SIGNUP_REDIS_KEY)
            global SIGNUP_ENABLED
            SIGNUP_ENABLED = not SIGNUP_ENABLED
            
            pipe.multi()
            pipe.set(SIGNUP_REDIS_KEY, '1' if SIGNUP_ENABLED else '0')
            pipe.execute()
            
        logger.info(f"Sign-up feature {'enabled' if SIGNUP_ENABLED else 'disabled'} by admin {session.get('username')}")
        return jsonify({'status': 'success', 'enabled': SIGNUP_ENABLED})
    except Exception as e:
        logger.error(f"Error toggling sign-up: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/signup', methods=['POST'])
@rate_limit
def signup():
    """Handle user sign-up"""
    if not SIGNUP_ENABLED:
        return jsonify({'status': 'error', 'message': 'Sign-up is currently disabled'}), 403
    
    data = request.json
    if not data:
        return jsonify({'status': 'error', 'message': 'Invalid request data'}), 400
    
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'status': 'error', 'message': 'Username and password required'}), 400
    
    if len(username) < 3:
        return jsonify({'status': 'error', 'message': 'Username must be at least 3 characters'}), 400
    
    try:
        users = get_users()
        if username in users:
            existing_user = users[username]
            if check_password(password, existing_user['password']):
                logger.info(f"Signup attempt with existing credentials: {username}")
                return jsonify({'status': 'error', 'message': EXISTING_USER_MATCH_MESSAGE}), 400
            else:
                logger.info(f"Signup attempt with existing username but wrong password: {username}")
                return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
        
        # Only validate password length for NEW users
        if len(password) < 6:
            return jsonify({'status': 'error', 'message': 'Password must be at least 6 characters'}), 400
        
        # Create new user
        users[username] = {
            'username': username,
            'password': hash_password(password),
            'role': 'user',
            'last_login': '-',
            'created_by': 'signup'
        }
        save_users(users)
        
        logger.info(f"New user signed up: {username}")
        return jsonify({'status': 'success', 'message': 'Account created successfully'})
        
    except Exception as e:
        logger.error(f"Error during signup: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Failed to create account'}), 500

@app.route('/login', methods=['GET'])
def login_page():
    if session.get('username'):
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'GET':
        stored_data = get_stored_data()
        if stored_data:
            if 'last_modified' not in stored_data:
                stored_data['last_modified'] = datetime.now().timestamp()
                save_stored_data(stored_data)
            response = make_response(render_template(
                'result.html', 
                data=stored_data, 
                header_title=stored_data.get('header_title', 'Change Weekend'),
                data_timestamp=stored_data.get('last_modified', 0),
                last_edited_by=stored_data.get('last_edited_by', None)
            ))
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            return response
        

        empty_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'error': None,
            'is_landing_page': True,
            'header_title': 'Change Weekend',
            'last_modified': datetime.now().timestamp(),
            'last_edited_by': None
        }
        response = make_response(render_template(
            'result.html', 
            data=empty_data, 
            header_title='Change Weekend',
            data_timestamp=empty_data['last_modified'],
            last_edited_by=None
        ))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    
    if 'file' not in request.files:
        return render_template('result.html', data={
            'services': [],
            'error': 'No file uploaded',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    file = request.files['file']
    if file.filename == '' or not file.filename.endswith('.msg'):
        return render_template('result.html', data={
            'services': [],
            'error': 'Invalid file or no file selected',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=temp_dir, suffix='.msg', delete=False) as temp_file:
            temp_path = temp_file.name
            file.save(temp_path)
            
            if not os.path.exists(temp_path):
                raise FileNotFoundError(f"Failed to save temporary file at {temp_path}")
            
            msg = extract_msg.Message(temp_path)
            maintenance_date = extract_date_from_subject(msg.subject)
            if not maintenance_date:
                msg_date = parser.parse(msg.date)
                maintenance_date = msg_date.strftime("%Y-%m-%d")

            email_data = {
                'subject': msg.subject,
                'sender': msg.sender,
                'date': maintenance_date,
                'body': msg.body
            }

            # Use only AI processing with performance tracking
            import ai_processor
            start_time = time.time()
            services_data = ai_processor.process_email_content(email_data)
            end_time = time.time()
            response_time = end_time - start_time
            
            # Track the request
            success = 'error' not in services_data or not services_data['error']
            track_ai_request(response_time, success)
            
            logger.info("Using AI processing for email content")
            
            if 'error' in services_data and services_data['error']:
                return render_template('result.html', data={
                    'services': [],
                    'error': services_data['error'],
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'end_date': datetime.now().strftime('%Y-%m-%d'),
                    'original_subject': '',
                    'original_body': ''
                }, header_title='Change Weekend')

            try:
                date_obj = datetime.strptime(services_data['date'], "%Y-%m-%d")
                from calendar import month_name
                header_title = f"{month_name[date_obj.month]} ChangeWeekend"
            except:
                header_title = "Change Weekend"
            services_data['header_title'] = header_title
            services_data['processing_method'] = 'AI'
            
            return render_template('result.html', data=services_data, header_title=header_title)

    except Exception as e:
        logger.error(f"Error processing upload: {str(e)}")
        return render_template('result.html', data={
            'services': [],
            'error': f'Error processing email: {str(e)}',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    finally:
        try:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
        except Exception as e:
            logger.warning(f"Could not remove temp file: {str(e)}")

@app.route('/sync-all-data', methods=['POST'])
def sync_all_data():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
    """Save all data at once to Redis"""
    data = request.json
    
    if not data or 'services' not in data:
        return jsonify({'status': 'error', 'message': 'Invalid data structure'})
    stored_data = get_stored_data() or {}
    for key in data:
        stored_data[key] = data[key]
    
    if 'services' not in stored_data:
        stored_data['services'] = []
    if 'date' not in stored_data:
        stored_data['date'] = datetime.now().strftime('%Y-%m-%d')
    if 'end_date' not in stored_data:
        stored_data['end_date'] = stored_data['date']
    if 'header_title' not in stored_data:
        stored_data['header_title'] = 'Change Weekend'

    # Store the username of the last editor (prefer request, fallback to session)
    username = data.get('username') or session.get('username', 'Unknown')
    stored_data['last_edited_by'] = username
    stored_data['last_modified'] = datetime.now().timestamp()
    save_stored_data(stored_data)
    response = jsonify({
        'status': 'success', 
        'timestamp': stored_data['last_modified']
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/sync-to-history', methods=['POST'])
def sync_to_history():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
    """Save all data to Redis and also save to history"""
    data = request.json
    
    if not data or 'services' not in data:
        return jsonify({'status': 'error', 'message': 'Invalid data structure'})
    
    stored_data = get_stored_data() or {}
    for key in data:
        stored_data[key] = data[key]
    
    if 'services' not in stored_data:
        stored_data['services'] = []
    if 'date' not in stored_data:
        stored_data['date'] = datetime.now().strftime('%Y-%m-%d')
    if 'end_date' not in stored_data:
        stored_data['end_date'] = stored_data['date']
    if 'header_title' not in stored_data:
        stored_data['header_title'] = 'Change Weekend'

    # Store the username of the last editor (prefer request, fallback to session)
    username = data.get('username') or session.get('username', 'Unknown')
    stored_data['last_edited_by'] = username
    stored_data['last_modified'] = datetime.now().timestamp()
    save_stored_data(stored_data)
    
    save_to_history(stored_data)
    
    # Invalidate server-side cache when new data is saved to history
    history_cache.cache.clear()
    history_cache.etags.clear()
    
    # No need to update pagination index - using Redis sorted sets now
    
    # Rebuild search index for new data (async)
    threading.Thread(target=create_search_index, daemon=True).start()
    

    
    response = jsonify({
        'status': 'success', 
        'timestamp': stored_data['last_modified']
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/check-updates', methods=['GET'])
def check_updates():
    """Check if data has been updated since provided timestamp"""
    client_timestamp = request.args.get('since', 0, type=float)
    
    stored_data = get_stored_data() or {}
    server_timestamp = stored_data.get('last_modified', 0)
    
    response = jsonify({
        'updated': server_timestamp > client_timestamp,
        'timestamp': server_timestamp
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/get-history', methods=['GET'])
@rate_limit
def get_history():
    """Get the sync history with pagination and search"""
    search = request.args.get('search', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)  # Changed to 10 for better UX
    
    # Generate cache key
    cache_key = history_cache.get_cache_key(search, page, per_page)
    
    # Check ETag from request
    if_none_match = request.headers.get('If-None-Match')
    cached_data, cached_etag = history_cache.get_cache(cache_key)
    
    if cached_data and if_none_match == cached_etag:
        return '', 304  # Not Modified
    
    # Generate new data
    if search:
        data = search_history_redis_optimized(search)
        is_empty = (len(data) == 0)
        response = jsonify({
            'items': data,
            'is_empty': is_empty
        })
    else:
        # Use optimized pagination for O(1) performance
        items, pagination = get_paginated_history_optimized(page, per_page)
        is_empty = (len(items) == 0)
        data = {
            'items': items,
            'pagination': pagination,
            'is_empty': is_empty
        }
        response = jsonify(data)
    
    # Generate ETag and cache (simplified timestamp-based)
    etag = f"{int(time.time())}"
    history_cache.set_cache(cache_key, data, etag)
    
    response.headers['ETag'] = etag
    response.headers['Cache-Control'] = 'private, max-age=300'
    return response

@app.route('/load-from-history/<timestamp>', methods=['GET'])
@rate_limit
def load_from_history(timestamp):
    """Load data from a specific history point"""
    try:
        # Get the specific history item
        history_item = get_history_item_by_timestamp(timestamp)
        
        if not history_item:
            return jsonify({'status': 'error', 'message': 'History entry not found'})
        
        # Set a temporary session key to store the data (without saving to Redis)
        session['temp_history_data'] = history_item['data']
        
        # Publish SSE event to the current user
        username = session.get('username')
        if username:
            publish_sse_event(username, 'history-loaded', {
                'timestamp': timestamp,
                'title': history_item['data'].get('header_title', 'Change Weekend')
            })
            logger.info(f"History loaded event sent to user {username} for timestamp {timestamp}")
        
        # Return success without modifying the main Redis data
        response = jsonify({'status': 'success', 'data': history_item['data']})
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
        
    except Exception as e:
        logger.error(f"Error loading history entry: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Error loading entry: {str(e)}'}), 500

@app.route('/delete-from-history/<timestamp>', methods=['DELETE'])
@rate_limit
def delete_from_history(timestamp):
    """Delete a specific history entry by timestamp"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return jsonify({'status': 'error', 'message': 'History service unavailable'}), 500
        # Remove from metadata sorted set
        metadata_key = history_key_manager.get_metadata_key()
        all_timestamps = history_redis.zrevrange(metadata_key, 0, -1, withscores=True)
        found = False
        
        for metadata_json, ts in all_timestamps:
            if str(ts) == timestamp:
                # Remove from metadata sorted set
                history_redis.zrem(metadata_key, metadata_json)
                # Remove the actual item
                item_key = history_key_manager.get_history_item_key(ts)
                history_redis.delete(item_key)
                found = True
                break
        
        if not found:
            return jsonify({'status': 'error', 'message': 'History entry not found'})
        
        # Invalidate server-side cache
        history_cache.cache.clear()
        history_cache.etags.clear()
        
        # Rebuild search index after deletion (async)
        threading.Thread(target=create_search_index, daemon=True).start()
        
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error deleting history entry: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Error deleting entry: {str(e)}'}), 500

@app.route('/save-changes', methods=['POST'])
def save_changes():
    """Save changes to a specific row"""
    stored_data = get_stored_data()
    if not stored_data:
        stored_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend'
        }
    
    data = request.json
    
    found = False
    for service in stored_data['services']:
        if service['name'] == data['service'] or (not service['name'] and not data['service']):
            service['name'] = data['service']
            service['start_time'] = data['startTime']
            service['end_time'] = data['endTime']
            service['comments'] = data.get('comments', '')
            service['priority'] = data.get('impactPriority', 'low')
            service['end_date'] = data.get('endDate', stored_data['date'])
            found = True
            break
    
    if not found:
        stored_data['services'].append({
            'name': data['service'],
            'start_time': data['startTime'],
            'end_time': data['endTime'],
            'end_date': data.get('endDate', stored_data['date']),
            'comments': data.get('comments', ''),
            'priority': data.get('impactPriority', 'low')
        })
    
    stored_data['services'] = [s for s in stored_data['services'] if s['name'].strip()]
    
    if 'date' in data and data['date']:
        stored_data['date'] = data['date']
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/delete-row', methods=['POST'])
def delete_row():
    """Delete a row from the stored data"""
    stored_data = get_stored_data()
    if not stored_data:
        return jsonify({'status': 'error', 'message': 'No data to delete'})
    
    data = request.json
    
    stored_data['services'] = [
        service for service in stored_data['services']
        if service['name'] != data['service']
    ]
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/save-parsed-data', methods=['POST'])
def save_parsed_data():
    """Save the entire dataset from parsed data editing"""
    stored_data = get_stored_data()
    if not stored_data:
        stored_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend'
        }
    
    data = request.json
    
    stored_data['services'] = data['services']
    
    if 'date' in data:
        stored_data['date'] = data['date']
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/reset-data', methods=['POST'])
def reset_data():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
    """Reset all stored data"""
    try:
        empty_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend',
            'last_modified': datetime.now().timestamp()
        }
        redis_client.set('change_management_data', json.dumps(empty_data))
        response = jsonify({'status': 'success', 'timestamp': empty_data['last_modified']})
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        logger.error(f"Error resetting data: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)})

# --- Use SESSION_TIMEOUT_SECONDS for both session and re-auth window ---
# Remove REAUTH_WINDOW_SECONDS and use SESSION_TIMEOUT_SECONDS

@app.route('/set-reauth', methods=['POST'])
def set_reauth():
    """Set a server-side re-authentication window after passkey validation"""
    if not session.get('username'):
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    session['reauth_until'] = (datetime.now(timezone.utc) + timedelta(seconds=REAUTH_TIMEOUT_SECONDS)).isoformat()
    return jsonify({'status': 'success', 'reauth_until': session['reauth_until']})

# Update /validate-passkey to set reauth_until on success
@app.route('/validate-passkey', methods=['POST'])
@rate_limit
def validate_passkey():
    """Validate the provided passkey against the stored hash and set reauth window"""
    data = request.json
    if not data or not isinstance(data, dict):
        return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
    provided_passkey = data.get('passkey', '')
    if not provided_passkey or not isinstance(provided_passkey, str):
        return jsonify({'status': 'error', 'message': 'Passkey is required'}), 400
    provided_hash = hashlib.sha256(provided_passkey.encode()).hexdigest()
    if hmac.compare_digest(provided_hash, PASSKEY_HASH):
        logger.info(f"Successful authentication from {request.remote_addr}")
        # Set reauth_until in session using REAUTH_TIMEOUT_SECONDS
        session['reauth_until'] = (datetime.now(timezone.utc) + timedelta(seconds=REAUTH_TIMEOUT_SECONDS)).isoformat()
        return jsonify({'status': 'success', 'valid': True, 'reauth_until': session['reauth_until']})
    else:
        logger.warning(f"Failed authentication attempt from {request.remote_addr}")
        return jsonify({'status': 'error', 'valid': False, 'message': 'Invalid passkey'}), 401

# Helper to check if re-auth window is valid

def is_reauth_valid():
    reauth_until = session.get('reauth_until')
    if not reauth_until:
        return False
    try:
        reauth_until_dt = datetime.fromisoformat(reauth_until.replace('Z', '+00:00'))
        return datetime.now(timezone.utc) < reauth_until_dt
    except Exception as e:
        logger.error(f"Error parsing reauth_until: {str(e)}")
        return False

# Example usage in a protected route (add to any passkey-protected endpoint):
# if not is_reauth_valid():
#     return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401

@app.route('/check-reauth', methods=['GET'])
def check_reauth():
    if not session.get('username'):
        return jsonify({'valid': False}), 401
    from datetime import datetime, timezone
    reauth_until = session.get('reauth_until')
    if not reauth_until:
        return jsonify({'valid': False})
    try:
        reauth_until_dt = datetime.fromisoformat(reauth_until.replace('Z', '+00:00'))
        if datetime.now(timezone.utc) < reauth_until_dt:
            return jsonify({'valid': True})
        else:
            return jsonify({'valid': False})
    except Exception:
        return jsonify({'valid': False})

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    try:
        redis_client.ping()
        history_status = 'connected' if history_redis and history_redis.ping() else 'disconnected'
        search_index_status = 'busy' if is_search_index_busy() else 'idle'
        
        return jsonify({
            'status': 'healthy',
            'redis': 'connected',
            'history_redis': history_status,
            'search_index': search_index_status,
            'search_index_last_rebuild': search_index_last_rebuild
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'redis': 'disconnected',
            'history_redis': 'disconnected',
            'search_index': 'unknown',
            'error': str(e)
        }), 500

@app.route('/ai-status', methods=['GET'])
def ai_status():
    """Get AI processing status information"""
    try:
        import ai_processor
        
        # Check if API key is configured
        api_key_configured = bool(GEMINI_API_KEY)
        
        if not api_key_configured:
            return jsonify({
                'model': GEMINI_MODEL,
                'apiKeyStatus': 'disconnected',
                'connectionStatus': 'error',
                'error': 'GEMINI_API_KEY environment variable not set',
                'provider': 'Google Gemini',
                'performance': {
                    'responseTime': '--',
                    'successRate': '--',
                    'requestCount': '--',
                    'lastRequest': '--'
                }
            })
        
        # Check API connection
        connection_status = ai_processor.check_gemini_connection()
        
        # Determine statuses
        api_key_status = 'connected' if connection_status['connected'] else 'disconnected'
        connection_status_value = 'connected' if connection_status['connected'] else 'error'
        
        # Get model information
        model_name = GEMINI_MODEL
        
        # Check if the specific model is available
        model_available = False
        if connection_status['connected']:
            model_available = ai_processor.check_model_availability(model_name)
        
        # Calculate performance metrics
        performance_metrics = calculate_performance_metrics()
        
        return jsonify({
            'model': model_name,
            'modelAvailable': model_available,
            'apiKeyStatus': api_key_status,
            'connectionStatus': connection_status_value,
            'error': connection_status.get('error'),
            'provider': 'Google Gemini',
            'apiKeyConfigured': api_key_configured,
            'performance': performance_metrics
        })
    except Exception as e:
        logger.error(f"Error getting AI status: {str(e)}")
        return jsonify({
            'model': 'Unknown',
            'apiKeyStatus': 'error',
            'connectionStatus': 'error',
            'error': str(e),
            'provider': 'Google Gemini',
            'apiKeyConfigured': False,
            'performance': {
                'responseTime': '--',
                'successRate': '--',
                'requestCount': '--',
                'lastRequest': '--'
            }
        })

@app.route('/clear-ai-stats', methods=['POST'])
def clear_ai_stats():
    """Clear all AI performance statistics"""
    try:
        # Reset to default stats
        default_stats = {
            'requests_today': 0,
            'total_requests': 0,
            'response_times': [],
            'last_request_time': None,
            'success_count': 0,
            'error_count': 0,
            'daily_reset_date': datetime.now().date()
        }
        
        # Save to Redis
        save_ai_performance_stats(default_stats)
        
        logger.info("AI performance statistics cleared successfully")
        
        return jsonify({
            'status': 'success',
            'message': 'AI statistics cleared successfully'
        })
    except Exception as e:
        logger.error(f"Error clearing AI stats: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error clearing AI statistics: {str(e)}'
        }), 500

#Comment this out to enable manual rebuild of search index.

# @app.route('/rebuild-search-index', methods=['POST'])
# @rate_limit
# def rebuild_search_index():
#     """Manually rebuild the search index"""
#     try:
#         create_search_index()
#         return jsonify({'status': 'success', 'message': 'Search index rebuilt successfully'})
#     except Exception as e:
#         logger.error(f"Error rebuilding search index: {str(e)}")
#         return jsonify({'status': 'error', 'message': f'Error rebuilding search index: {str(e)}'}), 500

@app.route('/ask-ai', methods=['POST'])
def ask_ai():
    """Handle AI questions about the page content"""
    try:
        data = request.json
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Invalid request data'
            }), 400
            
        question = data.get('question', '').strip()
        context = data.get('context', {})
        
        if not question:
            return jsonify({
                'status': 'error',
                'message': 'Question is required'
            }), 400
        
        # Check if Gemini API is available
        if not GEMINI_API_KEY:
            return jsonify({
                'status': 'error',
                'message': 'AI service is not configured'
            }), 503
        
        # Import AI processor
        import ai_processor
        
        # Create context prompt
        context_prompt = f"""
You are a friendly and helpful AI assistant. You can answer questions about change management data, services, or the current page, but you can also chat about anything else in a casual, friendly way.

Here is the current page context (for reference only):
- Page Title: {context.get('pageTitle', 'Change Management')}
- Header: {context.get('headerTitle', 'Change Weekend')}
- Date: {context.get('date', 'Not specified')}
- Services Data: {json.dumps(context.get('services', []), indent=2)}
- Original Email Content: {context.get('originalEmail', 'No email content available')}

User Question: {question}

**Instructions:**
- If the question is about change management, services, or the page, use the context above to answer helpfully.
- If the question is general, casual, or unrelated (e.g., about dogs, weather, math, etc.), just answer the question in a friendly, conversational way and ignore the page context.
- Never include page/service summaries unless the question is clearly about them.
- If the user's question is too out of scope (e.g., illegal, offensive, or not in appropriate language), politely refrain from answering and let the user know you can't help with that.
- Use markdown formatting for your response (bold, italics, bullet points, etc. as appropriate).
- Be concise, warm, and engaging.
- If a user asks to send them the data that was used to generate the response, politely refuse and let the user know you can't do that.
"""
        
        # Use the existing AI processor to get response
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=context_prompt)]
            ),
        ]
        
        generate_config = types.GenerateContentConfig(
            temperature=0.3,
            top_p=0.95,
            top_k=64,
            max_output_tokens=1024,
        )
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=generate_config
        )
        
        ai_response = response.text.strip()
        
        # Track the AI request for performance metrics
        track_ai_request(0.5, True)  # Approximate response time
        
        return jsonify({
            'status': 'success',
            'response': ai_response
        })
        
    except Exception as e:
        logger.error(f"Error processing AI question: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error processing your question: {str(e)}'
        }), 500

@app.route('/ai-chat-enabled', methods=['GET'])
def ai_chat_enabled():
    enabled = os.environ.get('AI_CHAT_ENABLED', 'true').lower() == 'true'
    return jsonify({'enabled': enabled})





def create_search_index():
    """
    Create Redis search index for O(1) search performance with pipelining
    
    Thread Safety:
    - Uses threading.Lock() to prevent concurrent index rebuilds
    - Tracks rebuild status to avoid unnecessary operations
    - Implements debouncing (minimum 5 seconds between rebuilds)
    """
    global searchhaus_index_busy, search_index_last_rebuild
    
    # Thread safety: Check if another rebuild is in progress
    if searchhaus_index_busy:
        logger.info("Search index rebuild already in progress, skipping...")
        return
    
    # Debouncing: Prevent too frequent rebuilds (minimum 5 seconds apart)
    current_time = time.time()
    if current_time - search_index_last_rebuild < 5:
        logger.info("Search index rebuild too recent, skipping...")
        return
    
    # Acquire lock to prevent concurrent rebuilds
    with search_index_lock:
        try:
            # Set busy flag
            searchhaus_index_busy = True
            search_index_last_rebuild = current_time
            
            logger.info("Starting search index rebuild...")
            
            if not history_redis or not history_key_manager:
                logger.error("History Redis client not available")
                return
            
            # Get all timestamps from metadata sorted set
            metadata_key = history_key_manager.get_metadata_key()
            all_timestamps = history_redis.zrevrange(metadata_key, 0, -1, withscores=True)
            if not all_timestamps:
                logger.info("No history data found for indexing")
                return
            
            # Use pipelining for bulk operations
            with history_redis.pipeline() as pipe:
                # Clear existing search indexes
                search_keys = history_redis.keys(f'{history_key_manager.history_prefix}:search:title:*')
                date_keys = history_redis.keys(f'{history_key_manager.history_prefix}:search:date:*')
                editor_keys = history_redis.keys(f'{history_key_manager.history_prefix}:search:editor:*')
                if search_keys:
                    pipe.delete(*search_keys)
                    logger.debug(f"Cleared {len(search_keys)} title search keys")
                if date_keys:
                    pipe.delete(*date_keys)
                    logger.debug(f"Cleared {len(date_keys)} date search keys")
                if editor_keys:
                    pipe.delete(*editor_keys)
                    logger.debug(f"Cleared {len(editor_keys)} editor search keys")
                
                # Clear search caches when rebuilding index
                clear_partial_search_cache()
                clear_failed_search_cache()
                
                # Queue all index operations
                indexed_count = 0
                for metadata_json, timestamp in all_timestamps:
                    # Get the full item to extract title and date
                    item = get_history_item_by_timestamp(timestamp)
                    if not item:
                        continue
                        
                    title = item.get('title', '').lower().strip()
                    date = item.get('date', '').lower().strip()
                    
                    # Get last_edited_by from the data field
                    last_edited_by = ''
                    if item.get('data') and item['data'].get('last_edited_by'):
                        last_edited_by = item['data']['last_edited_by'].lower().strip()
                    
                    if not timestamp:
                        continue
                    
                    # Index by title words
                    if title:
                        for word in title.split():
                            if word:  # Skip empty words
                                search_key = history_key_manager.get_search_key('title', word)
                                pipe.sadd(search_key, timestamp)
                    
                    # Index by date and date components
                    if date:
                        date_search_key = history_key_manager.get_search_key('date', date)
                        pipe.sadd(date_search_key, timestamp)
                        
                        # Also index date components for partial matching
                        date_parts = date.split('-')
                        for part in date_parts:
                            if part:
                                part_search_key = history_key_manager.get_search_key('date', part)
                                pipe.sadd(part_search_key, timestamp)
                    
                    # Index by last_edited_by
                    if last_edited_by:
                        # Index the full editor name
                        editor_search_key = history_key_manager.get_search_key('editor', last_edited_by)
                        pipe.sadd(editor_search_key, timestamp)
                        
                        # Also index editor name components for partial matching
                        editor_parts = last_edited_by.split()
                        for part in editor_parts:
                            if part and len(part) > 2:  # Only index parts longer than 2 chars
                                part_search_key = history_key_manager.get_search_key('editor', part)
                                pipe.sadd(part_search_key, timestamp)
                    
                    indexed_count += 1
                
                # Execute all operations in single network round trip
                pipe.execute()
                
                logger.info(f"Search index rebuild completed - indexed {indexed_count} items")
        
        except Exception as e:
            logger.error(f"Error creating search index: {str(e)}")
        finally:
            # Always clear busy flag, even on error
            searchhaus_index_busy = False

def search_history_redis_optimized(search_term):
    """Hybrid search: Redis filtering + intelligent scoring with failed search cache"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return []
        search_lower = search_term.lower().strip()
        
        if len(search_lower) < 1:
            return []
        
        # Step 1: Use Redis for initial filtering (O(1)) with pipelining
        title_search_key = history_key_manager.get_search_key('title', search_lower)
        date_search_key = history_key_manager.get_search_key('date', search_lower)
        editor_search_key = history_key_manager.get_search_key('editor', search_lower)
        
        # Use pipelining to batch Redis operations
        with history_redis.pipeline() as pipe:
            pipe.smembers(title_search_key)
            pipe.smembers(date_search_key)
            pipe.smembers(editor_search_key)
            results = pipe.execute()
            title_matches = results[0]
            date_matches = results[1]
            editor_matches = results[2]
        
        # Get all potential matches
        all_matches = title_matches.union(date_matches).union(editor_matches)
        
        if not all_matches:
            # Try Redis-based partial matching (O(k) instead of O(n))
            partial_results = search_history_redis_partial(search_lower)
            return partial_results
        
        # NEW: Define limits for exact matches (mirroring partial path)
        MAX_RESULTS = 50  # Final results to return
        PROCESS_BUFFER = 100  # Process a few more for better scoring, then trim
        
        # NEW: Pre-sort matches by timestamp (newest first) and limit before loading
        sorted_matches = sorted(list(all_matches), key=lambda ts: float(ts), reverse=True)[:PROCESS_BUFFER]
        
        # Step 2: Get only matching entries and apply intelligent scoring
        matching_entries = []
        for timestamp in sorted_matches:
            entry = get_history_item_by_timestamp(timestamp)
            if entry:
                # Apply intelligent scoring
                scored_entry = apply_search_scoring(entry, search_lower)
                if scored_entry:
                    matching_entries.append(scored_entry)
                    # NEW: Early termination if we have enough results
                    if len(matching_entries) >= MAX_RESULTS:
                        break
        
        # NEW: If we have more than MAX_RESULTS after scoring, trim after final sort
        # Sort by relevance score (highest first), then by timestamp (newest first)
        matching_entries.sort(key=lambda x: (x.get('_search_score', 0), x.get('timestamp', 0)), reverse=True)
        matching_entries = matching_entries[:MAX_RESULTS]
        
        # Remove the temporary score field
        for entry in matching_entries:
            entry.pop('_search_score', None)
        
        return matching_entries
        
    except Exception as e:
        logger.error(f"Error in Redis search: {str(e)}")
        return []



def apply_search_scoring(entry, search_lower):
    """Apply intelligent scoring to a single entry"""
    
    # Get field values
    title = entry.get('title', '').lower()
    date = entry.get('date', '').lower()
    last_edited_by = ''
    if entry.get('data') and entry['data'].get('last_edited_by'):
        last_edited_by = entry['data']['last_edited_by'].lower()
    
    # Define search field configurations
    search_fields = [
        {
            'name': 'title',
            'value': title,
            'priority': 'high',
            'scores': {
                'exact': 100,
                'starts_with': 50,
                'word_match': 30,
                'contains': 20
            },
            'match_sources': {
                'exact': 'exact title match',
                'starts_with': 'title starts with',
                'word_match': 'title word match',
                'contains': 'title contains'
            }
        },
        {
            'name': 'date',
            'value': date,
            'priority': 'medium',
            'scores': {
                'exact': 40,
                'starts_with': 25,
                'contains': 15
            },
            'match_sources': {
                'exact': 'exact date match',
                'starts_with': 'date starts with',
                'contains': 'date contains'
            }
        },
        {
            'name': 'editor',
            'value': last_edited_by,
            'priority': 'medium',
            'scores': {
                'exact': 35,
                'starts_with': 25,
                'word_match': 20,
                'contains': 15
            },
            'match_sources': {
                'exact': 'exact editor match',
                'starts_with': 'editor starts with',
                'word_match': 'editor word match',
                'contains': 'editor contains'
            }
        }
    ]
    
    # Initialize scoring
    score = 0
    match_found = False
    match_sources = []
    
    # Unified search field scoring
    for field in search_fields:
        field_value = field['value']
        
        # Skip empty fields
        if not field_value:
            continue
        
        # Check if search term is in this field
        if search_lower in field_value:
            match_found = True
            
            # NEW: For date field, extract just the YYYY-MM-DD part for exact comparison
            compare_value = field_value
            if field['name'] == 'date':
                # Extract date prefix (assuming format 'YYYY-MM-DD HH:MM:SS')
                date_match = re.match(r'^\d{4}-\d{2}-\d{2}', field_value)
                if date_match:
                    compare_value = date_match.group(0)
            
            # Determine match type and score
            if compare_value == search_lower:
                # Exact match (using compare_value for dates)
                score += field['scores']['exact']
                match_sources.append(field['match_sources']['exact'])
            elif field_value.startswith(search_lower):
                # Starts with match
                if 'starts_with' in field['scores']:
                    score += field['scores']['starts_with']
                    match_sources.append(field['match_sources']['starts_with'])
            elif f' {search_lower} ' in f' {field_value} ':
                # Word match
                if 'word_match' in field['scores']:
                    score += field['scores']['word_match']
                    match_sources.append(field['match_sources']['word_match'])
            else:
                # Contains match
                score += field['scores']['contains']
                match_sources.append(field['match_sources']['contains'])
    
    # Only include entries that have matches
    if match_found:
        # Add timestamp bonus (newer entries get slight preference)
        timestamp_bonus = min(entry.get('timestamp', 0) / 1000000, 5)  # Max 5 points for recency
        score += timestamp_bonus
        
        entry['_search_score'] = score
        entry['_match_sources'] = match_sources
        return entry
    
    return None





def is_search_index_busy():
    """Check if search index rebuild is currently in progress"""
    return searchhaus_index_busy

def clear_failed_search_cache():
    """
    Clear all failed search cache entries
    
    Cache Strategy:
    - Failed search cache stores search terms that returned no results
    - Used to avoid expensive searches for terms known to return nothing
    - Cleared during index rebuild to ensure fresh results
    - Pattern: {history}:cache:failed:{search_term}
    """
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return
        # Get all failed search keys
        failed_keys = history_redis.keys(f'{history_key_manager.history_prefix}:cache:failed:*')
        if failed_keys:
            history_redis.delete(*failed_keys)
            logger.debug(f"Cleared {len(failed_keys)} failed search cache entries")
    except Exception as e:
        logger.error(f"Error clearing failed search cache: {str(e)}")

def clear_partial_search_cache():
    """
    Clear all partial search cache entries
    
    Cache Strategy:
    - Partial search cache stores results from expensive pattern matching
    - Used to avoid repeated expensive Redis SCAN operations
    - Cleared during index rebuild to ensure fresh results
    - Pattern: {history}:cache:partial:{search_term}
    """
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return
        # Get all partial search cache keys
        partial_keys = history_redis.keys(f'{history_key_manager.history_prefix}:cache:partial:*')
        if partial_keys:
            history_redis.delete(*partial_keys)
            logger.debug(f"Cleared {len(partial_keys)} partial search cache entries")
    except Exception as e:
        logger.error(f"Error clearing partial search cache: {str(e)}")



# Global error handler for unhandled exceptions
@app.errorhandler(Exception)
def handle_global_exception(e):
    from werkzeug.exceptions import HTTPException
    # Log the error for debugging
    logger.error(f"Unhandled exception: {e}")
    # If the request is for an API (accepts JSON), return JSON
    if request.accept_mimetypes.accept_json and not request.accept_mimetypes.accept_html:
        code = 500
        if isinstance(e, HTTPException):
            code = e.code
        return jsonify({
            'status': 'error',
            'message': 'An unexpected error occurred. Please try again later.'
        }), code
    # Otherwise, render a friendly error page
    code = 500
    if isinstance(e, HTTPException):
        code = e.code
    return render_template('error.html', message="Something went wrong. Please try again later."), code

# Log rate limiting status (runs regardless of how app is started)
if RATE_LIMIT_ENABLED:
    logger.info(f"Rate limiting ENABLED: {RATE_LIMIT} requests per {RATE_WINDOW} seconds")
else:
    logger.info("Rate limiting DISABLED")

# Initialize search index asynchronously after app starts
def initialize_search_index_async():
    """Initialize search index in a separate thread after app startup"""
    import time
    time.sleep(2)  # Wait 2 seconds for app to fully start
    try:
        create_search_index()
        logger.info("Search index initialized successfully (async)")
    except Exception as e:
        logger.error(f"Error initializing search index (async): {str(e)}")

# Start async initialization in a separate thread
search_index_thread = threading.Thread(target=initialize_search_index_async, daemon=True)
search_index_thread.start()

def search_history_redis_partial(search_lower):
    """
    Hybrid approach: Pipelined collection + streaming processing
    
    Improvements:
    - Redis pipelining for efficient batch collection
    - Smart pattern generation (prefix, suffix, contains)
    - Result caching to avoid repeated expensive scans
    - Streaming processing for immediate results and early termination
    - Larger SCAN count for fewer network round trips
    - Best of both worlds: network efficiency + user experience
    """
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return []
        if len(search_lower) < 1:
            return []
        
        # Check cache first
        cache_key = history_key_manager.get_cache_key('partial', search_lower)
        cached_result = history_redis.get(cache_key)
        if cached_result:
            return json.loads(cached_result)
        
        max_results = 100  # Limit total results
        max_final_results = 50  # Limit final displayed results
        
        # Generate smart patterns for better matching
        patterns = generate_search_patterns(search_lower)
        
        # Use hybrid approach: pipelined collection + streaming processing
        matching_entries = []
        found_count = 0
        
        # Unified search function for all pattern types
        def search_patterns(pattern_list, search_lower, found_count, matching_entries, max_results, max_final_results):
            """Unified search function for title, date, and editor patterns"""
            for pattern in pattern_list:
                if found_count >= max_results or len(matching_entries) >= max_final_results:
                    break
                    
                cursor = 0
                while True:
                    cursor, keys = history_redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        # Phase 1: Use pipelining to efficiently collect potential matches
                        with history_redis.pipeline() as pipe:
                            for key in keys:
                                pipe.smembers(key)
                            # Execute batch (single network round trip)
                            results = pipe.execute()
                            
                            # Phase 2: Stream process results immediately
                            for timestamps in results:
                                if found_count >= max_results or len(matching_entries) >= max_final_results:
                                    break
                                    
                                for timestamp in timestamps:
                                    if found_count >= max_results or len(matching_entries) >= max_final_results:
                                        break
                                    
                                    # Process and score immediately
                                    entry = get_history_item_by_timestamp(timestamp)
                                    if entry:
                                        scored_entry = apply_search_scoring(entry, search_lower)
                                        if scored_entry:
                                            matching_entries.append(scored_entry)
                                            found_count += 1
                                            
                                            # Early termination if we have enough good results
                                            if len(matching_entries) >= max_final_results:
                                                break
                            
                            # Early termination check
                            if len(matching_entries) >= max_final_results:
                                break
                    
                    if cursor == 0 or found_count >= max_results or len(matching_entries) >= max_final_results:
                        break
            
            return found_count, matching_entries
        
        # Search title patterns
        found_count, matching_entries = search_patterns(
            patterns['title'], search_lower, found_count, matching_entries, max_results, max_final_results
        )
        
        # Search date patterns (if we haven't hit limit)
        if found_count < max_results and len(matching_entries) < max_final_results:
            found_count, matching_entries = search_patterns(
                patterns['date'], search_lower, found_count, matching_entries, max_results, max_final_results
            )
        
        # Search editor patterns (if we haven't hit limit)
        if found_count < max_results and len(matching_entries) < max_final_results:
            found_count, matching_entries = search_patterns(
                patterns['editor'], search_lower, found_count, matching_entries, max_results, max_final_results
            )
        
        if not matching_entries:
            # Cache empty result for longer (failed searches are expensive to repeat)
            history_redis.setex(cache_key, 600, json.dumps([]))  # 10 min cache for failed searches
            return []
        
        # Sort by relevance score (highest first), then by timestamp (newest first)
        matching_entries.sort(key=lambda x: (x.get('_search_score', 0), x.get('timestamp', 0)), reverse=True)
        
        # Limit final results
        matching_entries = matching_entries[:max_final_results]
        
        # Remove the temporary score field
        for entry in matching_entries:
            entry.pop('_search_score', None)
        
        # Cache result for 5 minutes
        history_redis.setex(cache_key, 300, json.dumps(matching_entries))
        
        return matching_entries
        
    except Exception as e:
        logger.error(f"Error in Redis partial search: {str(e)}")
        return []

def generate_search_patterns(search_term):
    """
    Generate optimized search patterns for better partial matching
    
    Optimizations:
    - Reduces redundant patterns for short search terms
    - Uses contains pattern as primary (finds everything)
    - Only adds prefix/suffix patterns for longer terms where they differ
    - Maintains same accuracy with 50-66% fewer SCAN operations
    - Includes last_edited_by field in search patterns
    """
    patterns = {
        'title': [],
        'date': [],
        'editor': []  # New field for last_edited_by searches
    }
    
    # Always use contains pattern (finds everything)
    patterns['title'].append(f'{history_key_manager.history_prefix}:search:title:*{search_term}*')
    patterns['date'].append(f'{history_key_manager.history_prefix}:search:date:*{search_term}*')
    patterns['editor'].append(f'{history_key_manager.history_prefix}:search:editor:*{search_term}*')
    
    # Only add prefix/suffix patterns for longer terms where they might be different
    # For short terms like "weekend", prefix/suffix are usually the same as contains
    if len(search_term) >= 8:  # Only for longer search terms
        patterns['title'].append(f'{history_key_manager.history_prefix}:search:title:{search_term}*')   # Starts with
        patterns['title'].append(f'{history_key_manager.history_prefix}:search:title:*{search_term}')   # Ends with
        patterns['date'].append(f'{history_key_manager.history_prefix}:search:date:{search_term}*')     # Starts with
        patterns['date'].append(f'{history_key_manager.history_prefix}:search:date:*{search_term}')     # Ends with
        patterns['editor'].append(f'{history_key_manager.history_prefix}:search:editor:{search_term}*') # Starts with
        patterns['editor'].append(f'{history_key_manager.history_prefix}:search:editor:*{search_term}') # Ends with
    
    # Add word boundary patterns for multi-word searches
    if ' ' in search_term:
        words = search_term.split()
        for word in words:
            if len(word) > 2:  # Only index words longer than 2 chars
                patterns['title'].append(f'{history_key_manager.history_prefix}:search:title:*{word}*')
                patterns['date'].append(f'{history_key_manager.history_prefix}:search:date:*{word}*')
                patterns['editor'].append(f'{history_key_manager.history_prefix}:search:editor:*{word}*')
    
    return patterns

def migrate_history_to_redis():
    """Migrate all history-related keys from main Redis to history Redis with hash tags"""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return False
        
        # Get all keys from main Redis
        all_keys = redis_client.keys('*')
        history_keys = []
        
        # Find history-related keys
        for key in all_keys:
            if (key.startswith('history_') or 
                key.startswith('search:') or 
                key == 'change_management_history'):
                history_keys.append(key)
        
        if not history_keys:
            return True
        
        # Migrate each key with new hash tag format
        for key in history_keys:
            try:
                # Get the value and type
                key_type = redis_client.type(key)
                new_key = None
                
                # Convert to new hash tag format
                if key.startswith('history_item:'):
                    timestamp = key.replace('history_item:', '')
                    new_key = history_key_manager.get_history_item_key(timestamp)
                elif key == 'history_metadata':
                    new_key = history_key_manager.get_metadata_key()
                elif key.startswith('search:title:'):
                    term = key.replace('search:title:', '')
                    new_key = history_key_manager.get_search_key('title', term)
                elif key.startswith('search:date:'):
                    term = key.replace('search:date:', '')
                    new_key = history_key_manager.get_search_key('date', term)
                elif key.startswith('search:editor:'):
                    term = key.replace('search:editor:', '')
                    new_key = history_key_manager.get_search_key('editor', term)
                elif key.startswith('partial_search:'):
                    term = key.replace('partial_search:', '')
                    new_key = history_key_manager.get_cache_key('partial', term)
                elif key.startswith('failed_search:'):
                    term = key.replace('failed_search:', '')
                    new_key = history_key_manager.get_cache_key('failed', term)
                else:
                    # Keep original key for unknown types
                    new_key = f"{history_key_manager.history_prefix}:{key}"
                
                if key_type == 'string':
                    value = redis_client.get(key)
                    if value:
                        history_redis.set(new_key, value)
                        redis_client.delete(key)
                
                elif key_type == 'set':
                    members = redis_client.smembers(key)
                    if members:
                        history_redis.sadd(new_key, *members)
                        redis_client.delete(key)
                
                elif key_type == 'zset':
                    members = redis_client.zrange(key, 0, -1, withscores=True)
                    if members:
                        # Ensure scores are floats for proper sorting
                        score_dict = {}
                        for member, score in members:
                            try:
                                score_dict[member] = float(score)
                            except (ValueError, TypeError):
                                score_dict[member] = score
                        history_redis.zadd(new_key, score_dict)
                        redis_client.delete(key)
                
                elif key_type == 'hash':
                    items = redis_client.hgetall(key)
                    if items:
                        history_redis.hset(new_key, mapping=items)
                        redis_client.delete(key)
                
            except Exception as e:
                logger.error(f"Error migrating key {key}: {str(e)}")
                continue
        
        return True
        
    except Exception as e:
        logger.error(f"Error migrating history: {str(e)}")
        return False

# Run migration on startup
migrate_history_to_redis()




if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
