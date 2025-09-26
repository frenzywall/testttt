"""
API routes
This file contains all API-related routes from app.py
"""
from flask import Blueprint, request, jsonify
import os
import json
import logging
from datetime import datetime
from google import genai
from google.genai import types

from ..config import GEMINI_API_KEY, GEMINI_MODEL
from ..utils.redis_client import redis_client, history_redis
from ..services.ai_service import (
    calculate_performance_metrics, save_ai_performance_stats, track_ai_request
)
from ..services.search_service import is_search_index_busy, search_index_last_rebuild

logger = logging.getLogger(__name__)

# Create blueprint
api_bp = Blueprint('api', __name__)

# --- Routes ---
@api_bp.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    try:
        redis_client.ping()
        history_status = 'connected' if history_redis and history_redis.ping() else 'disconnected'
        search_index_status = 'busy' if is_search_index_busy() else 'idle'
        
        return jsonify({
            'status': 'healthy',
            'redis': 'connected',
            'history_redis': history_status,
            'search_index': search_index_status,
            'search_index_last_rebuild': search_index_last_rebuild
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'redis': 'disconnected',
            'history_redis': 'disconnected',
            'search_index': 'unknown',
            'error': str(e)
        }), 500

@api_bp.route('/ai-status', methods=['GET'])
def ai_status():
    """Get AI processing status information"""
    try:
        import ai_processor
        
        # Check if API key is configured
        api_key_configured = bool(GEMINI_API_KEY)
        
        if not api_key_configured:
            return jsonify({
                'model': GEMINI_MODEL,
                'apiKeyStatus': 'disconnected',
                'connectionStatus': 'error',
                'error': 'GEMINI_API_KEY environment variable not set',
                'provider': 'Google Gemini',
                'performance': {
                    'responseTime': '--',
                    'successRate': '--',
                    'requestCount': '--',
                    'lastRequest': '--'
                }
            })
        
        # Check API connection
        connection_status = ai_processor.check_gemini_connection()
        
        # Determine statuses
        api_key_status = 'connected' if connection_status['connected'] else 'disconnected'
        connection_status_value = 'connected' if connection_status['connected'] else 'error'
        
        # Get model information
        model_name = GEMINI_MODEL
        
        # Check if the specific model is available
        model_available = False
        if connection_status['connected']:
            model_available = ai_processor.check_model_availability(model_name)
        
        # Calculate performance metrics
        performance_metrics = calculate_performance_metrics()
        
        return jsonify({
            'model': model_name,
            'modelAvailable': model_available,
            'apiKeyStatus': api_key_status,
            'connectionStatus': connection_status_value,
            'error': connection_status.get('error'),
            'provider': 'Google Gemini',
            'apiKeyConfigured': api_key_configured,
            'performance': performance_metrics
        })
    except Exception as e:
        logger.error(f"Error getting AI status: {str(e)}")
        return jsonify({
            'model': 'Unknown',
            'apiKeyStatus': 'error',
            'connectionStatus': 'error',
            'error': str(e),
            'provider': 'Google Gemini',
            'apiKeyConfigured': False,
            'performance': {
                'responseTime': '--',
                'successRate': '--',
                'requestCount': '--',
                'lastRequest': '--'
            }
        })

@api_bp.route('/clear-ai-stats', methods=['POST'])
def clear_ai_stats():
    """Clear all AI performance statistics"""
    try:
        # Reset to default stats
        default_stats = {
            'requests_today': 0,
            'total_requests': 0,
            'response_times': [],
            'last_request_time': None,
            'success_count': 0,
            'error_count': 0,
            'daily_reset_date': datetime.now().date()
        }
        
        # Save to Redis
        save_ai_performance_stats(default_stats)
        
        logger.info("AI performance statistics cleared successfully")
        
        return jsonify({
            'status': 'success',
            'message': 'AI statistics cleared successfully'
        })
    except Exception as e:
        logger.error(f"Error clearing AI stats: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error clearing AI statistics: {str(e)}'
        }), 500

@api_bp.route('/ask-ai', methods=['POST'])
def ask_ai():
    """Handle AI questions about the page content"""
    try:
        data = request.json
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Invalid request data'
            }), 400
            
        question = data.get('question', '').strip()
        context = data.get('context', {})
        
        if not question:
            return jsonify({
                'status': 'error',
                'message': 'Question is required'
            }), 400
        
        # Check if Gemini API is available
        if not GEMINI_API_KEY:
            return jsonify({
                'status': 'error',
                'message': 'AI service is not configured'
            }), 503
        
        # Import AI processor
        import ai_processor
        
        # Create context prompt
        context_prompt = f"""
You are a friendly and helpful AI assistant. You can answer questions about change management data, services, or the current page, but you can also chat about anything else in a casual, friendly way.

Here is the current page context (for reference only):
- Page Title: {context.get('pageTitle', 'Change Management')}
- Header: {context.get('headerTitle', 'Change Weekend')}
- Date: {context.get('date', 'Not specified')}
- Services Data: {json.dumps(context.get('services', []), indent=2)}
- Original Email Content: {context.get('originalEmail', 'No email content available')}

User Question: {question}

**Instructions:**
- If the question is about change management, services, or the page, use the context above to answer helpfully.
- If the question is general, casual, or unrelated (e.g., about dogs, weather, math, etc.), just answer the question in a friendly, conversational way and ignore the page context.
- Never include page/service summaries unless the question is clearly about them.
- If the user's question is too out of scope (e.g., illegal, offensive, or not in appropriate language), politely refrain from answering and let the user know you can't help with that.
- Use markdown formatting for your response (bold, italics, bullet points, etc. as appropriate).
- Be concise, warm, and engaging.
- If a user asks to send them the data that was used to generate the response, politely refuse and let the user know you can't do that.
"""
        
        # Use the existing AI processor to get response
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=context_prompt)]
            ),
        ]
        
        generate_config = types.GenerateContentConfig(
            temperature=0.3,
            top_p=0.95,
            top_k=64,
            max_output_tokens=1024,
        )
        
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=generate_config
        )
        
        ai_response = response.text.strip()
        
        # Track the AI request for performance metrics
        track_ai_request(0.5, True)  # Approximate response time
        
        return jsonify({
            'status': 'success',
            'response': ai_response
        })
        
    except Exception as e:
        logger.error(f"Error processing AI question: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error processing your question: {str(e)}'
        }), 500

@api_bp.route('/ai-chat-enabled', methods=['GET'])
def ai_chat_enabled():
    enabled = os.environ.get('AI_CHAT_ENABLED', 'true').lower() == 'true'
    return jsonify({'enabled': enabled})
