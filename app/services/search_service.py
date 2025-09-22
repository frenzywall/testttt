"""
Search service
This file contains search-related functionality from app.py
"""
import json
import logging
import threading
import time
import re

from ..utils.redis_client import redis_client, history_redis, history_key_manager

logger = logging.getLogger(__name__)

# Thread synchronization for search index operations
search_index_lock = threading.Lock()
search_index_last_rebuild = 0

def is_search_index_busy():
    """Check if search index rebuild is currently in progress"""
    try:
        return bool(redis_client.get('search_index_busy'))
    except Exception as e:
        logger.warning(f"Could not check Redis for search index status: {str(e)}")
        return False

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

def initialize_search_index_async():
    """Initialize search index in a separate thread after app startup"""
    import time
    time.sleep(2)  # Wait 2 seconds for app to fully start
    try:
        create_search_index()
        logger.info("Search index initialized successfully (async)")
    except Exception as e:
        logger.error(f"Error initializing search index (async): {str(e)}")

def start_search_index_initialization():
    """Start async initialization in a separate thread"""
    search_index_thread = threading.Thread(target=initialize_search_index_async, daemon=True)
    search_index_thread.start()
    return search_index_thread

def create_search_index():
    """
    Create Redis search index for O(1) search performance with pipelining
    
    Thread Safety:
    - Uses Redis to coordinate between worker processes
    - Uses threading.Lock() to prevent concurrent index rebuilds within same process
    - Tracks rebuild status to avoid unnecessary operations
    - No debouncing: rebuilds are allowed immediately when not busy
    """
    global search_index_last_rebuild
    
    # Use Redis to coordinate between worker processes
    search_busy_key = 'search_index_busy'
    search_last_rebuild_key = 'search_index_last_rebuild'
    
    # Check if another process is already rebuilding
    try:
        if redis_client.get(search_busy_key):
            logger.info("Search index rebuild already in progress (by another process), skipping...")
            return
    except Exception as e:
        logger.warning(f"Could not check Redis for search index status: {str(e)}")
    
    # Acquire lock to prevent concurrent rebuilds within this process
    with search_index_lock:
        # Double-check Redis after acquiring lock
        try:
            if redis_client.get(search_busy_key):
                logger.info("Search index rebuild already in progress (by another process), skipping...")
                return
        except Exception as e:
            logger.warning(f"Could not check Redis for search index status: {str(e)}")
        
        # No debouncing: proceed if not busy
        current_time = time.time()
        
        # Set busy flag in Redis (with 10 minute expiry to prevent stuck locks)
        try:
            redis_client.setex(search_busy_key, 600, '1')
            redis_client.set(search_last_rebuild_key, str(current_time))
            search_index_last_rebuild = current_time
        except Exception as e:
            logger.error(f"Could not set Redis search index status: {str(e)}")
            return
        try:
            logger.info("Starting search index rebuild...")
            
            if not history_redis or not history_key_manager:
                logger.error("History Redis client not available")
                return
            
            # Get metadata key and total count
            metadata_key = history_key_manager.get_metadata_key()
            total_count = history_redis.zcard(metadata_key)
            if total_count == 0:
                logger.info("No history data found for indexing")
                return

            # First, clear existing search indexes and caches
            def clear_search_keys_with_scan(pattern):
                keys_to_delete = []
                cursor = 0
                while True:
                    cursor, keys = history_redis.scan(cursor, match=pattern, count=100)
                    keys_to_delete.extend(keys)
                    if cursor == 0:
                        break
                return keys_to_delete

            with history_redis.pipeline() as pipe:
                search_keys = clear_search_keys_with_scan(f'{history_key_manager.history_prefix}:search:title:*')
                date_keys = clear_search_keys_with_scan(f'{history_key_manager.history_prefix}:search:date:*')
                editor_keys = clear_search_keys_with_scan(f'{history_key_manager.history_prefix}:search:editor:*')
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
                pipe.execute()

            # Page through ZSET to avoid loading everything into memory at once
            indexed_count = 0
            page_size = 500
            for start in range(0, total_count, page_size):
                end = min(start + page_size - 1, total_count - 1)
                page = history_redis.zrevrange(metadata_key, start, end, withscores=True)
                if not page:
                    continue

                with history_redis.pipeline() as pipe:
                    for metadata_json, score in page:
                        # Use score as the timestamp
                        timestamp = score
                        # Get the full item to extract title and date
                        # Import here to avoid circular dependency
                        from ..routes.history import get_history_item_by_timestamp
                        item = get_history_item_by_timestamp(timestamp)
                        if not item:
                            continue

                        title = item.get('title', '').lower().strip()
                        date = item.get('date', '').lower().strip()

                        last_edited_by = ''
                        if item.get('data') and item['data'].get('last_edited_by'):
                            last_edited_by = item['data']['last_edited_by'].lower().strip()

                        if not timestamp:
                            continue

                        if title:
                            for word in title.split():
                                if word:
                                    search_key = history_key_manager.get_search_key('title', word)
                                    pipe.sadd(search_key, timestamp)

                        if date:
                            date_search_key = history_key_manager.get_search_key('date', date)
                            pipe.sadd(date_search_key, timestamp)

                            date_parts = date.split('-')
                            for part in date_parts:
                                if part:
                                    part_search_key = history_key_manager.get_search_key('date', part)
                                    pipe.sadd(part_search_key, timestamp)

                        if last_edited_by:
                            editor_search_key = history_key_manager.get_search_key('editor', last_edited_by)
                            pipe.sadd(editor_search_key, timestamp)

                            editor_parts = last_edited_by.split()
                            for part in editor_parts:
                                if part and len(part) > 2:
                                    part_search_key = history_key_manager.get_search_key('editor', part)
                                    pipe.sadd(part_search_key, timestamp)

                        indexed_count += 1
                    pipe.execute()

            logger.info(f"Search index rebuild completed - indexed {indexed_count} items")
        
        except Exception as e:
            logger.error(f"Error creating search index: {str(e)}")
        finally:
            # Always clear busy flag in Redis, even on error
            try:
                redis_client.delete('search_index_busy')
            except Exception as e:
                logger.warning(f"Could not clear Redis search index busy flag: {str(e)}")

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
            # Import here to avoid circular dependency
            from ..routes.history import get_history_item_by_timestamp
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
                'exact': 80,
                'starts_with': 40,
                'word_match': 25,
                'contains': 15
            },
            'match_sources': {
                'exact': 'exact date match',
                'starts_with': 'date starts with',
                'word_match': 'date word match',
                'contains': 'date contains'
            }
        },
        {
            'name': 'editor',
            'value': last_edited_by,
            'priority': 'low',
            'scores': {
                'exact': 60,
                'starts_with': 30,
                'word_match': 20,
                'contains': 10
            },
            'match_sources': {
                'exact': 'exact editor match',
                'starts_with': 'editor starts with',
                'word_match': 'editor word match',
                'contains': 'editor contains'
            }
        }
    ]
    
    total_score = 0
    match_details = []
    
    for field in search_fields:
        field_value = field['value']
        if not field_value:
            continue
            
        # Check for exact match
        if field_value == search_lower:
            score = field['scores']['exact']
            total_score += score
            match_details.append(field['match_sources']['exact'])
            continue
            
        # Check for starts with
        if field_value.startswith(search_lower):
            score = field['scores']['starts_with']
            total_score += score
            match_details.append(field['match_sources']['starts_with'])
            continue
            
        # Check for word match
        words = field_value.split()
        if search_lower in words:
            score = field['scores']['word_match']
            total_score += score
            match_details.append(field['match_sources']['word_match'])
            continue
            
        # Check for contains
        if search_lower in field_value:
            score = field['scores']['contains']
            total_score += score
            match_details.append(field['match_sources']['contains'])
    
    # Only return entries with a score > 0
    if total_score > 0:
        entry_copy = entry.copy()
        entry_copy['_search_score'] = total_score
        # Maintain backward compatibility with frontend expecting `_match_sources`
        entry_copy['_match_details'] = match_details
        entry_copy['_match_sources'] = match_details
        return entry_copy
    
    return None

def search_history_redis_partial(search_lower):
    """Redis-based partial matching for when exact matches fail (title/date/editor) using SCAN."""
    try:
        if not history_redis or not history_key_manager:
            logger.error("History Redis client not available")
            return []

        # Check failed search cache first
        failed_cache_key = f'{history_key_manager.history_prefix}:cache:failed:{search_lower}'
        if history_redis.exists(failed_cache_key):
            logger.debug(f"Returning cached failed search result for: {search_lower}")
            return []

        # Check partial search cache
        partial_cache_key = f'{history_key_manager.history_prefix}:cache:partial:{search_lower}'
        cached_result = history_redis.get(partial_cache_key)
        if cached_result:
            logger.debug(f"Returning cached partial search result for: {search_lower}")
            return json.loads(cached_result)

        # Generate search patterns for title/date/editor (FULL KEY PATTERNS)
        patterns = generate_search_patterns(search_lower)

        # Search using SCAN across all fields to resolve wildcards
        def scan_keys(match_pattern: str):
            found_keys = []
            cursor = 0
            while True:
                cursor, keys = history_redis.scan(cursor, match=match_pattern, count=200)
                if keys:
                    found_keys.extend(keys)
                if cursor == 0:
                    break
            return found_keys

        all_matches = set()

        # Collect matching set keys for each field
        matching_keys = []
        for pattern in patterns['title']:
            matching_keys.extend(scan_keys(pattern))
        for pattern in patterns['date']:
            matching_keys.extend(scan_keys(pattern))
        for pattern in patterns['editor']:
            matching_keys.extend(scan_keys(pattern))

        # Union timestamps from all matched keys
        if matching_keys:
            with history_redis.pipeline() as pipe:
                for k in matching_keys:
                    pipe.smembers(k)
                results = pipe.execute()
            for members in results:
                all_matches.update(members)

        if not all_matches:
            # Cache failed search
            history_redis.setex(failed_cache_key, 300, '1')  # 5 minute cache
            return []

        # Process matches (limit to avoid memory issues)
        MAX_RESULTS = 50
        PROCESS_BUFFER = 100

        sorted_matches = sorted(list(all_matches), key=lambda ts: float(ts), reverse=True)[:PROCESS_BUFFER]

        matching_entries = []
        for timestamp in sorted_matches:
            from ..routes.history import get_history_item_by_timestamp
            entry = get_history_item_by_timestamp(timestamp)
            if entry:
                scored_entry = apply_search_scoring(entry, search_lower)
                if scored_entry:
                    matching_entries.append(scored_entry)
                    if len(matching_entries) >= MAX_RESULTS:
                        break

        # Sort by relevance score
        matching_entries.sort(key=lambda x: (x.get('_search_score', 0), x.get('timestamp', 0)), reverse=True)
        matching_entries = matching_entries[:MAX_RESULTS]

        # Remove temporary score field
        for entry in matching_entries:
            entry.pop('_search_score', None)

        # Cache the result
        if matching_entries:
            history_redis.setex(partial_cache_key, 300, json.dumps(matching_entries))  # 5 minute cache

        return matching_entries

    except Exception as e:
        logger.error(f"Error in partial Redis search: {str(e)}")
        return []

def generate_search_patterns(search_term):
    """Generate FULL Redis key patterns for partial matching (title/date/editor)."""
    patterns = {
        'title': [],
        'date': [],
        'editor': []
    }

    # Base (contains) patterns
    patterns['title'].append(f"{history_key_manager.history_prefix}:search:title:*{search_term}*")
    patterns['date'].append(f"{history_key_manager.history_prefix}:search:date:*{search_term}*")
    patterns['editor'].append(f"{history_key_manager.history_prefix}:search:editor:*{search_term}*")

    # Prefix/suffix variants only for longer terms
    if len(search_term) >= 8:
        patterns['title'].append(f"{history_key_manager.history_prefix}:search:title:{search_term}*")
        patterns['title'].append(f"{history_key_manager.history_prefix}:search:title:*{search_term}")
        patterns['date'].append(f"{history_key_manager.history_prefix}:search:date:{search_term}*")
        patterns['date'].append(f"{history_key_manager.history_prefix}:search:date:*{search_term}")
        patterns['editor'].append(f"{history_key_manager.history_prefix}:search:editor:{search_term}*")
        patterns['editor'].append(f"{history_key_manager.history_prefix}:search:editor:*{search_term}")

    # Word-level contains for multi-word searches
    if ' ' in search_term:
        for word in search_term.split():
            if len(word) > 2:
                patterns['title'].append(f"{history_key_manager.history_prefix}:search:title:*{word}*")
                patterns['date'].append(f"{history_key_manager.history_prefix}:search:date:*{word}*")
                patterns['editor'].append(f"{history_key_manager.history_prefix}:search:editor:*{word}*")

    return patterns
