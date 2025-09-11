"""
AI service
This file contains AI-related functionality from app.py
"""
import json
import logging
import os
from datetime import datetime
from google import genai
from google.genai import types

from ..config import GEMINI_API_KEY, GEMINI_MODEL
from ..utils.redis_client import redis_client

logger = logging.getLogger(__name__)

def get_ai_performance_stats():
    """Get AI performance stats from Redis"""
    try:
        stats_data = redis_client.get('ai_performance_stats')
        if stats_data:
            stats = json.loads(stats_data)
            # Convert datetime strings back to datetime objects
            if stats.get('last_request_time'):
                stats['last_request_time'] = datetime.fromisoformat(stats['last_request_time'])
            if stats.get('daily_reset_date'):
                stats['daily_reset_date'] = datetime.fromisoformat(stats['daily_reset_date']).date()
            return stats
        else:
            # Return default stats if none exist
            return {
                'requests_today': 0,
                'total_requests': 0,
                'response_times': [],
                'last_request_time': None,
                'success_count': 0,
                'error_count': 0,
                'daily_reset_date': datetime.now().date()
            }
    except Exception as e:
        logger.error(f"Error getting AI performance stats: {str(e)}")
        return {
            'requests_today': 0,
            'total_requests': 0,
            'response_times': [],
            'last_request_time': None,
            'success_count': 0,
            'error_count': 0,
            'daily_reset_date': datetime.now().date()
        }

def save_ai_performance_stats(stats):
    """Save AI performance stats to Redis"""
    try:
        # Convert datetime objects to strings for JSON serialization
        stats_copy = stats.copy()
        if stats_copy.get('last_request_time'):
            stats_copy['last_request_time'] = stats_copy['last_request_time'].isoformat()
        if stats_copy.get('daily_reset_date'):
            stats_copy['daily_reset_date'] = stats_copy['daily_reset_date'].isoformat()
        
        redis_client.set('ai_performance_stats', json.dumps(stats_copy))
        return True
    except Exception as e:
        logger.error(f"Error saving AI performance stats: {str(e)}")
        return False

def track_ai_request(response_time, success=True):
    """Track AI API request performance"""
    stats = get_ai_performance_stats()
    
    # Reset daily counters if it's a new day
    current_date = datetime.now().date()
    if stats['daily_reset_date'] != current_date:
        stats['requests_today'] = 0
        stats['daily_reset_date'] = current_date
        logger.info("Reset daily request counter for new day")
    
    # Update counters
    stats['requests_today'] += 1
    stats['total_requests'] += 1
    stats['last_request_time'] = datetime.now()
    
    if success:
        stats['success_count'] += 1
    else:
        stats['error_count'] += 1
    
    # Track response times (keep only last 100 for average)
    stats['response_times'].append(response_time)
    if len(stats['response_times']) > 100:
        stats['response_times'] = stats['response_times'][-100:]
    
    # Save to Redis
    save_ai_performance_stats(stats)
    
    # Debug logging
    logger.info(f"AI request tracked - Success: {success}, Response time: {response_time:.2f}s, Today's count: {stats['requests_today']}")

def calculate_performance_metrics():
    """Calculate performance metrics from tracked data"""
    stats = get_ai_performance_stats()
    
    # Debug logging
    logger.info(f"Calculating metrics - Total requests today: {stats['requests_today']}, Success: {stats['success_count']}, Errors: {stats['error_count']}")
    
    # Calculate average response time
    if stats['response_times']:
        avg_response_time = sum(stats['response_times']) / len(stats['response_times'])
        response_time_str = f"{avg_response_time:.2f}s"
    else:
        response_time_str = '--'
    
    # Calculate success rate
    total_requests = stats['success_count'] + stats['error_count']
    if total_requests > 0:
        success_rate = (stats['success_count'] / total_requests) * 100
        success_rate_str = f"{success_rate:.1f}%"
    else:
        success_rate_str = '--'
    
    # Format last request time
    if stats['last_request_time']:
        now = datetime.now()
        time_diff = now - stats['last_request_time']
        
        if time_diff.total_seconds() < 60:
            last_request_str = f"{int(time_diff.total_seconds())}s ago"
        elif time_diff.total_seconds() < 3600:
            last_request_str = f"{int(time_diff.total_seconds() / 60)}m ago"
        elif time_diff.total_seconds() < 86400:
            last_request_str = f"{int(time_diff.total_seconds() / 3600)}h ago"
        else:
            last_request_str = f"{int(time_diff.total_seconds() / 86400)}d ago"
    else:
        last_request_str = 'Never'
    
    metrics = {
        'responseTime': response_time_str,
        'successRate': success_rate_str,
        'requestCount': stats['requests_today'],
        'lastRequest': last_request_str
    }
    
    # Debug logging
    logger.info(f"Calculated metrics: {metrics}")
    
    return metrics
