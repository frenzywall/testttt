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
    - Partial search cache stores results from expensive hash field scanning
    - Used to avoid repeated expensive Redis HGETALL operations
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

            # OPTIMIZED: Clear all search indexes efficiently with single SCAN operation
            def clear_all_search_keys_efficiently():
                """Clear all old SET-based search keys in one optimized operation"""
                all_keys_to_delete = []
                patterns = [
                    f'{history_key_manager.history_prefix}:search:title:*',
                    f'{history_key_manager.history_prefix}:search:date:*',
                    f'{history_key_manager.history_prefix}:search:editor:*'
                ]
                
                # Single SCAN operation for all patterns
                for pattern in patterns:
                    cursor = 0
                    while True:
                        cursor, keys = history_redis.scan(cursor, match=pattern, count=200)
                        all_keys_to_delete.extend(keys)
                        if cursor == 0:
                            break
                
                return all_keys_to_delete

            # Get all old keys to delete in single operation
            old_keys = clear_all_search_keys_efficiently()
            
            # OPTIMIZED: Single pipeline for all clearing operations
            title_index_key = f'{history_key_manager.history_prefix}:search_index:title'
            date_index_key = f'{history_key_manager.history_prefix}:search_index:date'
            editor_index_key = f'{history_key_manager.history_prefix}:search_index:editor'
            
            # Clear old keys in batches (Redis DELETE has limits)
            if old_keys:
                logger.debug(f"Clearing {len(old_keys)} old SET-based search keys")
                for i in range(0, len(old_keys), 1000):  # Process in batches of 1000
                    batch_keys = old_keys[i:i+1000]
                    history_redis.delete(*batch_keys)
            
            # Clear new hash indexes and caches in single operation
            with history_redis.pipeline() as pipe:
                pipe.delete(title_index_key, date_index_key, editor_index_key)
                pipe.execute()
            
            # Clear search caches (done outside pipeline for efficiency)
            clear_partial_search_cache()
            clear_failed_search_cache()

            # HASH-BASED OPTIMIZATION: Build index structures in memory, then store as hashes
            title_index = {}  # {word: [timestamp1, timestamp2, ...]}
            date_index = {}   # {date: [timestamp1, timestamp2, ...]}
            editor_index = {} # {editor: [timestamp1, timestamp2, ...]}
            
            indexed_count = 0
            page_size = 500
            for start in range(0, total_count, page_size):
                end = min(start + page_size - 1, total_count - 1)
                page = history_redis.zrevrange(metadata_key, start, end, withscores=True)
                if not page:
                    continue

                # OPTIMIZATION: Batch fetch all items for this page
                timestamps = [score for metadata_json, score in page]
                from ..routes.history import get_history_items_batch
                items = get_history_items_batch(timestamps)
                
                # Build indexes in memory for this page
                for item in items:
                    timestamp = item.get('timestamp')
                    if not timestamp or not item:
                        continue

                    title = item.get('title', '').lower().strip()
                    date = item.get('date', '').lower().strip()

                    last_edited_by = ''
                    if item.get('data') and item['data'].get('last_edited_by'):
                        last_edited_by = item['data']['last_edited_by'].lower().strip()

                    if not timestamp:
                        continue

                    # Index title words
                    if title:
                        for word in title.split():
                            if word:
                                if word not in title_index:
                                    title_index[word] = []
                                title_index[word].append(str(timestamp))

                    # Index date and date parts
                    if date:
                        if date not in date_index:
                            date_index[date] = []
                        date_index[date].append(str(timestamp))

                        date_parts = date.split('-')
                        for part in date_parts:
                            if part:
                                if part not in date_index:
                                    date_index[part] = []
                                date_index[part].append(str(timestamp))

                    # Index editor and editor parts
                    if last_edited_by:
                        if last_edited_by not in editor_index:
                            editor_index[last_edited_by] = []
                        editor_index[last_edited_by].append(str(timestamp))

                        editor_parts = last_edited_by.split()
                        for part in editor_parts:
                            if part and len(part) > 2:
                                if part not in editor_index:
                                    editor_index[part] = []
                                editor_index[part].append(str(timestamp))

                    indexed_count += 1

            # OPTIMIZED: Store all indexes using bulk hash operations (3 commands vs 100s)
            title_index_key = f'{history_key_manager.history_prefix}:search_index:title'
            date_index_key = f'{history_key_manager.history_prefix}:search_index:date'
            editor_index_key = f'{history_key_manager.history_prefix}:search_index:editor'
            
            with history_redis.pipeline() as pipe:
                # Build title index hash mapping (single HSET with mapping)
                if title_index:
                    title_hash_data = {word: ",".join(timestamps) for word, timestamps in title_index.items()}
                    pipe.hset(title_index_key, mapping=title_hash_data)
                
                # Build date index hash mapping (single HSET with mapping)  
                if date_index:
                    date_hash_data = {date_term: ",".join(timestamps) for date_term, timestamps in date_index.items()}
                    pipe.hset(date_index_key, mapping=date_hash_data)
                
                # Build editor index hash mapping (single HSET with mapping)
                if editor_index:
                    editor_hash_data = {editor_term: ",".join(timestamps) for editor_term, timestamps in editor_index.items()}
                    pipe.hset(editor_index_key, mapping=editor_hash_data)
                
                # Execute all hash creations in single network call (max 3 Redis commands)
                pipe.execute()

            logger.info(f"Hash-based search index rebuild completed - indexed {indexed_count} items "
                       f"({len(title_index)} title terms, {len(date_index)} date terms, {len(editor_index)} editor terms)")
        
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
        
        # Step 1: HASH-BASED OPTIMIZATION - Use hash lookups for O(1) filtering
        title_index_key = f'{history_key_manager.history_prefix}:search_index:title'
        date_index_key = f'{history_key_manager.history_prefix}:search_index:date'
        editor_index_key = f'{history_key_manager.history_prefix}:search_index:editor'
        
        # Use pipelining to batch Redis hash operations
        with history_redis.pipeline() as pipe:
            pipe.hget(title_index_key, search_lower)
            pipe.hget(date_index_key, search_lower)
            pipe.hget(editor_index_key, search_lower)
            results = pipe.execute()
            title_data = results[0]
            date_data = results[1]
            editor_data = results[2]
        
        # Parse compressed timestamp lists and combine matches
        all_matches = set()
        if title_data:
            all_matches.update(title_data.split(","))
        if date_data:
            all_matches.update(date_data.split(","))
        if editor_data:
            all_matches.update(editor_data.split(","))
        
        if not all_matches:
            # Try Redis-based partial matching (O(k) instead of O(n))
            partial_results = search_history_redis_partial(search_lower)
            return partial_results
        
        # NEW: Define limits for exact matches (mirroring partial path)
        MAX_RESULTS = 50  # Final results to return
        PROCESS_BUFFER = 100  # Process a few more for better scoring, then trim
        
        # NEW: Pre-sort matches by timestamp (newest first) and limit before loading
        sorted_matches = sorted(list(all_matches), key=lambda ts: float(ts), reverse=True)[:PROCESS_BUFFER]
        
        # Step 2: OPTIMIZATION - Batch fetch all matching entries, then apply scoring
        # Import here to avoid circular dependency
        from ..routes.history import get_history_items_batch
        entries = get_history_items_batch(sorted_matches)
        
        matching_entries = []
        for entry in entries:
            # Apply intelligent scoring (same logic as before)
            scored_entry = apply_search_scoring(entry, search_lower)
            if scored_entry:
                matching_entries.append(scored_entry)
                # Early termination if we have enough results (same logic as before)
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

        # HASH-BASED PARTIAL SEARCH - Scan hash fields instead of keys
        title_index_key = f'{history_key_manager.history_prefix}:search_index:title'
        date_index_key = f'{history_key_manager.history_prefix}:search_index:date'
        editor_index_key = f'{history_key_manager.history_prefix}:search_index:editor'

        all_matches = set()

        # Scan hash fields for partial matches using HSCAN + MATCH (streaming, bounded)
        def scan_hash_fields(hash_key, search_pattern, limit=300, count=500):
            """Stream hash fields with HSCAN and server-side MATCH, with early exit.
            - limit: max timestamps to collect from this hash
            - count: hint for HSCAN batch size
            """
            matching_timestamps = set()
            try:
                cursor = 0
                pattern_contains = f"*{search_pattern}*"  # contains
                # Stream through the hash until we either exhaust it or reach the limit
                while True:
                    cursor, data = history_redis.hscan(name=hash_key, cursor=cursor, match=pattern_contains, count=count)
                    if data:
                        for _, timestamp_csv in data.items():
                            if timestamp_csv:
                                matching_timestamps.update(timestamp_csv.split(","))
                                if len(matching_timestamps) >= limit:
                                    return matching_timestamps
                    if cursor == 0:
                        break
            except Exception as e:
                logger.error(f"Error scanning hash fields in {hash_key}: {str(e)}")
            return matching_timestamps

        # Search in title index (cap matches to keep work bounded)
        title_matches = scan_hash_fields(title_index_key, search_lower, limit=300, count=500)
        all_matches.update(title_matches)

        # Search in date index
        date_matches = scan_hash_fields(date_index_key, search_lower, limit=300, count=500)
        all_matches.update(date_matches)

        # Search in editor index
        editor_matches = scan_hash_fields(editor_index_key, search_lower, limit=300, count=500)
        all_matches.update(editor_matches)

        if not all_matches:
            # Cache failed search
            history_redis.setex(failed_cache_key, 300, '1')  # 5 minute cache
            return []

        # Process matches (limit to avoid memory issues)
        MAX_RESULTS = 50
        PROCESS_BUFFER = 100

        sorted_matches = sorted(list(all_matches), key=lambda ts: float(ts), reverse=True)[:PROCESS_BUFFER]

        # OPTIMIZATION: Batch fetch all matching entries
        from ..routes.history import get_history_items_batch
        entries = get_history_items_batch(sorted_matches)
        
        matching_entries = []
        for entry in entries:
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
