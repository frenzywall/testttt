from flask import Flask, render_template, request, jsonify
from datetime import datetime
from dateutil import parser
import pytz
import extract_msg
import requests
import os
import email_parser
import re
import tempfile

app = Flask(__name__)

temp_dir = os.getenv('TEMP_DIR', '/app/temp')
if not os.path.exists(temp_dir):
    os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

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
        # Show empty landing page
        empty_data = {
            'services': [],
            'date': datetime.now().strftime('%Y-%m-%d'),
            'end_date': datetime.now().strftime('%Y-%m-%d'),
            'original_subject': '',
            'original_body': '',
            'error': None,
            'is_landing_page': True  # Add this flag to indicate landing page
        }
        return render_template('result.html', data=empty_data, header_title='Change Weekend')
        
    # POST method handling
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

    # Process the file
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
            
            return render_template('result.html', data=services_data, header_title=header_title)

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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)