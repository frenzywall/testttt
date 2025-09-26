"""
Helper utilities
This file contains helper functions and classes from app.py
"""
import time
import hashlib

# Server-side caching for history
class HistoryCache:
    def __init__(self):
        self.cache = {}
        self.etags = {}
    
    def get_cache_key(self, search_term=None, page=None, per_page=None):
        if search_term:
            return f"search_{hashlib.md5(search_term.encode()).hexdigest()}"
        else:
            return f"page_{page}_{per_page}"
    
    def get_etag(self, cache_key):
        return self.etags.get(cache_key, "0")
    
    def set_cache(self, cache_key, data, etag):
        self.cache[cache_key] = {
            'data': data,
            'timestamp': time.time(),
            'etag': etag
        }
        self.etags[cache_key] = etag
    
    def get_cache(self, cache_key):
        cached = self.cache.get(cache_key)
        if cached and (time.time() - cached['timestamp']) < 300:  # 5 min TTL
            return cached['data'], cached['etag']
        return None, None

# Global cache instance
history_cache = HistoryCache()
