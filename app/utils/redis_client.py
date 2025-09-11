"""
Redis client utilities
This file contains Redis connection and key management functionality from app.py
"""
import redis
import logging
from ..config import (
    REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB, REDIS_SESSION_DB, 
    REDIS_HISTORY_DB, REDIS_MAX_CONNECTIONS, REDIS_SOCKET_TIMEOUT,
    REDIS_SOCKET_CONNECT_TIMEOUT, REDIS_HEALTH_CHECK_INTERVAL
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

# --- Redis client for app data (decode_responses=True, db=0) ---
try:
    redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        password=REDIS_PASSWORD,
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
        retry_on_error=[redis.ConnectionError, redis.TimeoutError]
    )
    redis_client = redis.Redis(connection_pool=redis_pool)
    redis_client.ping()
    logger.info(f"Successfully connected to Redis (app data) with connection pooling and password authentication. Pool size: {REDIS_MAX_CONNECTIONS}")
except redis.RedisError as e:
    logger.error(f"Redis connection error (app data): {str(e)}")
    raise  # Remove MockRedis fallback, fail hard if Redis is unavailable

# --- Redis client for Flask-Session (decode_responses=False, db=1) ---
try:
    session_redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_SESSION_DB,  # Use a different DB for sessions
        password=REDIS_PASSWORD,
        decode_responses=False,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
        retry_on_error=[redis.ConnectionError, redis.TimeoutError]
    )
    session_redis = redis.Redis(connection_pool=session_redis_pool)
    session_redis.ping()
    logger.info("Successfully connected to Redis (session data) with connection pooling and password authentication")
except redis.RedisError as e:
    logger.error(f"Redis connection error (session data): {str(e)}")
    session_redis = None

# --- Redis client for History data (decode_responses=True, db=2) ---
try:
    history_redis_pool = redis.ConnectionPool(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_HISTORY_DB,  # Use a different DB for history data
        password=REDIS_PASSWORD,
        decode_responses=True,
        max_connections=REDIS_MAX_CONNECTIONS,
        socket_timeout=REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=REDIS_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
        retry_on_error=[redis.ConnectionError, redis.TimeoutError]
    )
    history_redis = redis.Redis(connection_pool=history_redis_pool)
    history_redis.ping()
    logger.info("Successfully connected to Redis (history data) with connection pooling and password authentication")
    
    # Initialize key managers
    history_key_manager = OptimizedKeyManager(history_redis)
    
except redis.RedisError as e:
    logger.error(f"Redis connection error (history data): {str(e)}")
    history_redis = None
    history_key_manager = None
