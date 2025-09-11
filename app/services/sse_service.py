"""
Server-Sent Events service
This file contains SSE-related functionality from app.py
"""
import json
import logging
import threading
import queue
import time
import atexit
from collections import defaultdict

from ..utils.redis_client import redis_client

logger = logging.getLogger(__name__)

# --- SSE Pub/Sub Setup ---
SSE_CHANNEL_PREFIX = 'sse_channel_'

# Helper: Publish SSE event to a user
def publish_sse_event(username, event_type, data=None):
    channel = f'{SSE_CHANNEL_PREFIX}{username}'
    payload = {'event': event_type, 'data': data or {}}
    logger.info(f"Publishing SSE event '{event_type}' to {channel}: {payload}")
    try:
        redis_client.publish(channel, json.dumps(payload))
        logger.debug(f"Successfully published SSE event to {channel}")
    except Exception as e:
        logger.error(f"Failed to publish SSE event to {channel}: {str(e)}")

# --- Centralized SSE Management ---
# Global SSE manager - shared across all workers via Redis
SSE_QUEUE_PREFIX = 'sse_queue_'
sse_queues = defaultdict(queue.Queue)  # Local user-specific queues for events
sse_lock = threading.Lock()  # For thread-safe access
sse_listener_running = True
sse_connection_counter = 0  # Counter for unique connection IDs

def sse_background_listener():
    """Background thread to listen for Redis Pub/Sub messages and route them to user queues"""
    global sse_listener_running
    pubsub = None
    try:
        pubsub = redis_client.pubsub()
        pubsub.psubscribe(f'{SSE_CHANNEL_PREFIX}*')  # Subscribe to all user channels
        logger.info("SSE background listener started successfully")
        
        for message in pubsub.listen():
            if not sse_listener_running:
                break
            try:
                if message['type'] == 'pmessage':
                    channel = message['channel']
                    username = channel.split(SSE_CHANNEL_PREFIX)[1]
                    payload = json.loads(message['data'])
                    
                    # Store in all local queues for this user (multiple browser connections)
                    with sse_lock:
                        # Find all queues for this user
                        user_queues_found = False
                        for queue_name, user_queue in sse_queues.items():
                            if queue_name.startswith(f"{username}_"):
                                user_queue.put(payload)
                                user_queues_found = True
                        
                        # Only store in Redis if no local queues exist (cross-worker fallback)
                        if not user_queues_found:
                            queue_key = f'{SSE_QUEUE_PREFIX}{username}'
                            try:
                                # Use pipeline for atomic operations
                                with redis_client.pipeline() as pipe:
                                    pipe.lpush(queue_key, json.dumps(payload))
                                    pipe.expire(queue_key, 15)  # Expire after 15 seconds
                                    pipe.llen(queue_key)
                                    results = pipe.execute()
                                    
                                    # Limit queue size to prevent memory buildup (keep only last 5 messages)
                                    if results[2] > 5:  # llen result
                                        redis_client.ltrim(queue_key, 0, 4)  # Keep only first 5 elements
                            except Exception as e:
                                logger.error(f"Error storing SSE message in Redis: {str(e)}")
            except Exception as e:
                logger.error(f"Error processing SSE message: {str(e)}")
                continue
    except Exception as e:
        logger.error(f"SSE background listener error: {str(e)}")
    finally:
        if pubsub:
            try:
                pubsub.close()
            except:
                pass
        logger.info("SSE background listener stopped")

# Graceful shutdown handler
def cleanup_sse():
    global sse_listener_running
    sse_listener_running = False
    logger.info("SSE cleanup initiated")

atexit.register(cleanup_sse)

def start_sse_listener():
    """Start the background listener thread on app startup"""
    sse_thread = threading.Thread(target=sse_background_listener, daemon=True)
    sse_thread.start()
    return sse_thread

def clear_stale_sse_data():
    """Clear any stale SSE data on startup"""
    try:
        pattern = f'{SSE_QUEUE_PREFIX}*'
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
            logger.info(f"Cleared {len(keys)} stale SSE queue keys on startup")
    except Exception as e:
        logger.warning(f"Failed to clear stale SSE data: {str(e)}")
