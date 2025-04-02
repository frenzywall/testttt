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
import uuid

app = Flask(__name__, static_url_path='/static', static_folder='static')app.secret_key = os.environ.get('SECRET_KEY', 'dev_key_for_testing')  

temp_dir = os.getenv('TEMP_DIR', '/app/temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'redis'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=0,
    decode_responses=True
)

# Constants for Redis keys
CURRENT_DATA_KEY = 'change_management_data'
HISTORY_LIST_KEY = 'change_management_history'
MAX_HISTORY_SIZE = 20  # Maximum number of history items to store

def get_stored_data():
    """Get data from Redis"""
    try:
        data = redis_client.get(CURRENT_DATA_KEY)
        return json.loads(data) if data else None
    except:
        return None

def save_stored_data(data):
    """Save data to Redis"""
    try:
        # Ensure we have a unique ID for this dataset
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        
        # Add timestamp if not present
        if 'last_modified' not in data:
            data['last_modified'] = datetime.now().timestamp()
            
        redis_client.set(CURRENT_DATA_KEY, json.dumps(data))
        return True
    except Exception as e:
        print(f"Error saving data: {e}")
        return False

def add_to_history(data):
    """Add current data to history list"""
    try:
        # Ensure we have required fields
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
        
        if 'last_modified' not in data:
            data['last_modified'] = datetime.now().timestamp()
        
        # Create history entry with minimal data
        history_entry = {
            'id': data['id'],
            'timestamp': data['last_modified'],
            'date': data.get('date', ''),
            'header_title': data.get('header_title', 'Unnamed Upload'),
            'service_count': len(data.get('services', [])),
            'original_subject': data.get('original_subject', '')
        }
        
        # Add to history list
        redis_client.lpush(HISTORY_LIST_KEY, json.dumps(history_entry))
        
        # Store the full data with the ID as key
        redis_client.set(f"data:{data['id']}", json.dumps(data))
        
        # Trim history list to max size
        redis_client.ltrim(HISTORY_LIST_KEY, 0, MAX_HISTORY_SIZE - 1)
        
        return True
    except Exception as e:
        print(f"Error adding to history: {e}")
        return False

def get_history():
    """Get list of historical uploads"""
    try:
        history_list = redis_client.lrange(HISTORY_LIST_KEY, 0, -1)
        return [json.loads(item) for item in history_list]
    except Exception as e:
        print(f"Error getting history: {e}")
        return []

def get_history_item(item_id):
    """Get a specific historical upload by ID"""
    try:
        data = redis_client.get(f"data:{item_id}")
        return json.loads(data) if data else None
    except Exception as e:
        print(f"Error getting history item: {e}")
        return None

def delete_history_item(item_id):
    """Delete a specific historical upload by ID"""
    try:
        # Remove the data
        redis_client.delete(f"data:{item_id}")
        
        # Remove from the history list
        history_list = redis_client.lrange(HISTORY_LIST_KEY, 0, -1)
        for i, item in enumerate(history_list):
            entry = json.loads(item)
            if entry.get('id') == item_id:
                redis_client.lrem(HISTORY_LIST_KEY, 1, item)
                break
        
        return True
    except Exception as e:
        print(f"Error deleting history item: {e}")
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
                print(f"Error splitting time range: {e}")
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
            print(f"Error parsing single time: {e}")
            return sweden_time_str
            
    except Exception as e:
        print(f"Error converting time {sweden_time_str}: {e}")
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
        history = get_history()
        
        if stored_data:
            if 'last_modified' not in stored_data:
                stored_data['last_modified'] = datetime.now().timestamp()
                save_stored_data(stored_data)
            response = make_response(render_template(
                'result.html', 
                data=stored_data, 
                header_title=stored_data.get('header_title', 'Change Weekend'),
                data_timestamp=stored_data.get('last_modified', 0),
                history=history
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
            data_timestamp=empty_data['last_modified'],
            history=history
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

            services_data = email_parser.process_email_content(email_data)
            
            if 'error' in services_data:
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
            services_data['id'] = str(uuid.uuid4())
            services_data['last_modified'] = datetime.now().timestamp()
            services_data['original_subject'] = msg.subject
            
            # Save the data and add to history
            save_stored_data(services_data)
            add_to_history(services_data)
            
            # Get updated history
            history = get_history()
            
            return render_template(
                'result.html', 
                data=services_data, 
                header_title=header_title,
                history=history
            )

    except Exception as e:
        print(f"Error processing upload: {str(e)}")
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
            print(f"Warning: Could not remove temp file: {str(e)}")

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
    """Save the header title"""
    stored_data = get_stored_data()
    if stored_data:
        stored_data['header_title'] = request.json['title']
        save_stored_data(stored_data)
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

@app.route('/get-history', methods=['GET'])
def get_upload_history():
    history = get_history()
    return jsonify({
        'status': 'success',
        'history': history
    })

@app.route('/load-history/<item_id>', methods=['GET'])
def load_history(item_id):
    item_data = get_history_item(item_id)
    
    if not item_data:
        return jsonify({
            'status': 'error',
            'message': 'History item not found'
        })
    
    save_stored_data(item_data)
    
    return jsonify({
        'status': 'success',
        'data': item_data
    })

@app.route('/delete-history/<item_id>', methods=['POST'])
def delete_history(item_id):
    success = delete_history_item(item_id)
    
    if not success:
        return jsonify({
            'status': 'error',
            'message': 'Failed to delete history item'
        })
    
    return jsonify({
        'status': 'success'
    })

@app.route('/manage-history', methods=['GET'])
def manage_history():
    history = get_history()
    return jsonify({
        'status': 'success',
        'history': history
    })

@app.route('/reset-data', methods=['POST'])
def reset_data():
    """Reset the current data but keep history"""
    try:
        clear_history = request.json.get('clear_history', False)
        
        if clear_history:
            history = get_history()
            for item in history:
                delete_history_item(item['id'])
            redis_client.delete(HISTORY_LIST_KEY)
        
        redis_client.delete(CURRENT_DATA_KEY)
        
        response = jsonify({
            'status': 'success', 
            'timestamp': datetime.now().timestamp(),
            'history_cleared': clear_history
        })
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except Exception as e:
        print(f"Error resetting data: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
