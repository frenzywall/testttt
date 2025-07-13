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

# Services to track in change management emails with detailed information
SERVICES = {
    "Jenkins": {
        "aliases": ["jenkins", "jenkins cicd", "cicd", "jenkins pipeline", "pipeline", "automation", "ci/cd"],
        "default_impact": "Pipeline cannot be triggered. Code push, merge cannot be done LSV, Designer, FNT, BM will have impact.",
        "impact_indicators": ["paused", "unavailable", "cannot", "stopped", "impact", "downtime"]
    },
    "Gerrit EPK": {
        "aliases": ["gerrit epk", "gitrms-gerrit", "gerrit-gamma", "gerrit-alpha/epk", "gerrit alpha", "gerrit", "gitrms", 
                    "gerrit production", "gerrit archive", "gerrit-archive"],
        "default_impact": "Code push, merge cannot be done LSV, Designer, FNT, BM will have impact.",
        "impact_indicators": ["unavailable", "upgrade", "maintenance", "glitch", "impact", "downtime"]
    },
    "Gerrit Gamma": {
        "aliases": ["gerrit epk", "gitrms-gerrit", "gerrit-gamma", "gerrit-alpha/epk", "gerrit alpha", "gerrit", "gitrms", 
                    "gerrit production", "gerrit archive", "gerrit-archive"],
        "default_impact": "Code push, merge cannot be done LSV, Designer, FNT, BM will have impact.",
        "impact_indicators": ["unavailable", "upgrade", "maintenance", "glitch", "impact", "downtime"]
    },
    "GitLab": {
        "aliases": ["gitlab", "gitlab production", "gitlab geo", "gitlab-geo"],
        "default_impact": "GitLab service will be unavailable during the maintenance window.",
        "impact_indicators": ["unavailable", "upgrade", "maintenance", "impact", "downtime"]
    },
    "MHWEB": {
        "aliases": ["mhweb", "mhweb functional release"],
        "default_impact": "MHWeb downtime. TR's cannot be modified or raised.",
        "impact_indicators": ["unavailable", "maintenance", "impact", "downtime"]
    },
    "Confluence": {
        "aliases": ["confluence", "eteamspace confluence", "eteamspace", "eteam space"],
        "default_impact": "Pages cannot be accessible.",
        "impact_indicators": ["unavailable", "maintenance", "impact", "downtime", "upgrade"]
    },
    "JIRA": {
        "aliases": ["jira", "eteamproject", "eteamproject jira", "eteam project"],
        "default_impact": "Tickets, TR's cannot be modified or raised.",
        "impact_indicators": ["unavailable", "maintenance", "impact", "downtime", "upgrade"]
    },
    "ARM SELI & SERO": {
        "aliases": ["arm seli", "sero", "arm seli & sero", "seli", "seli/sero", "caot", "cnbj", "arm xray",
                    "arm smtp", "arm db"],
        "default_impact": "Pipeline cannot be triggered. Code merge, build cannot be done LSV, Designer, FNT, SCM will have impact.",
        "impact_indicators": ["unavailable", "maintenance", "impact", "downtime", "upgrade", "cleaning"]
    },
    "Windows Build": {
        "aliases": ["windows build", "whsd", "mws", "lmws", "windows patching", "e2c windows"],
        "default_impact": "Reboot + windows patch for Windows build servers (LMWS) + Terminal servers (WHSD).",
        "impact_indicators": ["patching", "reboot", "upgrade", "maintenance", "impact"]
    }
}

# Get list of service names
SERVICE_NAMES = list(SERVICES.keys())

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
    services_info = ""
    for service_name, details in SERVICES.items():
        services_info += f"- {service_name}:\n"
        services_info += f"  - Default impact description: \"{details['default_impact']}\"\n"
    return services_info

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
    
    # Build the enhanced prompt
    prompt = f"""
You're an expert system that extracts and structures change management information from emails.

Analyze this change management email and extract details about planned systems maintenance.

EMAIL SUBJECT: {subject}

EMAIL BODY: {body}

SERVICE DETAILS (for your reference):
{services_info}

I need you to extract information about each service in the exact format specified below. Apply these rules:

1. For each service, determine if it's IMPACTED or NOT_IMPACTED:
   - Mark a service as IMPACTED if it's explicitly mentioned in the email as being affected, or if you can make a logical inference that it will be affected based on dependencies or context but the service should be explicitly mentioned in the email, if not ignore and mark as NOT_IMPACTED
   - If a service isn't mentioned and you have no reason to believe it's affected, mark it as NOT_IMPACTED.
   - 

2. For time formats:
   - Use exactly the format "HH:MM" (24-hour format) for start_time and end_time.
   - If times are not specified for an impacted service, use "-" (a single dash) for both start_time and end_time.
   - For non-impacted services, always use "-" for both start_time and end_time.

3. For comments - EXTREMELY IMPORTANT:
   - For IMPACTED services: DO NOT create your own summary. ALWAYS use EXACTLY the default impact description from the SERVICE DETAILS.
   - For NOT_IMPACTED services: ALWAYS use EXACTLY "No Impact." as the comment.
   - NEVER create your own summaries or modify the default impact descriptions!

4. For dates:
   - Use YYYY-MM-DD format.
   - If a specific service date isn't mentioned, use the base maintenance date.
   - For multi-day maintenance, set end_date accordingly.

5. Dependencies and Smart Inference:
   - If one service's maintenance clearly affects another (e.g., Jenkins affected by Gerrit maintenance),  mark both as IMPACTED,but both of this services must be explicitly mentioned in the email if not mark them as NOT_IMPACTED.
   - Use context clues to determine impact even when not explicitly stated.

Return the data as valid JSON with this exact structure:
{{
  "date": "YYYY-MM-DD",
  "services": [
    {{
      "name": "SERVICE_NAME",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "end_date": "YYYY-MM-DD", 
      "impact": "IMPACTED or NOT_IMPACTED",
      "comments": "EXACT default impact description or 'No Impact.'"
    }},
    ... repeat for all services listed in SERVICE DETAILS ...
  ]
}}

Your output MUST contain all services listed in SERVICE DETAILS, even if they aren't mentioned in the email.
Only output valid JSON that matches this structure exactly, with no additional text or explanations outside the JSON.
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
                    
                    # Make sure all services are included and properly formatted
                    existing_services = {svc['name']: svc for svc in parsed_data['services'] if 'name' in svc}
                    
                    for service_name in SERVICE_NAMES:
                        if service_name not in existing_services:
                            # Add missing service with default values
                            parsed_data['services'].append({
                                'name': service_name,
                                'date': parsed_data['date'],
                                'start_time': "-",
                                'end_time': "-",
                                'end_date': parsed_data['date'],
                                'impact': 'NOT_IMPACTED',
                                'comments': "No Impact."
                            })
                        else:
                            service = existing_services[service_name]
                            # Ensure all required fields exist for each service
                            if 'date' not in service:
                                service['date'] = parsed_data['date']
                            if 'end_date' not in service:
                                service['end_date'] = service['date']
                            if 'start_time' not in service or not service['start_time']:
                                service['start_time'] = "-"
                            if 'end_time' not in service or not service['end_time']:
                                service['end_time'] = "-"
                            if 'impact' not in service:
                                service['impact'] = 'NOT_IMPACTED'
                            if 'comments' not in service or not service['comments']:
                                service['comments'] = "No Impact." if service['impact'] == 'NOT_IMPACTED' else SERVICES[service_name]['default_impact']
                    
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
            
        # For each service, try to find sections mentioning it in the AI response and email content
        for service_name in SERVICE_NAMES:
            service_data = {
                'name': service_name,
                'date': result['date'],
                'start_time': "-",
                'end_time': "-",
                'end_date': result['date'],
                'impact': 'NOT_IMPACTED',
                'comments': "No Impact."
            }
            
            service_details = SERVICES[service_name]
            
            # Check if service or any of its aliases are mentioned in email body
            service_mentioned = False
            for alias in service_details['aliases']:
                if alias.lower() in email_data.get('body', '').lower():
                    service_mentioned = True
                    break
            
            if service_mentioned:
                # Service is mentioned, so it might be impacted
                service_data['impact'] = 'IMPACTED'
                service_data['comments'] = service_details['default_impact']
                
                # Try to extract time information
                # Look for time patterns near service mentions
                for alias in service_details['aliases']:
                    if alias.lower() in email_data.get('body', '').lower():
                        # Get context around the service mention
                        mention_index = email_data.get('body', '').lower().find(alias.lower())
                        context_start = max(0, mention_index - 100)
                        context_end = min(len(email_data.get('body', '')), mention_index + 200)
                        context = email_data.get('body', '')[context_start:context_end]
                        
                        # Look for time patterns
                        time_pattern = re.search(r'(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})', context)
                        if time_pattern:
                            service_data['start_time'] = time_pattern.group(1)
                            service_data['end_time'] = time_pattern.group(2)
                            break
                            
            result['services'].append(service_data)
            
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

