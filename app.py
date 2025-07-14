from flask import Flask, render_template, request, jsonify, session, make_response
from datetime import datetime
from dateutil import parser
import pytz
import extract_msg
import requests
import os
import re
import tempfile
import redis
import json
import hmac
import hashlib
import secrets
from functools import wraps
import time
import logging
from google import genai
from google.genai import types

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='/static')

app.secret_key = os.environ.get('SECRET_KEY')
if not app.secret_key:
    app.secret_key = secrets.token_hex(16)
    logger.warning("Using randomly generated secret key. Set SECRET_KEY environment variable for production.")

PASSKEY = os.environ.get('PASSKEY')
if not PASSKEY:
    logger.warning("No passkey set! Authentication will be disabled until PASSKEY is properly configured.")
    PASSKEY = secrets.token_hex(32)  

PASSKEY_HASH = hashlib.sha256(PASSKEY.encode()).hexdigest()

HISTORY_LIMIT = 1000 

temp_dir = os.getenv('TEMP_DIR', '/app/temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
logger.info(f"Using static directory: {static_dir}")
logger.info(f"Static directory exists: {os.path.exists(static_dir)}")
if os.path.exists(static_dir):
    logger.info(f"Static directory contents: {os.listdir(static_dir)}")
else:
    logger.warning("Static directory does not exist")

try:
    redis_client = redis.Redis(
        host=os.getenv('REDIS_HOST', 'redis'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=0,
        decode_responses=True,
        socket_timeout=5,  
        socket_connect_timeout=5,
        health_check_interval=30
    )
    redis_client.ping()
    logger.info("Successfully connected to Redis")
except redis.RedisError as e:
    logger.error(f"Redis connection error: {str(e)}")
    class MockRedis:
        def __init__(self):
            self.data = {}
        
        def get(self, key):
            return self.data.get(key)
        
        def set(self, key, value):
            self.data[key] = value
            return True
        
        def delete(self, key):
            if key in self.data:
                del self.data[key]
                return 1
            return 0
    
    redis_client = MockRedis()
    logger.warning("Using in-memory mock Redis. Data will not persist between restarts.")

RATE_LIMIT = int(os.getenv('RATE_LIMIT', 5))  
RATE_WINDOW = int(os.getenv('RATE_WINDOW', 60))  
ip_attempts = {}

def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        ip = request.remote_addr
        current_time = time.time()
        
        for ip_addr in list(ip_attempts.keys()):
            if current_time - ip_attempts[ip_addr]['timestamp'] > RATE_WINDOW:
                del ip_attempts[ip_addr]
        
        if ip in ip_attempts:
            if ip_attempts[ip]['count'] >= RATE_LIMIT:
                logger.warning(f"Rate limit exceeded for IP: {ip}")
                return jsonify({
                    'status': 'error',
                    'message': 'Too many attempts. Please try again later.'
                }), 429
            ip_attempts[ip]['count'] += 1
        else:
            ip_attempts[ip] = {'count': 1, 'timestamp': current_time}
        
        return f(*args, **kwargs)
    return decorated_function


def get_stored_data():
    """Get data from Redis with proper error handling"""
    try:
        data = redis_client.get('change_management_data')
        return json.loads(data) if data else None
    except Exception as e:
        logger.error(f"Error retrieving data from Redis: {str(e)}")
        return None

def save_stored_data(data):
    """Save data to Redis with proper error handling"""
    try:
        redis_client.set('change_management_data', json.dumps(data))
        return True
    except Exception as e:
        logger.error(f"Error saving data to Redis: {str(e)}")
        return False

def get_stored_history():
    """Get sync history from Redis"""
    try:
        history = redis_client.get('change_management_history')
        return json.loads(history) if history else []
    except Exception as e:
        logger.error(f"Error retrieving history from Redis: {str(e)}")
        return []

def save_to_history(data):
    """Save current data to history"""
    try:
        history = get_stored_history()      
        current_timestamp = datetime.now().timestamp()       
        duplicate_found = False
        if history:
            latest_entry = history[0]
            if (current_timestamp - latest_entry.get('timestamp', 0) < 60 and
                latest_entry.get('title') == data.get('header_title', 'Change Weekend') and
                len(latest_entry.get('data', {}).get('services', [])) == len(data.get('services', []))):
                latest_entry['data'] = data
                latest_entry['timestamp'] = current_timestamp
                latest_entry['date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                duplicate_found = True
        
        if not duplicate_found:
            history_entry = {
                'timestamp': current_timestamp,
                'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'title': data.get('header_title', 'Change Weekend'),
                'data': data
            }
            
            history.insert(0, history_entry)
        
        # Limit the history size. Change the HISTORY_LIMIT variable above to adjust the limit.
        history = history[:HISTORY_LIMIT]

        redis_client.set('change_management_history', json.dumps(history))
        return True
    except Exception as e:
        logger.error(f"Error saving to history: {str(e)}")
        return False

def convert_sweden_to_ist(sweden_time_str, date_str):
    """Convert Sweden TZ time into IST."""
    sweden_tz = pytz.timezone('Europe/Stockholm')
    ist_tz = pytz.timezone('Asia/Kolkata')
    try:
        
        sweden_time_str = re.sub(r'\s*(CET|CEST)\s*', '', sweden_time_str).strip()
        
        if '-' in sweden_time_str:
            parts = sweden_time_str.split('-')
            try:
                start = parts[0].strip()
                end = parts[1].strip()
                
               
                if len(start.split()) == 1:  
                    start = f"{date_str} {start}"
                if len(end.split()) == 1: 
                    end = f"{date_str} {end}"
                
               
                start_ist = convert_sweden_to_ist(start, date_str)
                end_ist = convert_sweden_to_ist(end, date_str)
                return f"{start_ist}-{end_ist}"
            except Exception as e:
                logger.warning(f"Error splitting time range: {e}")
                return sweden_time_str
        
        try:
            
            if len(sweden_time_str.split()) == 1: 
                sweden_time_str = f"{date_str} {sweden_time_str}"
            
            
            dt = parser.parse(sweden_time_str)
            
           
            if dt.tzinfo is None:
                dt = sweden_tz.localize(dt)
            
            
            ist_time = dt.astimezone(ist_tz)
            return ist_time.strftime("%I:%M %p")  
            
        except Exception as e:
            logger.warning(f"Error parsing single time: {e}")
            return sweden_time_str
            
    except Exception as e:
        logger.warning(f"Error converting time {sweden_time_str}: {e}")
        return sweden_time_str

def extract_date_from_subject(subject):
    date_patterns = [
        r'\d{2}-\d{2}-\d{4}',
        r'\d{2}/\d{2}/\d{4}',
        r'\d{4}-\d{2}-\d{2}'
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, subject)
        if match:
            date_str = match.group(0)
        
            try:
                parsed_date = parser.parse(date_str)
                return parsed_date.strftime('%Y-%m-%d')
            except:
                return date_str
    return None

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

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'GET':
        stored_data = get_stored_data()
        if stored_data:
            if 'last_modified' not in stored_data:
                stored_data['last_modified'] = datetime.now().timestamp()
                save_stored_data(stored_data)
            response = make_response(render_template(
                'result.html', 
                data=stored_data, 
                header_title=stored_data.get('header_title', 'Change Weekend'),
                data_timestamp=stored_data.get('last_modified', 0)
            ))
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
            return response
        

        empty_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'error': None,
            'is_landing_page': True,
            'header_title': 'Change Weekend',
            'last_modified': datetime.now().timestamp()
        }
        response = make_response(render_template(
            'result.html', 
            data=empty_data, 
            header_title='Change Weekend',
            data_timestamp=empty_data['last_modified']
        ))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    
    if 'file' not in request.files:
        return render_template('result.html', data={
            'services': [],
            'error': 'No file uploaded',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    file = request.files['file']
    if file.filename == '' or not file.filename.endswith('.msg'):
        return render_template('result.html', data={
            'services': [],
            'error': 'Invalid file or no file selected',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=temp_dir, suffix='.msg', delete=False) as temp_file:
            temp_path = temp_file.name
            file.save(temp_path)
            
            if not os.path.exists(temp_path):
                raise FileNotFoundError(f"Failed to save temporary file at {temp_path}")
            
            msg = extract_msg.Message(temp_path)
            maintenance_date = extract_date_from_subject(msg.subject)
            if not maintenance_date:
                msg_date = parser.parse(msg.date)
                maintenance_date = msg_date.strftime("%Y-%m-%d")

            email_data = {
                'subject': msg.subject,
                'sender': msg.sender,
                'date': maintenance_date,
                'body': msg.body
            }

            # Use only AI processing with performance tracking
            import ai_processor
            start_time = time.time()
            services_data = ai_processor.process_email_content(email_data)
            end_time = time.time()
            response_time = end_time - start_time
            
            # Track the request
            success = 'error' not in services_data or not services_data['error']
            track_ai_request(response_time, success)
            
            logger.info("Using AI processing for email content")
            
            if 'error' in services_data and services_data['error']:
                return render_template('result.html', data={
                    'services': [],
                    'error': services_data['error'],
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'end_date': datetime.now().strftime('%Y-%m-%d'),
                    'original_subject': '',
                    'original_body': ''
                }, header_title='Change Weekend')

            try:
                date_obj = datetime.strptime(services_data['date'], "%Y-%m-%d")
                from calendar import month_name
                header_title = f"{month_name[date_obj.month]} ChangeWeekend"
            except:
                header_title = "Change Weekend"
            services_data['header_title'] = header_title
            services_data['processing_method'] = 'AI'
            
            return render_template('result.html', data=services_data, header_title=header_title)

    except Exception as e:
        logger.error(f"Error processing upload: {str(e)}")
        return render_template('result.html', data={
            'services': [],
            'error': f'Error processing email: {str(e)}',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    finally:
        try:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)
        except Exception as e:
            logger.warning(f"Could not remove temp file: {str(e)}")

@app.route('/sync-all-data', methods=['POST'])
def sync_all_data():
    """Save all data at once to Redis"""
    data = request.json
    
    if not data or 'services' not in data:
        return jsonify({'status': 'error', 'message': 'Invalid data structure'})
    stored_data = get_stored_data() or {}
    for key in data:
        stored_data[key] = data[key]
    
    if 'services' not in stored_data:
        stored_data['services'] = []
    if 'date' not in stored_data:
        stored_data['date'] = datetime.now().strftime('%Y-%m-%d')
    if 'end_date' not in stored_data:
        stored_data['end_date'] = stored_data['date']
    if 'header_title' not in stored_data:
        stored_data['header_title'] = 'Change Weekend'
    
    stored_data['last_modified'] = datetime.now().timestamp()
    save_stored_data(stored_data)
    response = jsonify({
        'status': 'success', 
        'timestamp': stored_data['last_modified']
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/sync-to-history', methods=['POST'])
def sync_to_history():
    """Save all data to Redis and also save to history"""
    data = request.json
    
    if not data or 'services' not in data:
        return jsonify({'status': 'error', 'message': 'Invalid data structure'})
    
    stored_data = get_stored_data() or {}
    for key in data:
        stored_data[key] = data[key]
    
    if 'services' not in stored_data:
        stored_data['services'] = []
    if 'date' not in stored_data:
        stored_data['date'] = datetime.now().strftime('%Y-%m-%d')
    if 'end_date' not in stored_data:
        stored_data['end_date'] = stored_data['date']
    if 'header_title' not in stored_data:
        stored_data['header_title'] = 'Change Weekend'
    
    stored_data['last_modified'] = datetime.now().timestamp()
    save_stored_data(stored_data)
    
    save_to_history(stored_data)
    
    response = jsonify({
        'status': 'success', 
        'timestamp': stored_data['last_modified']
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/check-updates', methods=['GET'])
def check_updates():
    """Check if data has been updated since provided timestamp"""
    client_timestamp = request.args.get('since', 0, type=float)
    
    stored_data = get_stored_data() or {}
    server_timestamp = stored_data.get('last_modified', 0)
    
    response = jsonify({
        'updated': server_timestamp > client_timestamp,
        'timestamp': server_timestamp
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/get-history', methods=['GET'])
def get_history():
    """Get the sync history"""
    history = get_stored_history()
    response = jsonify(history)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/load-from-history/<timestamp>', methods=['GET'])
def load_from_history(timestamp):
    """Load data from a specific history point"""
    history = get_stored_history()
    
    selected_entry = None
    for entry in history:
        if str(entry.get('timestamp')) == timestamp:
            selected_entry = entry
            break
    
    if not selected_entry:
        return jsonify({'status': 'error', 'message': 'History entry not found'})
    
    # Set a temporary session key to store the data (without saving to Redis)
    session['temp_history_data'] = selected_entry['data']
    
    # Return success without modifying the main Redis data
    response = jsonify({'status': 'success', 'data': selected_entry['data']})
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/delete-from-history/<timestamp>', methods=['DELETE'])
def delete_from_history(timestamp):
    """Delete a specific history entry by timestamp"""
    history = get_stored_history()
    
    updated_history = [entry for entry in history if str(entry.get('timestamp')) != timestamp]
    
    if len(updated_history) == len(history):
        return jsonify({'status': 'error', 'message': 'History entry not found'})
    
    redis_client.set('change_management_history', json.dumps(updated_history))
    
    return jsonify({'status': 'success'})

@app.route('/save-changes', methods=['POST'])
def save_changes():
    """Save changes to a specific row"""
    stored_data = get_stored_data()
    if not stored_data:
        stored_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend'
        }
    
    data = request.json
    
    found = False
    for service in stored_data['services']:
        if service['name'] == data['service'] or (not service['name'] and not data['service']):
            service['name'] = data['service']
            service['start_time'] = data['startTime']
            service['end_time'] = data['endTime']
            service['comments'] = data.get('comments', '')
            service['priority'] = data.get('impactPriority', 'low')
            service['end_date'] = data.get('endDate', stored_data['date'])
            found = True
            break
    
    if not found:
        stored_data['services'].append({
            'name': data['service'],
            'start_time': data['startTime'],
            'end_time': data['endTime'],
            'end_date': data.get('endDate', stored_data['date']),
            'comments': data.get('comments', ''),
            'priority': data.get('impactPriority', 'low')
        })
    
    stored_data['services'] = [s for s in stored_data['services'] if s['name'].strip()]
    
    if 'date' in data and data['date']:
        stored_data['date'] = data['date']
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/delete-row', methods=['POST'])
def delete_row():
    """Delete a row from the stored data"""
    stored_data = get_stored_data()
    if not stored_data:
        return jsonify({'status': 'error', 'message': 'No data to delete'})
    
    data = request.json
    
    stored_data['services'] = [
        service for service in stored_data['services']
        if service['name'] != data['service']
    ]
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/save-title', methods=['POST'])
def save_title():
    """Save the header title without automatic Redis sync"""
    stored_data = get_stored_data() or {}
    stored_data['header_title'] = request.json['title']
    return jsonify({'status': 'success'})

@app.route('/save-parsed-data', methods=['POST'])
def save_parsed_data():
    """Save the entire dataset from parsed data editing"""
    stored_data = get_stored_data()
    if not stored_data:
        stored_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend'
        }
    
    data = request.json
    
    stored_data['services'] = data['services']
    
    if 'date' in data:
        stored_data['date'] = data['date']
    
    save_stored_data(stored_data)
    return jsonify({'status': 'success'})

@app.route('/reset-data', methods=['POST'])
def reset_data():
    """Reset all stored data"""
    try:
        empty_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'header_title': 'Change Weekend',
            'last_modified': datetime.now().timestamp()
        }
        redis_client.set('change_management_data', json.dumps(empty_data))
        response = jsonify({'status': 'success', 'timestamp': empty_data['last_modified']})
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        logger.error(f"Error resetting data: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/validate-passkey', methods=['POST'])
@rate_limit
def validate_passkey():
    """Validate the provided passkey against the stored hash"""
    data = request.json
    
    if not data or not isinstance(data, dict):
        return jsonify({'status': 'error', 'message': 'Invalid request format'}), 400
    
    provided_passkey = data.get('passkey', '')
    
    if not provided_passkey or not isinstance(provided_passkey, str):
        return jsonify({'status': 'error', 'message': 'Passkey is required'}), 400
    
    provided_hash = hashlib.sha256(provided_passkey.encode()).hexdigest()
    if hmac.compare_digest(provided_hash, PASSKEY_HASH):
        logger.info(f"Successful authentication from {request.remote_addr}")
        return jsonify({'status': 'success', 'valid': True})
    else:
        logger.warning(f"Failed authentication attempt from {request.remote_addr}")
        return jsonify({'status': 'error', 'valid': False, 'message': 'Invalid passkey'}), 401

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    try:
        redis_client.ping()
        return jsonify({
            'status': 'healthy',
            'redis': 'connected'
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'redis': 'disconnected',
            'error': str(e)
        }), 500

@app.route('/ai-status', methods=['GET'])
def ai_status():
    """Get AI processing status information"""
    try:
        import ai_processor
        
        # Check if API key is configured
        api_key_configured = bool(os.environ.get("GEMINI_API_KEY"))
        
        if not api_key_configured:
            return jsonify({
                'model': os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash'),
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
        model_name = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')
        
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

@app.route('/clear-ai-stats', methods=['POST'])
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

@app.route('/ask-ai', methods=['POST'])
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
        if not os.environ.get("GEMINI_API_KEY"):
            return jsonify({
                'status': 'error',
                'message': 'AI service is not configured'
            }), 503
        
        # Import AI processor
        import ai_processor
        
        # Create context prompt
        context_prompt = f"""
You are a friendly and helpful AI assistant. You can help with change management data, general questions, and casual conversation. Here's the current page context:

Page Title: {context.get('pageTitle', 'Change Management')}
Header: {context.get('headerTitle', 'Change Weekend')}
Date: {context.get('date', 'Not specified')}

Services Data:
{json.dumps(context.get('services', []), indent=2)}

Original Email Content:
{context.get('originalEmail', 'No email content available')}

User Question: {question}

**How to respond:**
- If the question is about change management data, services, or the page content, provide detailed and helpful information
- If it's a general question (math, trivia, etc.), feel free to answer it in a friendly way
- If it's casual conversation, be warm and engaging
- Always be helpful and conversational, not overly formal

**Response guidelines:**
- Be friendly and approachable
- Use **bold** for important information and service names
- Use *italic* for emphasis
- Use bullet points (* item) for lists
- Use ### for section headers
- Keep responses well-structured and easy to read
- If you don't have specific information about something, just say so casually
"""
        
        # Use the existing AI processor to get response
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        
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
            model=os.environ.get('GEMINI_MODEL', 'gemini-1.5-pro'),
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



if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
