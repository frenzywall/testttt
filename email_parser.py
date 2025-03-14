import os
import requests
import pytz
from datetime import datetime, timedelta
from dateutil import parser
import re
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

def extract_date_from_subject(subject):
    """Extract date from email subject line."""
    date_patterns = [
        r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:and|to|&|-)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)',
        r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)',
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, subject)
        if match:
            groups = match.groups()
            if len(groups) == 3:  
                start_day, end_day, month = groups
                year = "2025" 
                try:
                    start_date = parser.parse(f"{start_day} {month} {year}")
                    return start_date.date()
                except:
                    pass
            elif len(groups) == 2:  
                day, month = groups
                year = "2025"  
                try:
                    date = parser.parse(f"{day} {month} {year}")
                    return date.date()
                except:
                    pass
    return None

def normalize_service_name(name, text_context=""):
    """Enhanced service name normalization with context awareness."""
    if not name:
        return None
        
    name_lower = name.lower().strip()
    
    for service, info in SERVICES.items():
        if name_lower == service.lower():
            return service
        if any(alias.lower() == name_lower for alias in info["aliases"]):
            return service

    for service, info in SERVICES.items():
        service_words = set(service.lower().split())
        name_words = set(name_lower.split())
        context_lower = text_context.lower()
        
        if (service_words & name_words or 
            any(alias.lower() in context_lower for alias in info["aliases"])):
            return service
            
    return None

def extract_datetime_window(text, base_date=None):
    """
    Enhanced datetime window extraction that maintains full date-time information.
    Returns tuple of (start_datetime, end_datetime)
    """
    patterns = [
        r'(?:Window:|Time:)?\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*[-~]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})',
        r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*[-~]\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})',
        r'(?:Window:|Time:)?\s*(\d{2}:\d{2})\s*[-~]\s*(\d{2}:\d{2})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            start_str, end_str = match.groups()
            
        
            if len(start_str) <= 5:  
                if not base_date:
                    continue
                try:
                    start_time = datetime.strptime(start_str, "%H:%M").time()
                    end_time = datetime.strptime(end_str, "%H:%M").time()
                    
                    start_dt = datetime.combine(base_date, start_time)
                    end_dt = datetime.combine(base_date, end_time)
                    
                   
                    if end_dt < start_dt:
                        end_dt += timedelta(days=1)
                        
                    return start_dt, end_dt
                except ValueError:
                    continue
            else:
          
                try:
                    start_dt = parser.parse(start_str)
                    end_dt = parser.parse(end_str)
                    return start_dt, end_dt
                except ValueError:
                    continue
    
    return None, None

def detect_impact(text, service_info):
    """Enhanced impact detection using service-specific indicators."""
    text_lower = text.lower()
   
    no_impact_patterns = [
        r"no\s+impact",
        r"no\s+expected\s+impact",
        r"transparent\s+to\s+users",
        r"impact:\s*none",
        r"impact\s*:\s*no"
    ]
    
    for pattern in no_impact_patterns:
        if re.search(pattern, text_lower):
            return "NOT_IMPACTED"
    
 
    impact_indicators = service_info.get("impact_indicators", [])
    for indicator in impact_indicators:
        if indicator in text_lower:
            return "IMPACTED"
    
 
    general_impact_indicators = [
        "unavailable", "maintenance", "upgrade", "impact",
        "downtime", "pause", "stopped", "shut down", "shutdown",
        "offline", "reboot", "restart", "migration"
    ]
    
    if any(indicator in text_lower for indicator in general_impact_indicators):
        return "IMPACTED"
    
    return "NOT_IMPACTED"

def parse_email_content(email_data):
    """Enhanced email content parser with improved datetime handling."""
    try:
        services_data = []
        seen_services = set()
        body = email_data.get('body', '')
        subject = email_data.get('subject', '')
        
        base_date = extract_date_from_subject(subject)
        if not base_date:
            base_date = datetime.now().date()
        
        full_window_match = re.search(r"Full change window:\s*(.+)", body)
        default_start, default_end = None, None
        if full_window_match:
            default_start, default_end = extract_datetime_window(full_window_match.group(1))
        
        if not default_start:
            default_start = datetime.combine(base_date, datetime.strptime("09:00", "%H:%M").time())
            default_end = datetime.combine(base_date, datetime.strptime("17:00", "%H:%M").time())
     
        paragraphs = body.split('\n')
        current_context = ""
        service_contexts = {}
        
       
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
                
            current_context += " " + para
            
            for service_name, service_info in SERVICES.items():
                if service_name.lower() in para.lower() or any(alias.lower() in para.lower() for alias in service_info["aliases"]):
                    if service_name not in service_contexts:
                        service_contexts[service_name] = []
                    service_contexts[service_name].append(current_context)
    
        for service_name, contexts in service_contexts.items():
            if service_name in seen_services:
                continue
                
            service_info = SERVICES[service_name]
            best_context = max(contexts, key=len) 
            
   
            start_dt, end_dt = extract_datetime_window(best_context, base_date)
            if not start_dt:
                start_dt, end_dt = default_start, default_end
            
            
            impact = detect_impact(best_context, service_info)
          
            service_data = {
                'name': service_name,
                'start_time': start_dt.strftime("%H:%M"),
                'end_time': end_dt.strftime("%H:%M"),
                'date': start_dt.date().strftime("%Y-%m-%d"),
                'end_date': end_dt.date().strftime("%Y-%m-%d"),
                'impact': impact,
                'comments': service_info['default_impact'] if impact == 'IMPACTED' else "No Impact."
            }
            
            services_data.append(service_data)
            seen_services.add(service_name)
        
      
        for service_name, service_info in SERVICES.items():
            if service_name not in seen_services:
                services_data.append({
                    'name': service_name,
                    'start_time': default_start.strftime("%H:%M"),
                    'end_time': default_end.strftime("%H:%M"),
                    'date': default_start.date().strftime("%Y-%m-%d"),
                    'impact': 'NOT_IMPACTED',
                    'comments': "No Impact."
                })
        
        return {
            'services': services_data,
            'date': base_date.strftime("%Y-%m-%d"),
            'original_subject': subject,
            'original_body': body
        }
        
    except Exception as e:
        print(f"[ERROR] Error in parse_email_content: {str(e)}")
        return {
            'services': [],
            'error': str(e),
            'original_subject': email_data.get('subject', ''),
            'original_body': email_data.get('body', '')
        }

def process_email_content(email_data):
    """Main processing function for email content."""
    try:
        return parse_email_content(email_data)
        
    except Exception as e:
        print(f"[ERROR] Error in process_email_content: {str(e)}")
        return {
            'services': [],
            'error': str(e),
            'original_subject': email_data.get('subject', ''),
            'original_body': email_data.get('body', '')
        }