"""
Change management routes
This file contains all change management-related routes from app.py
"""
from flask import Blueprint, request, jsonify, session, make_response, render_template
from datetime import datetime
import tempfile
import os
import time
import logging
import json
import threading

from ..config import temp_dir
from ..utils.redis_client import redis_client
from ..services.email_processor import FileProcessor
from ..routes.auth import is_reauth_valid, validate_user_exists
from ..services.ai_service import track_ai_request
from ..services.history_service import save_to_history
from ..utils.helpers import history_cache
from ..services.search_service import create_search_index

logger = logging.getLogger(__name__)

# Create blueprint
changes_bp = Blueprint('changes', __name__)

# --- Helper Functions ---
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

# --- Routes ---
@changes_bp.route('/', methods=['GET', 'POST'])
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
                data_timestamp=stored_data.get('last_modified', 0),
                last_edited_by=stored_data.get('last_edited_by', None)
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
            'last_modified': datetime.now().timestamp(),
            'last_edited_by': None
        }
        response = make_response(render_template(
            'result.html', 
            data=empty_data, 
            header_title='Change Weekend',
            data_timestamp=empty_data['last_modified'],
            last_edited_by=None
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
    if file.filename == '' or not FileProcessor.can_process_file(file.filename):
        supported_formats = ', '.join(FileProcessor.get_supported_extensions())
        return render_template('result.html', data={
            'services': [],
            'error': f'Invalid file or no file selected. Supported formats: {supported_formats}',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': ''
        }, header_title='Change Weekend')

    temp_path = None
    try:
        # Get file extension for proper temp file naming
        file_ext = os.path.splitext(file.filename.lower())[1]
        with tempfile.NamedTemporaryFile(dir=temp_dir, suffix=file_ext, delete=False) as temp_file:
            temp_path = temp_file.name
            file.save(temp_path)
            
            if not os.path.exists(temp_path):
                raise FileNotFoundError(f"Failed to save temporary file at {temp_path}")
            
            # Use the new FileProcessor to handle multiple formats
            email_data = FileProcessor.process_file(temp_path, file.filename)

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

@changes_bp.route('/sync-all-data', methods=['POST'])
def sync_all_data():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
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

    # Store the username of the last editor (prefer request, fallback to session)
    username = data.get('username') or session.get('username', 'Unknown')
    stored_data['last_edited_by'] = username
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

@changes_bp.route('/save-changes', methods=['POST'])
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
            service['start_date'] = data.get('start_date', stored_data['date'])
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
            'start_date': data.get('start_date', stored_data['date']),
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

@changes_bp.route('/delete-row', methods=['POST'])
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

@changes_bp.route('/save-parsed-data', methods=['POST'])
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

@changes_bp.route('/reset-data', methods=['POST'])
def reset_data():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
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

@changes_bp.route('/sync-to-history', methods=['POST'])
def sync_to_history():
    if not is_reauth_valid():
        return jsonify({'status': 'error', 'message': 'Re-authentication required'}), 401
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

    # Store the username of the last editor (prefer request, fallback to session)
    username = data.get('username') or session.get('username', 'Unknown')
    stored_data['last_edited_by'] = username
    stored_data['last_modified'] = datetime.now().timestamp()
    save_stored_data(stored_data)
    
    save_to_history(stored_data)
    
    # Invalidate server-side cache when new data is saved to history
    history_cache.cache.clear()
    history_cache.etags.clear()
    
    # No need to update pagination index - using Redis sorted sets now
    
    # Rebuild search index for new data (async)
    threading.Thread(target=create_search_index, daemon=True).start()
    
    response = jsonify({
        'status': 'success', 
        'timestamp': stored_data['last_modified']
    })
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@changes_bp.route('/check-updates', methods=['GET'])
def check_updates():
    """Check if data has been updated since provided timestamp"""
    username = session.get('username')
    if not username:
        return jsonify({'status': 'error', 'message': 'Not logged in'}), 401
    
    # Check if user still exists in database
    if not validate_user_exists(username):
        session.clear()
        return jsonify({'status': 'error', 'message': 'User not found'}), 401
    
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
    