"""
Admin routes
This file contains all admin-related routes from app.py
"""
from flask import Blueprint, request, jsonify, session, Response, stream_with_context
import json
import secrets
import logging
import time
import queue
from collections import defaultdict

from ..config import ADMIN_USERNAME, LOGOUT_VERSION_HASH_KEY
from ..utils.redis_client import redis_client
from ..routes.auth import (
    get_users, save_users, get_admin_usernames, hash_password, parse_last_login
)

logger = logging.getLogger(__name__)

# Create blueprint
admin_bp = Blueprint('admin', __name__)

# SSE globals (imported from original app.py)
SSE_QUEUE_PREFIX = 'sse_queue_'
sse_queues = defaultdict(queue.Queue)  # Local user-specific queues for events
sse_connection_counter = 0  # Counter for unique connection IDs
import threading
sse_lock = threading.Lock()  # For thread-safe access

# --- Routes ---
@admin_bp.route('/users', methods=['GET', 'POST', 'DELETE', 'PUT'])
def manage_users():
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    try:
        users = get_users()
        if users is None:
            return jsonify({'status': 'error', 'message': 'Failed to load users'}), 500
        if request.method == 'GET':
            # Check cache first
            cache_key = 'users_list_cache'
            cached_data = redis_client.get(cache_key)
            
            if cached_data:
                try:
                    return jsonify(json.loads(cached_data))
                except (json.JSONDecodeError, TypeError):
                    # Cache corrupted, continue to generate fresh data
                    pass
            
            # Generate fresh user list
            user_list = [
                {'username': u, 'last_login': users[u].get('last_login', '-'), 'created_by': users[u].get('created_by', 'admin'), 'role': users[u].get('role', 'user')}
                for u in users if u != ADMIN_USERNAME]
            user_list.sort(key=lambda x: parse_last_login(x['last_login']), reverse=True)
            
            # Cache the result for 5 minutes (300 seconds)
            try:
                redis_client.setex(cache_key, 300, json.dumps({'users': user_list}))
            except Exception as e:
                logger.warning(f"Failed to cache users list: {e}")
            
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
            
            # Invalidate cache when user data changes
            try:
                redis_client.delete('users_list_cache')
            except Exception as e:
                logger.warning(f"Failed to invalidate users cache: {e}")
            
            return jsonify({'status': 'success'})
        elif request.method == 'DELETE':
            data = request.json
            username = data.get('username', '').strip()
            if not username or username not in users:
                return jsonify({'status': 'error', 'message': 'User not found'}), 404
            if users[username]['role'] == 'admin':
                return jsonify({'status': 'error', 'message': 'Cannot delete admin'}), 400
            # Prevent deletion of main admin
            if username == ADMIN_USERNAME:
                return jsonify({'status': 'error', 'message': 'Cannot delete main admin'}), 400
            
            del users[username]
            save_users(users)
            
            # Invalidate cache when user data changes
            try:
                redis_client.delete('users_list_cache')
            except Exception as e:
                logger.warning(f"Failed to invalidate users cache: {e}")
            
            logger.info(f"Admin {session.get('username')} deleted user {username}")
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
            
            # Invalidate cache when user data changes
            try:
                redis_client.delete('users_list_cache')
            except Exception as e:
                logger.warning(f"Failed to invalidate users cache: {e}")
            
            return jsonify({'status': 'success'})
    except Exception as e:
        logger.error(f"/users route error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@admin_bp.route('/admin-logout-user', methods=['POST'])
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
        from ..services.sse_service import publish_sse_event
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

@admin_bp.route('/update-user-role', methods=['POST'])
def update_user_role():
    if session.get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Admin only'}), 403
    try:
        data = request.json
        username = data.get('username', '').strip()
        new_role = data.get('role', '').strip()
        
        if not username or not new_role:
            return jsonify({'status': 'error', 'message': 'Username and role required'}), 400
        
        if new_role not in ['user', 'admin']:
            return jsonify({'status': 'error', 'message': 'Invalid role. Must be "user" or "admin"'}), 400
        
        users = get_users()
        if username not in users:
            return jsonify({'status': 'error', 'message': 'User not found'}), 404
        
        # Prevent admin from demoting themselves
        if username == session.get('username') and new_role == 'user':
            return jsonify({'status': 'error', 'message': 'Cannot demote yourself from admin'}), 400
        
        # Prevent role changes for main admin
        if username == ADMIN_USERNAME:
            return jsonify({'status': 'error', 'message': 'Cannot modify main admin privileges'}), 400
        
        users[username]['role'] = new_role
        save_users(users)
        
        # Invalidate cache when user data changes
        try:
            redis_client.delete('users_list_cache')
        except Exception as e:
            logger.warning(f"Failed to invalidate users cache: {e}")
        
        # Send SSE notification to the user about role change (but don't force logout)
        from ..services.sse_service import publish_sse_event
        if new_role == 'user':
            publish_sse_event(username, 'role-change', {'reason': 'Role changed to user - admin privileges revoked'})
        else:
            publish_sse_event(username, 'role-change', {'reason': f'Role changed to {new_role}'})
        
        logger.info(f"Admin {session.get('username')} changed user {username} role to {new_role}")
        return jsonify({'status': 'success', 'message': f'User {username} role updated to {new_role}'})
        
    except Exception as e:
        logger.error(f"Error updating user role: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@admin_bp.route('/events')
def sse_events():
    username = session.get('username')
    if not username:
        return Response('Unauthorized', status=401)
    
    # Create unique connection ID for this SSE connection
    global sse_connection_counter
    with sse_lock:
        sse_connection_counter += 1
        connection_id = f"{username}_{sse_connection_counter}"
        sse_queues[connection_id] = queue.Queue()
    
    # Check for any pending messages in Redis for this user
    queue_key = f'{SSE_QUEUE_PREFIX}{username}'
    try:
        # Get any pending messages from Redis (up to 10 to avoid blocking)
        for _ in range(10):
            redis_payload = redis_client.rpop(queue_key)
            if redis_payload:
                payload = json.loads(redis_payload)
                sse_queues[connection_id].put(payload)
            else:
                break
    except Exception as e:
        logger.warning(f"Error checking Redis queue for {username}: {str(e)}")
    
    def event_stream():
        last_heartbeat = time.time()
        try:
            while True:
                current_time = time.time()
                # Send heartbeat every 15 seconds to keep connection alive
                if current_time - last_heartbeat > 15:
                    yield ': heartbeat\n\n'  # Keep-alive comment
                    last_heartbeat = current_time
                
                try:
                    # First try local queue (fastest)
                    payload = sse_queues[connection_id].get(timeout=0.1)
                    event = payload.get('event')
                    data = payload.get('data', {})
                    yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                except queue.Empty:
                    # If local queue is empty, check Redis queue (cross-worker)
                    queue_key = f'{SSE_QUEUE_PREFIX}{username}'
                    try:
                        redis_payload = redis_client.rpop(queue_key)
                        if redis_payload:
                            payload = json.loads(redis_payload)
                            event = payload.get('event')
                            data = payload.get('data', {})
                            yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                    except Exception as e:
                        # Redis error, continue with heartbeat
                        pass
                except Exception as e:
                    logger.error(f"SSE queue error for {connection_id}: {str(e)}")
                    break  # Exit on error to prevent hanging
        finally:
            # Cleanup queue on disconnect
            with sse_lock:
                if connection_id in sse_queues:
                    # Double-check if queue is empty after lock
                    if sse_queues[connection_id].empty():
                        del sse_queues[connection_id]
    
    return Response(stream_with_context(event_stream()), 
                   mimetype='text/event-stream',
                   headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
