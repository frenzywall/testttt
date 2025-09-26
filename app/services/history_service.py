"""
History service
This file contains history management functionality from app.py
"""
import json
import logging
import threading
from datetime import datetime

from ..config import HISTORY_LIMIT
from ..utils.redis_client import history_redis, history_key_manager

logger = logging.getLogger(__name__)

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
        from .search_service import create_search_index
        threading.Thread(target=create_search_index, daemon=True).start()
        return True
    except Exception as e:
        logger.error(f"Error saving to history: {str(e)}")
        return False

def migrate_history_to_redis():
    """Migrate all history-related keys from main Redis to history Redis with hash tags"""
    try:
        from ..utils.redis_client import redis_client, history_redis, history_key_manager
        
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
