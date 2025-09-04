
import os
import json
from datetime import datetime
import re
from google import genai
from google.genai import types
import time
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('email_processor')

# Configure Gemini API
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-pro")

# Remove hardcoded services - let AI extract services dynamically from content
SERVICES = {}
SERVICE_NAMES = []

def check_gemini_connection():
    """Check if Gemini API is accessible and configured"""
    if not GEMINI_API_KEY:
        return {'connected': False, 'error': 'GEMINI_API_KEY environment variable not set'}
    
    try:
        # Use the REST API to test connection instead of client.list_models()
        import requests
        
        url = "https://generativelanguage.googleapis.com/v1beta/models"
        headers = {
            'X-goog-api-key': GEMINI_API_KEY
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            return {'connected': True, 'error': None}
        elif response.status_code == 401:
            return {'connected': False, 'error': 'Invalid API key'}
        elif response.status_code == 403:
            return {'connected': False, 'error': 'API key does not have required permissions'}
        else:
            return {'connected': False, 'error': f'API returned status code: {response.status_code}'}
            
    except requests.exceptions.Timeout:
        return {'connected': False, 'error': 'Connection timeout - API is unreachable'}
    except requests.exceptions.RequestException as e:
        return {'connected': False, 'error': f'Network error: {str(e)}'}
    except Exception as e:
        return {'connected': False, 'error': f'Unexpected error: {str(e)}'}

def check_model_availability(model_name):
    """Check if the specified model is available"""
    if not GEMINI_API_KEY:
        return False
    
    try:
        import requests
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}"
        headers = {
            'X-goog-api-key': GEMINI_API_KEY
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        return response.status_code == 200
        
    except Exception:
        return False


def generate_services_info_for_prompt():
    """Generate detailed service information for the prompt"""
    # No hardcoded services - AI will extract services dynamically
    return "No predefined services - extract all services mentioned in the content."

def process_email_content(email_data):
    """
    Process email content using Gemini API and return structured data
    
    Args:
        email_data: Dictionary containing email data with keys:
                    - subject: Email subject
                    - body: Email body
                    - sender: Email sender (optional)
                    - date: Email date (optional)
                    
    Returns:
        Dictionary with parsed change management information
    """
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY environment variable not set")
        return generate_error_response("GEMINI_API_KEY environment variable not set", email_data)
    
    # Initialize Gemini client
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    subject = email_data.get('subject', '')
    body = email_data.get('body', '')
    
    # Generate services information for the prompt
    services_info = generate_services_info_for_prompt()
    
    # Build the refined universal content parser prompt
    prompt = f"""### ROLE ###
You are a meticulous and precise data extraction bot. Your sole purpose is to extract structured information from the provided content and return it in a specific JSON format. You adhere strictly to the schema and examples provided. You do not add conversational text.

### JSON SCHEMA ###
Return ONLY a single, valid JSON object with this EXACT structure. Do not wrap it in markdown.
{{
  "date": "YYYY-MM-DD", // The date the content was created or is relevant to.
  "services": [
    {{
      "name": "ITEM_NAME",
      "start_date": "YYYY-MM-DD", 
      "start_time": "HH:MM",
      "end_time": "HH:MM", 
      "end_date": "YYYY-MM-DD",
      "comments": "Description of the item/activity",
      "priority": "low/medium/high"
    }}
  ]
}}

### INSTRUCTIONS ###
1. Extract the most important items, tasks, or events from the CONTENT.
2. Adhere strictly to the `YYYY-MM-DD` format for all dates.
3. Adhere strictly to the 24-hour `HH:MM` format for all times.
4. If a date or time is not explicitly mentioned for an item, you MUST use a hyphen "-" as the value for that field.
5. Use "-" for missing dates. Set start_date and end_date only from explicit content - never assume dates for an item, be true to the item data.
5. Base all date calculations on the current date provided in the SUBJECT field.

### EXAMPLES ###
---
INPUT SUBJECT: Daily Briefing for 2024-12-18
INPUT CONTENT: Project planning session from Dec 20-24. Also, remember the Christmas Break on Dec 25.
OUTPUT JSON:
{{
  "date": "2024-12-18",
  "services": [
    {{
      "name": "Project planning session",
      "start_date": "2024-12-20",
      "end_date": "2024-12-24",
      "start_time": "-",
      "end_time": "-",
      "comments": "Multi-day planning session",
      "priority": "medium"
    }},
    {{
      "name": "Christmas Break",
      "start_date": "2024-12-25",
      "end_date": "2024-12-25",
      "start_time": "-",
      "end_time": "-",
      "comments": "Holiday break",
      "priority": "low"
    }}
  ]
}}
---
INPUT SUBJECT: Team Sync for 2024-12-27
INPUT CONTENT: The Q4 review is scheduled for Dec 30 from 2 PM to 4 PM. Following that, the New Year deployment window is from Dec 31 to Jan 2. We also need to review the documentation.
OUTPUT JSON:
{{
  "date": "2024-12-27",
  "services": [
    {{
      "name": "Q4 review",
      "start_date": "2024-12-30",
      "end_date": "2024-12-30",
      "start_time": "14:00",
      "end_time": "16:00",
      "comments": "Quarterly review meeting",
      "priority": "high"
    }},
    {{
      "name": "New Year deployment window",
      "start_date": "2024-12-31",
      "end_date": "2025-01-02",
      "start_time": "-",
      "end_time": "-",
      "comments": "Deployment window spanning New Year",
      "priority": "high"
    }},
    {{
      "name": "Review documentation",
      "start_date": "-",
      "end_date": "-",
      "start_time": "-",
      "end_time": "-",
      "comments": "Documentation review task",
      "priority": "medium"
    }}
  ]
}}
---

### TASK ###
INPUT SUBJECT: {subject}
INPUT CONTENT: {body}
OUTPUT JSON:
"""
    
    # Create content for the request
    contents = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)]
        ),
    ]
    
    # Configure the generation parameters
    generate_config = types.GenerateContentConfig(
        temperature=0.1,
        top_p=0.95,
        top_k=64,
        max_output_tokens=8192,
        response_mime_type="application/json"
    )
    
    # Send request to the model with retry logic
    max_retries = 3
    retry_count = 0
    retry_delay = 5  # Start with 5 seconds delay
    
    while retry_count < max_retries:
        try:
            logger.info(f"Sending request to Gemini API (attempt {retry_count + 1})")
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=generate_config
            )
            logger.info("Successfully received response from Gemini API")
            
            # Extract the result text
            result = response.text
            
            # Find JSON content in the response
            json_start = result.find('{')
            json_end = result.rfind('}') + 1
            
            if json_start >= 0 and json_end > json_start:
                json_content = result[json_start:json_end]
                try:
                    parsed_data = json.loads(json_content)
                    
                    # Ensure all required fields are present
                    if 'date' not in parsed_data:
                        parsed_data['date'] = datetime.now().strftime("%Y-%m-%d")
                    
                    if 'services' not in parsed_data:
                        parsed_data['services'] = []
                    
                    # Validate and clean up service data with strict format enforcement
                    for service in parsed_data['services']:
                        # Ensure all required fields exist, but don't force dates if AI returned "-"
                        if 'start_date' not in service:
                            service['start_date'] = "-"
                        if 'end_date' not in service:
                            service['end_date'] = "-"
                        if 'start_time' not in service or not service['start_time']:
                            service['start_time'] = "-"
                        if 'end_time' not in service or not service['end_time']:
                            service['end_time'] = "-"
                        if 'comments' not in service or not service['comments']:
                            service['comments'] = "Activity or task from content"
                        if 'priority' not in service or not service['priority']:
                            service['priority'] = "medium"
                        
                        # Enforce strict format rules
                        if service['priority'] not in ['low', 'medium', 'high']:
                            service['priority'] = "medium"
                        
                        # Validate time format (HH:MM or "-")
                        if service['start_time'] != "-" and not re.match(r'^\d{2}:\d{2}$', service['start_time']):
                            service['start_time'] = "-"
                        if service['end_time'] != "-" and not re.match(r'^\d{2}:\d{2}$', service['end_time']):
                            service['end_time'] = "-"
                        
                        # Only validate that dates are in correct format if they're not "-"
                        if service['start_date'] != "-" and not re.match(r'^\d{4}-\d{2}-\d{2}$', service['start_date']):
                            # If AI returned invalid format, set to "-" instead of guessing
                            service['start_date'] = "-"
                        
                        if service['end_date'] != "-" and not re.match(r'^\d{4}-\d{2}-\d{2}$', service['end_date']):
                            # If AI returned invalid format, set to "-" instead of guessing
                            service['end_date'] = "-"
                    
                    # Add the original email content
                    parsed_data['original_subject'] = email_data.get('subject', '')
                    parsed_data['original_body'] = email_data.get('body', '')
                    
                    # Sort services by name to ensure consistent output
                    parsed_data['services'] = sorted(parsed_data['services'], key=lambda x: x['name'])
                    
                    return parsed_data
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse AI response as JSON: {str(e)}")
                    return process_email_fallback(email_data, result)
            else:
                logger.warning("Could not find valid JSON in the response")
                return process_email_fallback(email_data, result)
                
        except Exception as e:
            retry_count += 1
            logger.warning(f"Error processing content with Gemini (attempt {retry_count}): {str(e)}")
            
            if "429 Too Many Requests" in str(e):
                if retry_count < max_retries:
                    logger.info(f"Rate limit hit. Waiting {retry_delay} seconds before retry...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    return generate_error_response("Gemini API rate limit exceeded after multiple retries", email_data)
            else:
                return generate_error_response(f"Error processing content with Gemini: {str(e)}", email_data)
    
    # If we exit the retry loop without returning, it means all retries failed
    return generate_error_response("All retries failed when communicating with Gemini API", email_data)

def process_email_fallback(email_data, ai_response):
    """Fallback method for extracting data when JSON parsing fails"""
    logger.info("Using fallback extraction method")
    try:
        # Create a basic structure with empty services
        result = {
            'date': datetime.now().strftime("%Y-%m-%d"),
            'services': [],
            'original_subject': email_data.get('subject', ''),
            'original_body': email_data.get('body', '')
        }
        
        # Try to extract date information
        date_match = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', ai_response)
        if date_match:
            result['date'] = date_match.group(1)
        
        # Check email content for date information if not found in AI response
        if not date_match:
            date_match = re.search(r'\b(\d{4}-\d{2}-\d{2})\b', email_data.get('body', ''))
            if date_match:
                result['date'] = date_match.group(1)
            
        # Ultra-simple fallback - just create one generic entry
        result['services'] = [{
            'name': 'Content Items',
            'start_date': "-",
            'start_time': "-",
            'end_time': "-",
            'end_date': "-",
            'comments': "Content processed - please review and edit as needed",
            'priority': "medium"
        }]
            
        return result
        
    except Exception as e:
        logger.error(f"Fallback processing failed: {str(e)}")
        return generate_error_response(f"Fallback processing failed: {str(e)}", email_data)

def generate_error_response(error_message, email_data):
    """Generate a standardized error response"""
    logger.error(error_message)
    return {
        'services': [],
        'date': datetime.now().strftime("%Y-%m-%d"),
        'error': error_message,
        'original_subject': email_data.get('subject', ''),
        'original_body': email_data.get('body', '')
    }

def email_parser(email_content):
    """
    Main email parser function to process an email and return structured change management data
    
    Args:
        email_content: Dictionary containing email data with keys:
                    - subject: Email subject
                    - body: Email body
                    
    Returns:
        Dictionary with parsed change management information
    """
    # Check connection first
    connection_status = check_gemini_connection()
    if not connection_status['connected']:
        return generate_error_response(f"Cannot connect to Gemini API: {connection_status['error']}", email_content)
    
    # Process the email content
    return process_email_content(email_content)

