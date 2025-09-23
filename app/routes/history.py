"""
History management routes
This file contains all history-related routes from app.py
"""
from flask import Blueprint, request, jsonify, session
import time
import json
import logging
import threading

from ..utils.redis_client import history_redis, history_key_manager
from ..utils.helpers import history_cache
from ..utils.decorators import rate_limit

logger = logging.getLogger(__name__)

# Create blueprint
history_bp = Blueprint('history', __name__)

# --- Helper Functions ---
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

def get_history_items_batch(timestamps):
    """Get multiple history items in a single Redis pipeline call (OPTIMIZATION)"""
    if not timestamps:
        return []
    
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return []
        
        # Use pipeline to fetch all items at once
        with history_redis.pipeline() as pipe:
            timestamp_to_key = {}
            for timestamp in timestamps:
                item_key = history_key_manager.get_history_item_key(timestamp)
                timestamp_to_key[timestamp] = item_key
                pipe.get(item_key)
            results = pipe.execute()
        
        # Parse results, maintaining the same order and error handling as single function
        items = []
        for i, (timestamp, item_data) in enumerate(zip(timestamps, results)):
            if item_data:
                try:
                    parsed_item = json.loads(item_data)
                    items.append(parsed_item)
                    logger.debug(f"Retrieved history item: {timestamp_to_key[timestamp]}")
                except json.JSONDecodeError as e:
                    logger.error(f"Error parsing history item {timestamp}: {str(e)}")
                    # Continue processing other items, same behavior as single function
                    continue
            else:
                logger.warning(f"History item not found: {timestamp_to_key[timestamp]}")
                # Don't append None, maintain same behavior as single function filtering
                continue
        
        return items
        
    except Exception as e:
        logger.error(f"Error getting batch history items: {str(e)}")
        return []

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
        
        # OPTIMIZATION: Batch fetch all needed items instead of individual calls
        timestamps = [timestamp for metadata_json, timestamp in metadata_items]
        items = get_history_items_batch(timestamps)
        
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

# --- Routes ---
@history_bp.route('/get-history', methods=['GET'])
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
        from ..services.search_service import search_history_redis_optimized
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

@history_bp.route('/load-from-history/<timestamp>', methods=['GET'])
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
            from ..services.sse_service import publish_sse_event
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

@history_bp.route('/delete-from-history/<timestamp>', methods=['DELETE'])
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
        from ..services.search_service import create_search_index
        threading.Thread(target=create_search_index, daemon=True).start()
        
        return jsonify({'status': 'success'})
        
    except Exception as e:
        logger.error(f"Error deleting history entry: {str(e)}")
        return jsonify({'status': 'error', 'message': f'Error deleting entry: {str(e)}'}), 500
