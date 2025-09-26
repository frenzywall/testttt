"""
Main application file
This is the new entry point that imports from all the modular components
"""
from flask import Flask, session, request, jsonify, render_template, redirect, url_for
from flask_session import Session
from datetime import timedelta, datetime, timezone
import os
import secrets
import logging
from werkzeug.exceptions import HTTPException

# Import configuration
from .config import (
    PERMANENT_SESSION_LIFETIME_DAYS, RATE_LIMIT_ENABLED, RATE_LIMIT, RATE_WINDOW,
    SESSION_TIMEOUT_SECONDS, LOGOUT_VERSION_HASH_KEY
)

# Import Redis clients
from .utils.redis_client import redis_client, session_redis, history_redis

# Import services
from .services.sse_service import start_sse_listener, clear_stale_sse_data
from .services.search_service import start_search_index_initialization
from .routes.auth import bootstrap_admin, validate_user_exists

# Import route blueprints
from .routes.auth import auth_bp
from .routes.changes import changes_bp
from .routes.history import history_bp
from .routes.admin import admin_bp
from .routes.api import api_bp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app():
    """Create and configure the Flask application"""
    app = Flask(__name__, static_folder='../static', static_url_path='/static', template_folder='../templates')
    
    # Configure proxy trust for reverse proxy support
    trust_proxy = os.environ.get('TRUST_PROXY', 'false').lower() == 'true'
    if trust_proxy:
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
        logger.info("Proxy trust enabled - will use X-Forwarded headers for client IP detection")
    else:
        logger.info("Proxy trust disabled - using direct connection IPs")
    
    # Configure secret key
    app.secret_key = os.environ.get('SECRET_KEY')
    if not app.secret_key:
        app.secret_key = secrets.token_hex(16)
        logger.warning("Using randomly generated secret key. Set SECRET_KEY environment variable for production.")
    
    # Configure Flask-Session
    app.config['SESSION_TYPE'] = 'redis'
    app.config['SESSION_REDIS'] = session_redis
    app.config['SESSION_PERMANENT'] = True
    app.config['SESSION_USE_SIGNER'] = True
    app.config['SESSION_KEY_PREFIX'] = 'flask_session:'
    # Set a very long session lifetime for Flask-Session (admin users)
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=PERMANENT_SESSION_LIFETIME_DAYS)  # 1 year default
    Session(app)
    
    # Register blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(changes_bp)
    app.register_blueprint(history_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(api_bp)
    
    # Context processor
    @app.context_processor
    def inject_user():
        return dict(current_user=session.get('username'), current_role=session.get('role'))
    
    # Before request handler
    @app.before_request
    def require_login():
        allowed = [
            '/login', '/logout', '/current-user', '/ai-chat-enabled', '/signup-enabled', '/toggle-signup', '/signup', '/guest-enabled', '/toggle-guest', '/guest-login', '/static/', '/favicon.ico', '/misc/', '/users', '/change-password', '/admin-logout-user', '/update-user-role', '/events',
            '/get-history', '/load-from-history', '/delete-from-history', '/rebuild-search-index'
        ]
        if request.path.startswith('/static/') or request.path.startswith('/misc/'):
            return
        if request.path in allowed or request.path.startswith('/users') or request.path.startswith('/change-password'):
            return
        if not session.get('username'):
            return redirect(url_for('auth.login_page'))
        
        # --- Deny POST for guest role (except allowlisted endpoints) ---
        if session.get('role') == 'guest' and request.method == 'POST':
            guest_post_allow = ['/logout']
            if not any(request.path.startswith(p) for p in guest_post_allow):
                return jsonify({'status': 'error', 'message': 'Guest not allowed to modify'}), 403
        
        # --- Session Timeout Check (skip for admin users) ---
        if session.get('role') != 'admin':  # Only check timeout for non-admin users
            now = datetime.now(timezone.utc)
            last_activity_str = session.get('last_activity')
            if last_activity_str:
                try:
                    last_activity = datetime.fromisoformat(last_activity_str.replace('Z', '+00:00'))
                    if (now - last_activity).total_seconds() > SESSION_TIMEOUT_SECONDS:
                        session.clear()
                        return redirect(url_for('auth.login_page'))
                except Exception as e:
                    logger.error(f"Error parsing last_activity: {str(e)}")
                    session.clear()
                    return redirect(url_for('auth.login_page'))
            else:
                session.clear()
                return redirect(url_for('auth.login_page'))
        
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
                resp = redirect(url_for('auth.login_page'))
                resp.set_cookie('session', '', expires=0)
                return resp
            
            # --- User Existence and Role Validation Check ---
            # Skip for guest role; otherwise verify user exists and role matches database
            try:
                if session.get('role') != 'guest':
                    from .routes.auth import get_users
                    users = get_users()
                    if users and username in users:
                        actual_role = users[username].get('role', 'user')
                        session_role = session.get('role', 'user')
                        if actual_role != session_role:
                            logger.warning(f"Role mismatch for user {username}: session has {session_role}, database has {actual_role}")
                            # Update session with correct role
                            session['role'] = actual_role
                    else:
                        # User doesn't exist in database - invalidate session (not for guests)
                        logger.warning(f"User {username} not found in database - invalidating session")
                        session.clear()
                        return jsonify({'status': 'error', 'message': 'User not found'}), 401
            except Exception as e:
                logger.error(f"Error validating user {username}: {str(e)}")
                # On error, invalidate session for security
                session.clear()
                return jsonify({'status': 'error', 'message': 'Session validation failed'}), 401
        
        # --- Update last_activity ---
        session['last_activity'] = datetime.now(timezone.utc).isoformat()
    
    # Global error handler for unhandled exceptions
    @app.errorhandler(Exception)
    def handle_global_exception(e):
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
    
    def inject_user():
        """Template context processor to inject current user info"""
        return dict(current_user=session.get('username'), current_role=session.get('role'))

    @app.before_request
    def require_login():
        """Global authentication and session management"""
        from .config import SESSION_TIMEOUT_SECONDS, LOGOUT_VERSION_HASH_KEY
        from .utils.redis_client import redis_client
        from .routes.auth import get_users
        
        allowed = [
            '/login', '/logout', '/current-user', '/ai-chat-enabled', '/signup-enabled', '/toggle-signup', '/signup', '/guest-enabled', '/toggle-guest', '/guest-login', '/static/', '/favicon.ico', '/misc/', '/users', '/change-password', '/admin-logout-user', '/update-user-role', '/events',
            '/get-history', '/load-from-history', '/delete-from-history', '/rebuild-search-index'
        ]
        if request.path.startswith('/static/') or request.path.startswith('/misc/'):
            return
        if request.path in allowed or request.path.startswith('/users') or request.path.startswith('/change-password'):
            return
        if not session.get('username'):
            return redirect(url_for('auth.login_page'))
        
        # --- Deny POST for guest role (except allowlisted endpoints) ---
        if session.get('role') == 'guest' and request.method == 'POST':
            guest_post_allow = ['/logout']
            if not any(request.path.startswith(p) for p in guest_post_allow):
                return jsonify({'status': 'error', 'message': 'Guest not allowed to modify'}), 403
        
        # --- Session Timeout Check (skip for admin users) ---
        if session.get('role') != 'admin':  # Only check timeout for non-admin users
            now = datetime.now(timezone.utc)
            last_activity_str = session.get('last_activity')
            if last_activity_str:
                try:
                    last_activity = datetime.fromisoformat(last_activity_str.replace('Z', '+00:00'))
                    if (now - last_activity).total_seconds() > SESSION_TIMEOUT_SECONDS:
                        session.clear()
                        return redirect(url_for('auth.login_page'))
                except Exception as e:
                    logger.error(f"Error parsing last_activity: {str(e)}")
                    session.clear()
                    return redirect(url_for('auth.login_page'))
            else:
                session.clear()
                return redirect(url_for('auth.login_page'))
        
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
                resp = redirect(url_for('auth.login_page'))
                resp.set_cookie('session', '', expires=0)
                return resp
            
            # --- User Existence and Role Validation Check ---
            # Skip validation for guest role; otherwise ensure user exists and role matches
            try:
                if session.get('role') != 'guest':
                    users = get_users()
                    if users and username in users:
                        actual_role = users[username].get('role', 'user')
                        session_role = session.get('role', 'user')
                        if actual_role != session_role:
                            logger.warning(f"Role mismatch for user {username}: session has {session_role}, database has {actual_role}")
                            # Update session with correct role
                            session['role'] = actual_role
                    else:
                        # User doesn't exist in database - invalidate session (not for guests)
                        logger.warning(f"User {username} not found in database - invalidating session")
                        session.clear()
                        return jsonify({'status': 'error', 'message': 'User not found'}), 401
            except Exception as e:
                logger.error(f"Error validating user {username}: {str(e)}")
                # On error, invalidate session for security
                session.clear()
                return jsonify({'status': 'error', 'message': 'Session validation failed'}), 401
        
        # --- Update last_activity ---
        session['last_activity'] = datetime.now(timezone.utc).isoformat()

    return app

def handle_global_exception(e):
    """Global exception handler"""
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

def initialize_app():
    """Initialize the application with all required services"""
    # Clear any stale search index busy flag on startup
    try:
        redis_client.delete('search_index_busy')
        logger.info("Cleared stale search index busy flag on startup")
    except Exception as e:
        logger.warning(f"Could not clear stale search index busy flag on startup: {str(e)}")
    
    # Bootstrap admin user
    bootstrap_admin()
    
    # Load signup setting from Redis
    from .config import SIGNUP_REDIS_KEY, SIGNUP_ENABLED
    try:
        signup_setting = redis_client.get(SIGNUP_REDIS_KEY)
        if signup_setting is not None:
            SIGNUP_ENABLED = signup_setting == '1'
            logger.info(f"Loaded signup setting from Redis: {'enabled' if SIGNUP_ENABLED else 'disabled'}")
    except Exception as e:
        logger.warning(f"Could not load signup setting from Redis: {str(e)}")
    
    # Start SSE listener
    start_sse_listener()
    
    # Clear stale SSE data
    clear_stale_sse_data()
    
    # Start search index initialization
    start_search_index_initialization()
    
    # Run history migration
    from .services.history_service import migrate_history_to_redis
    migrate_history_to_redis()
    
    # Log rate limiting status
    if RATE_LIMIT_ENABLED:
        logger.info(f"Rate limiting ENABLED: {RATE_LIMIT} requests per {RATE_WINDOW} seconds")
    else:
        logger.info("Rate limiting DISABLED")

# Create the app instance
app = create_app()

# Initialize the application
initialize_app()

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
