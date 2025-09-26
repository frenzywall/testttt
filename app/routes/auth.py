"""
Authentication routes
This file contains all authentication-related routes from app.py
"""
from flask import Blueprint, request, jsonify, session, redirect, url_for, render_template
from datetime import datetime, timezone, timedelta
import bcrypt
import secrets
import json
import hashlib
import hmac
import logging

from ..config import (
    SESSION_TIMEOUT_SECONDS, REAUTH_TIMEOUT_SECONDS, LOGOUT_VERSION_HASH_KEY,
    ADMIN_USERNAME, ADMIN_PASSWORD, USERS_KEY, SIGNUP_ENABLED, SIGNUP_REDIS_KEY,
    EXISTING_USER_MATCH_MESSAGE, PASSKEY_HASH, GUEST_ACCESS_ENABLED, GUEST_ACCESS_REDIS_KEY
)
from ..utils.redis_client import redis_client
from ..utils.decorators import rate_limit

logger = logging.getLogger(__name__)

# Create blueprint
auth_bp = Blueprint('auth', __name__)

# --- Helper Functions ---
def parse_last_login(val):
    """Parse last_login as timezone-aware datetime"""
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

def hash_password(password):
    """Hash password using bcrypt"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password, hashed):
    """Check password against hash using bcrypt"""
    return bcrypt.checkpw(password.encode(), hashed.encode())

def get_users():
    """Get users dict from Redis"""
    try:
        users = redis_client.get(USERS_KEY)
        return json.loads(users) if users else {}
    except Exception as e:
        logger.error(f"Error loading users: {e}")
        return None

def save_users(users):
    """Save users dict to Redis"""
    redis_client.set(USERS_KEY, json.dumps(users))

def get_admin_usernames():
    """Get list of admin usernames"""
    users = get_users()
    return [u for u, uobj in users.items() if uobj.get('role') == 'admin']

def validate_user_exists(username):
    """Check if a user exists in the database"""
    if not username:
        return False
    try:
        users = get_users()
        return users and username in users
    except Exception as e:
        logger.error(f"Error validating user existence for {username}: {str(e)}")
        return False

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

def is_reauth_valid():
    """Check if re-auth window is valid"""
    reauth_until = session.get('reauth_until')
    if not reauth_until:
        return False
    try:
        reauth_until_dt = datetime.fromisoformat(reauth_until.replace('Z', '+00:00'))
        return datetime.now(timezone.utc) < reauth_until_dt
    except Exception as e:
        logger.error(f"Error parsing reauth_until: {str(e)}")
        return False

def bootstrap_admin():
    """Bootstrap admin user if no users exist"""
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

# --- Routes ---
@auth_bp.route('/login', methods=['GET'])
def login_page():
    if session.get('username'):
        return redirect(url_for('index'))
    return render_template('login.html')

@auth_bp.route('/login', methods=['POST'])
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
    
    # Invalidate users cache when login timestamp changes
    try:
        redis_client.delete('users_list_cache')
    except Exception as e:
        logger.warning(f"Failed to invalidate users cache on login: {e}")
    
    # Publish SSE login event to all admins
    from ..services.sse_service import publish_sse_event
    for admin_username in get_admin_usernames():
        publish_sse_event(admin_username, 'login', {'username': username, 'last_login': user['last_login']})
    return jsonify({'status': 'success', 'username': username, 'role': user['role']})

@auth_bp.route('/logout', methods=['POST'])
def logout():
    username = session.get('username')
    if username:
        try:
            redis_client.hdel(LOGOUT_VERSION_HASH_KEY, username)
        except Exception as e:
            logger.error(f"Error clearing logout version for {username}: {str(e)}")
    session.clear()
    return jsonify({'status': 'success'})

@auth_bp.route('/guest-enabled', methods=['GET'])
def guest_enabled():
    """Get current guest access status"""
    try:
        with redis_client.pipeline() as pipe:
            pipe.watch(GUEST_ACCESS_REDIS_KEY)
            guest_setting = redis_client.get(GUEST_ACCESS_REDIS_KEY)
            if guest_setting is not None:
                global GUEST_ACCESS_ENABLED
                GUEST_ACCESS_ENABLED = guest_setting == '1'
            else:
                pipe.multi()
                pipe.set(GUEST_ACCESS_REDIS_KEY, '1' if GUEST_ACCESS_ENABLED else '0')
                pipe.execute()
    except Exception as e:
        logger.error(f"Error checking guest status from Redis: {str(e)}")
        pass
    return jsonify({'enabled': GUEST_ACCESS_ENABLED})

@auth_bp.route('/toggle-guest', methods=['POST'])
@rate_limit
def toggle_guest():
    """Admin endpoint to toggle guest access feature"""
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    try:
        with redis_client.pipeline() as pipe:
            pipe.watch(GUEST_ACCESS_REDIS_KEY)
            global GUEST_ACCESS_ENABLED
            GUEST_ACCESS_ENABLED = not GUEST_ACCESS_ENABLED
            pipe.multi()
            pipe.set(GUEST_ACCESS_REDIS_KEY, '1' if GUEST_ACCESS_ENABLED else '0')
            pipe.execute()
        logger.info(f"Guest access feature {'enabled' if GUEST_ACCESS_ENABLED else 'disabled'} by admin {session.get('username')}")
        return jsonify({'status': 'success', 'enabled': GUEST_ACCESS_ENABLED})
    except Exception as e:
        logger.error(f"Error toggling guest access: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@auth_bp.route('/guest-login', methods=['POST'])
@rate_limit
def guest_login():
    """Create a guest session with a generated username when guest access is enabled"""
    try:
        # Ensure feature flag reflects Redis
        try:
            val = redis_client.get(GUEST_ACCESS_REDIS_KEY)
            if val is not None:
                global GUEST_ACCESS_ENABLED
                GUEST_ACCESS_ENABLED = val == '1'
        except Exception:
            pass

        if not GUEST_ACCESS_ENABLED:
            return jsonify({'status': 'error', 'message': 'Guest access is disabled'}), 403

        # Generate a functional guest username
        suffix = secrets.token_hex(3)
        guest_username = f"guest-{suffix}"

        # Set up a limited session (role 'guest')
        session.permanent = True
        session['username'] = guest_username
        session['role'] = 'guest'
        session['login_time'] = datetime.now(timezone.utc).isoformat()
        session['last_activity'] = datetime.now(timezone.utc).isoformat()
        session['logout_version'] = secrets.token_hex(8)

        logger.info(f"Guest session started: {guest_username}")
        return jsonify({'status': 'success', 'username': guest_username, 'role': 'guest'})
    except Exception as e:
        logger.error(f"Error during guest login: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Failed to start guest session'}), 500

@auth_bp.route('/current-user', methods=['GET'])
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

@auth_bp.route('/change-password', methods=['POST'])
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

@auth_bp.route('/check-reauth', methods=['GET'])
def check_reauth():
    username = session.get('username')
    if not username:
        return jsonify({'valid': False}), 401
    
    # Check if user still exists in database
    if not validate_user_exists(username):
        session.clear()
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

@auth_bp.route('/signup-enabled', methods=['GET'])
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

@auth_bp.route('/toggle-signup', methods=['POST'])
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

@auth_bp.route('/signup', methods=['POST'])
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
        
        # Invalidate users cache when new user is created
        try:
            redis_client.delete('users_list_cache')
        except Exception as e:
            logger.warning(f"Failed to invalidate users cache on signup: {e}")
        
        logger.info(f"New user signed up: {username}")
        return jsonify({'status': 'success', 'message': 'Account created successfully'})
        
    except Exception as e:
        logger.error(f"Error during signup: {str(e)}")
        return jsonify({'status': 'error', 'message': 'Failed to create account'}), 500

@auth_bp.route('/set-reauth', methods=['POST'])
def set_reauth():
    """Set a server-side re-authentication window after passkey validation"""
    if not session.get('username'):
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    session['reauth_until'] = (datetime.now(timezone.utc) + timedelta(seconds=REAUTH_TIMEOUT_SECONDS)).isoformat()
    return jsonify({'status': 'success', 'reauth_until': session['reauth_until']})

@auth_bp.route('/validate-passkey', methods=['POST'])
@rate_limit
def validate_passkey():
    """Validate the provided passkey against the stored hash and set reauth window"""
    username = session.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    
    # Check if user still exists in database
    if not validate_user_exists(username):
        session.clear()
        return jsonify({'status': 'error', 'message': 'User not found'}), 401
    
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
