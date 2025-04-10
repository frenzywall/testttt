from flask import Flask, render_template, request, jsonify, session, make_response
from datetime import datetime
from dateutil import parser
import pytz
import extract_msg
import requests
import os
import email_parser
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
        
        history = history[:20]
        
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

    # Check if the user wants to use AI processing
    use_ai = request.form.get('use_ai') == 'true'

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

            # Use AI processing if requested, otherwise use regular parsing
            if use_ai:
                import ai_processor
                services_data = ai_processor.process_email_content(email_data)
                logger.info("Using AI processing for email content")
            else:
                services_data = email_parser.process_email_content(email_data)
                logger.info("Using standard processing for email content")
            
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
            services_data['processing_method'] = 'AI' if use_ai else 'Standard'
            
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

if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)