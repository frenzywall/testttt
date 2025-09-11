"""
Decorators and middleware
This file contains decorators like rate_limit and authentication checks from app.py
"""
import time
import logging
from functools import wraps
from flask import request, jsonify

from ..config import RATE_LIMIT, RATE_WINDOW, RATE_LIMIT_ENABLED
from ..utils.redis_client import redis_client

logger = logging.getLogger(__name__)

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
