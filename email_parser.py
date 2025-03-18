import os
import requests
import pytz
from datetime import datetime, timedelta
from dateutil import parser
import re
import calendar
from dateutil.relativedelta import relativedelta

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

def get_month_number(month_name):
    """Convert month name to month number (1-12)"""
    month_name = month_name.lower()[:3]  # Take first 3 characters
    month_abbr = {calendar.month_name[i].lower()[:3]: i for i in range(1, 13)}
    month_abbr.update({calendar.month_abbr[i].lower()[:3]: i for i in range(1, 13)})
    
    # Add Swedish/European month names
    special_months = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "mai": 5, "jun": 6, 
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "okt": 10, "nov": 11, "dec": 12
    }
    month_abbr.update(special_months)
    
    return month_abbr.get(month_name, None)

def extract_date_from_subject(subject):
    """Enhanced date extraction from email subject line."""
    if not subject:
        return None
        
    current_year = datetime.now().year
    
    # Try to extract year from the subject
    year_match = re.search(r'20\d{2}', subject)
    year = year_match.group(0) if year_match else str(current_year)
    
    # Handle date ranges like "15th to 16th of Mars 2025"
    date_range_patterns = [
        r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:to|and|&|-)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)',
        r'(\d{1,2})(?:st|nd|rd|th)?(?:-|\s*to\s*)(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)',
    ]
    
    for pattern in date_range_patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            start_day, end_day, month_name = match.groups()
            month_num = get_month_number(month_name)
            if month_num:
                try:
                    # Return the first day of the range as the reference date
                    date_obj = datetime(int(year), month_num, int(start_day))
                    return date_obj.date()
                except ValueError:
                    continue

    # Try single date pattern like "15th of March"
    single_date_patterns = [
        r'(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)',
        r'([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?',
    ]
    
    for pattern in single_date_patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            groups = match.groups()
            if len(groups) == 2:
                if groups[0].isdigit():
                    day, month_name = groups
                else:
                    month_name, day = groups
                    
                month_num = get_month_number(month_name)
                if month_num:
                    try:
                        date_obj = datetime(int(year), month_num, int(day))
                        return date_obj.date()
                    except ValueError:
                        continue
    
    # If we can't extract a date, return today's date as fallback
    return datetime.now().date()

def parse_date_string(date_str):
    """Parse a date string in various formats and return a datetime object."""
    if not date_str:
        return None
        
    # Try to handle formats like "15:th" with contextual month/year
    ordinal_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)'
    ordinal_match = re.match(ordinal_pattern, date_str.strip())
    if ordinal_match:
        day = int(ordinal_match.group(1))
        # We'll need the month and year from context
        return day  # Return just the day for now
    
    # Handle standard date formats
    try:
        return parser.parse(date_str, fuzzy=True).date()
    except (ValueError, parser.ParserError):
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

def extract_date_time_window(text, base_date=None):
    """
    Extract date and time window from text more accurately.
    Returns tuple of (start_date, start_time, end_date, end_time)
    Handles multi-day windows and special formats.
    """
    # Multi-day pattern with day and time on both sides: "14:th 18:00 - 16:th 16:00"
    multi_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})'
    multi_day_match = re.search(multi_day_pattern, text)
    
    if multi_day_match:
        start_day, start_time, end_day, end_time = multi_day_match.groups()
        
        # Extract month and year from base_date
        month = base_date.month if base_date else datetime.now().month
        year = base_date.year if base_date else datetime.now().year
        
        # Parse the days
        start_day = int(start_day)
        end_day = int(end_day)
        
        # Handle month transition (when end day < start day)
        if end_day < start_day:
            # Assume next month
            end_month = month + 1
            if end_month > 12:
                end_month = 1
                end_year = year + 1
            else:
                end_year = year
        else:
            end_month = month
            end_year = year
            
        # Create datetime objects
        try:
            start_dt = datetime(year, month, start_day)
            end_dt = datetime(end_year, end_month, end_day)
            
            # Handle 24:00 format
            if end_time == "24:00":
                end_time = "00:00"
                end_dt += timedelta(days=1)
                
            return start_dt.date(), start_time, end_dt.date(), end_time
        except ValueError:
            pass
    
    # Look for single day with time range: "15:th 08:00 - 10:00"
    single_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
    single_day_match = re.search(single_day_pattern, text)
    
    if single_day_match:
        day, start_time, end_time = single_day_match.groups()
        
        # Extract month and year from base_date
        month = base_date.month if base_date else datetime.now().month
        year = base_date.year if base_date else datetime.now().year
        
        try:
            day_dt = datetime(year, month, int(day))
            
            # Handle 24:00 time format
            end_date = day_dt.date()
            if end_time == "24:00":
                end_time = "00:00"
                end_date = (day_dt + timedelta(days=1)).date()
                
            return day_dt.date(), start_time, end_date, end_time
        except ValueError:
            pass
    
    # Simple time range with no date: "08:00 - 10:00"
    time_pattern = r'(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
    time_match = re.search(time_pattern, text)
    
    if time_match:
        start_time, end_time = time_match.groups()
        if base_date:
            # Handle 24:00 format
            end_date = base_date
            if end_time == "24:00":
                end_time = "00:00"
                end_date = base_date + timedelta(days=1)
            return base_date, start_time, end_date, end_time
    
    return None, None, None, None

def extract_service_windows(email_body, base_date):
    """Extract maintenance windows for each service from email body with improved accuracy."""
    service_windows = {}
    paragraphs = email_body.split('\n')
    
    # First, extract the full change window
    full_window_pattern = r"Full change window:?\s*(.+?)(?:\s|$)"
    full_window_match = re.search(full_window_pattern, email_body)
    default_window = None
    
    if full_window_match:
        full_window_text = full_window_match.group(1)
        start_date, start_time, end_date, end_time = extract_date_time_window(full_window_text, base_date)
        
        if start_time:
            default_window = {
                'start_date': start_date,
                'start_time': start_time,
                'end_date': end_date,
                'end_time': end_time
            }

    # Special handling for Jenkins paused window - needs to capture Friday 14:th 23:00 - Sunday 16:th 14:00 format
    jenkins_pause_pattern = r"Jenkins paused.*?\(Friday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*Sunday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\)"
    jenkins_pause_match = re.search(jenkins_pause_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jenkins_pause_match:
        try:
            start_day, start_time, end_day, end_time = jenkins_pause_match.groups()
            
            # Parse start and end dates
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
            # Handle month transition if needed
            if end_day_int < start_day_int:
                end_month = month + 1 if month < 12 else 1
                end_year = year if month < 12 else year + 1
            else:
                end_month, end_year = month, year
            
            start_dt = datetime(year, month, start_day_int)
            end_dt = datetime(end_year, end_month, end_day_int)
            
            service_windows["Jenkins"] = {
                'start_date': start_dt.date(),
                'start_time': start_time,
                'end_date': end_dt.date(),
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["Jenkins"]['default_impact']
            }
        except Exception as e:
            print(f"Error extracting Jenkins paused window: {str(e)}")
    
    # Fixed extraction for GitLab - ensure it gets 14:th 18:00 - 16:th 16:00 correctly
    gitlab_pattern = r"GitLab.*?unavailable during the upgrade\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    gitlab_match = re.search(gitlab_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if gitlab_match:
        try:
            gitlab_text = gitlab_match.group(0)
            multi_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})'
            date_match = re.search(multi_day_pattern, gitlab_text)
            
            if date_match:
                start_day, start_time, end_day, end_time = date_match.groups()
                
                # Parse days and create dates - using the exact days from the email, not the base date
                month = base_date.month
                year = base_date.year
                start_day_int = int(start_day)
                end_day_int = int(end_day)
                
                # Handle month transition (when end day < start day)
                if end_day_int < start_day_int:
                    end_month = month + 1 if month < 12 else 1
                    end_year = year if month < 12 else year + 1
                else:
                    end_month, end_year = month, year
                
                start_dt = datetime(year, month, start_day_int)
                end_dt = datetime(end_year, end_month, end_day_int)
                
                service_windows["GitLab"] = {
                    'start_date': start_dt.date(),
                    'start_time': start_time,
                    'end_date': end_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["GitLab"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting GitLab window: {str(e)}")

    # Fixed JIRA extraction to correctly use 08:00 - 10:00 time window
    jira_pattern = r"Jira.*?not available.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    jira_match = re.search(jira_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jira_match:
        try:
            jira_text = jira_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, jira_text)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                service_windows["JIRA"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["JIRA"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting JIRA window: {str(e)}")
    
    # Handle alternate "All automation will be paused" format for Jenkins with more explicit day extraction
    note_automation_pattern = r"NOTE:\s*All automation will be paused from\s+(?:Friday\s+)?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*(?:CET)?\s*until\s+(?:Sunday\s+)?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    note_match = re.search(note_automation_pattern, email_body, re.IGNORECASE)
    if note_match and "Jenkins" not in service_windows:
        try:
            start_day, start_time, end_day, end_time = note_match.groups()
            
            # Parse days and create dates
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
            # Handle month transition (when end day < start day)
            if end_day_int < start_day_int:
                end_month = month + 1 if month < 12 else 1
                end_year = year if month < 12 else year + 1
            else:
                end_month, end_year = month, year
            
            start_dt = datetime(year, month, start_day_int)
            end_dt = datetime(end_year, end_month, end_day_int)
            
            service_windows["Jenkins"] = {
                'start_date': start_dt.date(),
                'start_time': start_time,
                'end_date': end_dt.date(),
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["Jenkins"]['default_impact']
            }
        except Exception as e:
            print(f"Error extracting Jenkins automation window: {str(e)}")
    
    # Additional checks for accuracy - direct pattern search for common maintenance formats
    # Look for specific formats like "Gitlab will be unavailable during the upgrade 14:th 18:00 - 16:th 16:00"
    specific_gitlab_pattern = r"GitLab.*?unavailable during the upgrade\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    specific_match = re.search(specific_gitlab_pattern, email_body)
    if specific_match:
        start_day, start_time, end_day, end_time = specific_match.groups()
        try:
            # Use exact specified dates, not base_date
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
            # Handle crossing month boundary if needed
            if end_day_int < start_day_int:
                end_month = month + 1 if month < 12 else 1
                end_year = year if month < 12 else year + 1
            else:
                end_month, end_year = month, year
            
            start_dt = datetime(year, month, start_day_int)
            end_dt = datetime(end_year, end_month, end_day_int)
            
            # Override any existing GitLab entry with this more specific info
            service_windows["GitLab"] = {
                'start_date': start_dt.date(),
                'start_time': start_time,
                'end_date': end_dt.date(),
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["GitLab"]['default_impact']
            }
        except Exception as e:
            print(f"Error extracting specific GitLab window: {str(e)}")
    
    # Updated extraction for Jenkins paused - support multiple formats
    jenkins_pause_patterns = [
        # Format with parenthesis: (Friday 14:th 23:00 - Sunday 16:th 14:00)
        r"Jenkins paused.*?\(Friday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*Sunday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\)",
        # Format without parenthesis: Friday 14:th 23:00 - Sunday 16:th 14:00
        r"Jenkins paused.*?Friday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*Sunday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})",
        # Simpler format: 14:th 23:00 - 16:th 14:00
        r"Jenkins paused.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    ]
    
    jenkins_match = None
    jenkins_day_format = False
    
    for pattern in jenkins_pause_patterns:
        match = re.search(pattern, email_body, re.IGNORECASE | re.DOTALL)
        if match:
            jenkins_match = match
            # If we matched one of the first two patterns with Friday/Sunday format
            jenkins_day_format = pattern.find("Friday") > -1
            break
    
    if jenkins_match:
        try:
            groups = jenkins_match.groups()
            if jenkins_day_format:
                start_day, start_time, end_day, end_time = groups
            else:
                start_day, start_time, end_day, end_time = groups
                
            # Parse days and create dates
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
            # Handle month transition (when end day < start day)
            if end_day_int < start_day_int:
                end_month = month + 1 if month < 12 else 1
                end_year = year if month < 12 else year + 1
            else:
                end_month, end_year = month, year
            
            start_dt = datetime(year, month, start_day_int)
            end_dt = datetime(end_year, end_month, end_day_int)
            
            service_windows["Jenkins"] = {
                'start_date': start_dt.date(),
                'start_time': start_time,
                'end_date': end_dt.date(),
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["Jenkins"]['default_impact']
            }
        except Exception as e:
            print(f"Error extracting Jenkins window: {str(e)}")

    # Also look for a simple note about Jenkins automation being paused
    if "Jenkins" not in service_windows:
        automation_pattern = r"NOTE:\s*All automation will be paused from\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*(?:CET)?\s*until\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
        automation_match = re.search(automation_pattern, email_body, re.IGNORECASE)
        if automation_match:
            try:
                start_day, start_time, end_day, end_time = automation_match.groups()
                
                # Parse days and create dates
                month = base_date.month
                year = base_date.year
                start_day_int = int(start_day)
                end_day_int = int(end_day)
                
                # Handle month transition (when end day < start day)
                if end_day_int < start_day_int:
                    end_month = month + 1 if month < 12 else 1
                    end_year = year if month < 12 else year + 1
                else:
                    end_month, end_year = month, year
                
                start_dt = datetime(year, month, start_day_int)
                end_dt = datetime(end_year, end_month, end_day_int)
                
                service_windows["Jenkins"] = {
                    'start_date': start_dt.date(),
                    'start_time': start_time,
                    'end_date': end_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["Jenkins"]['default_impact']
                }
            except Exception as e:
                print(f"Error extracting automation window: {str(e)}")
    
    # Extract JIRA maintenance window specifically - fix time to be 08:00 - 10:00
    jira_pattern = r"Jira.*?not available.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    jira_match = re.search(jira_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jira_match:
        try:
            jira_window = jira_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, jira_window)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                service_windows["JIRA"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["JIRA"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting JIRA window: {str(e)}")

    # Extract Confluence maintenance window specifically
    confluence_pattern = r"Confluence.*?not available.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    confluence_match = re.search(confluence_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if confluence_match:
        try:
            confluence_window = confluence_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, confluence_window)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                service_windows["Confluence"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["Confluence"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting Confluence window: {str(e)}")

    # Extract Gerrit EPK maintenance window specifically
    gerrit_pattern = r"GitRMS-Gerrit Alpha/EPK.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})"
    gerrit_match = re.search(gerrit_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if gerrit_match:
        try:
            gerrit_window = gerrit_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, gerrit_window)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                service_windows["Gerrit EPK"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': detect_impact(gerrit_window, SERVICES["Gerrit EPK"]),
                    'comments': SERVICES["Gerrit EPK"]['default_impact'] if "interrupted" in gerrit_window.lower() else "No Impact."
                }
        except Exception as e:
            print(f"Error extracting Gerrit EPK window: {str(e)}")
    
    # Extract Windows Build maintenance window specifically
    windows_pattern = r"E2C Windows Patching.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    windows_match = re.search(windows_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if windows_match:
        try:
            windows_window = windows_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, windows_window)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                service_windows["Windows Build"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED', # Since servers being rebooted
                    'comments': SERVICES["Windows Build"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting Windows Build window: {str(e)}")

    # Extract ARM maintenance window with improved "no impact" detection
    arm_pattern = r"ARM Production.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    arm_match = re.search(arm_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if arm_match:
        try:
            arm_window = arm_match.group(0)
            day_time_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
            time_match = re.search(day_time_pattern, arm_window)
            
            if time_match:
                day, start_time, end_time = time_match.groups()
                day_dt = datetime(base_date.year, base_date.month, int(day))
                
                # Check specifically for "should be no impact" pattern
                impact = "NOT_IMPACTED" if re.search(r"should be no impact", arm_window.lower()) else detect_impact(arm_window, SERVICES["ARM SELI & SERO"])
                
                service_windows["ARM SELI & SERO"] = {
                    'start_date': day_dt.date(),
                    'start_time': start_time,
                    'end_date': day_dt.date(),
                    'end_time': end_time,
                    'impact': impact,
                    'comments': "No Impact." if impact == "NOT_IMPACTED" else SERVICES["ARM SELI & SERO"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting ARM window: {str(e)}")
    
    # Try to identify other service-specific paragraphs and their windows
    for service_name, service_info in SERVICES.items():
        # Skip services we've already handled specifically
        if service_name in service_windows:
            continue
            
        service_aliases = [service_name.lower()] + [alias.lower() for alias in service_info["aliases"]]
        
        for i, paragraph in enumerate(paragraphs):
            paragraph_lower = paragraph.lower()
            
            # Check if this paragraph mentions the service
            if any(alias in paragraph_lower for alias in service_aliases):
                # Combine with surrounding context (current + next paragraph)
                context = paragraph
                if i+1 < len(paragraphs):
                    context += " " + paragraphs[i+1]
                
                # Look for specific window in this context
                has_time = re.search(r'\d{1,2}:\d{2}', context)
                if has_time:
                    start_date, start_time, end_date, end_time = extract_date_time_window(context, base_date)
                    
                    if start_time:  # If we found a time window
                        # Detect impact level
                        impact = detect_impact(context, service_info)
                        
                        service_windows[service_name] = {
                            'start_date': start_date,
                            'start_time': start_time,
                            'end_date': end_date,
                            'end_time': end_time,
                            'impact': impact,
                            'comments': service_info['default_impact'] if impact == 'IMPACTED' else "No Impact."
                        }
                        break
    
    # For services without specific windows, use the default window
    if default_window:
        for service_name in SERVICES:
            if service_name not in service_windows:
                # Try to detect any mention of the service in the email
                service_aliases = [service_name.lower()] + [alias.lower() for alias in SERVICES[service_name]["aliases"]]
                service_mentioned = any(alias in email_body.lower() for alias in service_aliases)
                
                if service_mentioned:
                    # Find the paragraph(s) mentioning this service
                    service_paragraphs = []
                    for paragraph in paragraphs:
                        if any(alias in paragraph.lower() for alias in service_aliases):
                            service_paragraphs.append(paragraph)
                    
                    # Detect impact from all relevant paragraphs
                    service_context = " ".join(service_paragraphs)
                    impact = detect_impact(service_context, SERVICES[service_name]) if service_paragraphs else "NOT_IMPACTED"
                    
                    service_windows[service_name] = {
                        'start_date': default_window['start_date'],
                        'start_time': default_window['start_time'],
                        'end_date': default_window['end_date'],
                        'end_time': default_window['end_time'],
                        'impact': impact,
                        'comments': SERVICES[service_name]['default_impact'] if impact == 'IMPACTED' else "No Impact."
                    }
                else:
                    # If service isn't mentioned at all, just use defaults
                    service_windows[service_name] = {
                        'start_date': default_window['start_date'],
                        'start_time': default_window['start_time'],
                        'end_date': default_window['end_date'],
                        'end_time': default_window['end_time'],
                        'impact': 'NOT_IMPACTED',
                        'comments': "No Impact."
                    }
    
    return service_windows

def detect_impact(text, service_info):
    """Enhanced impact detection using service-specific indicators and better pattern matching."""
    text_lower = text.lower()
   
    # Check for explicit "no impact" statements - expanded to catch more variations
    no_impact_patterns = [
        r"no\s+impact",
        r"not\s+impact",
        r"no\s+expected\s+impact",
        r"transparent\s+to\s+users",
        r"impact:\s*none",
        r"impact\s*:\s*no",
        r"should be no impact",
        r"should\s+be\s+no\s+impact",
        r"none of our users",
        r"no\s+.*\s+impact"
    ]
    
    # Explicit check for "should be no impact"
    if re.search(r"should\s+be\s+no\s+impact", text_lower):
        return "NOT_IMPACTED"
    
    # Check for "no impact" except for phrases like "no impact but..."
    if any(re.search(pattern, text_lower) for pattern in no_impact_patterns):
        if not re.search(r"no impact but", text_lower):
            return "NOT_IMPACTED"
    
    # Check for service-specific impact indicators
    impact_indicators = service_info.get("impact_indicators", [])
    if any(indicator in text_lower for indicator in impact_indicators):
        return "IMPACTED"
    
    # Enhanced general impact indicators
    general_impact_indicators = [
        "unavailable", "maintenance", "upgrade", "impact",
        "downtime", "pause", "paused", "stopped", "shut down", "shutdown",
        "offline", "reboot", "restart", "migration", "interruption",
        "not available", "cannot be accessed", "cannot be triggered",
        "rollout", "deploy", "update", "patching", "servers rebooted",
        "certificate update", "might get interrupted", "interrupted", "interruptions"
    ]
    
    if any(indicator in text_lower for indicator in general_impact_indicators):
        # But check for explicit exceptions
        if "should always be available" in text_lower or "should be available" in text_lower:
            return "NOT_IMPACTED"
        return "IMPACTED"
    
    return "NOT_IMPACTED"

def parse_email_content(email_data):
    """Completely revised email content parser with improved date and time handling."""
    try:
        body = email_data.get('body', '')
        subject = email_data.get('subject', '')
        
        # Extract base date from subject
        base_date = extract_date_from_subject(subject)
        if not base_date:
            base_date = datetime.now().date()
        
        # Extract service-specific maintenance windows
        service_windows = extract_service_windows(body, base_date)
        
        # Prepare the output data structure
        services_data = []
        
        # Special handling for specific services based on email analysis
        
        # Check for Jenkins paused message
        jenkins_pattern = r"Jenkins paused.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
        jenkins_match = re.search(jenkins_pattern, body, re.IGNORECASE)
        
        # Process each service
        for service_name, service_info in SERVICES.items():
            window = service_windows.get(service_name)
            
            if window:
                # We found a specific window for this service
                service_data = {
                    'name': service_name,
                    'date': window['start_date'].strftime("%Y-%m-%d") if window['start_date'] else base_date.strftime("%Y-%m-%d"),
                    'start_time': window['start_time'],
                    'end_time': window['end_time'],
                    'end_date': window['end_date'].strftime("%Y-%m-%d") if window['end_date'] else base_date.strftime("%Y-%m-%d"),
                    'impact': window['impact'],
                    'comments': window['comments']
                }
            else:
                # No specific window found, use defaults
                service_data = {
                    'name': service_name,
                    'date': base_date.strftime("%Y-%m-%d"),
                    'start_time': "09:00",
                    'end_time': "17:00",
                    'end_date': base_date.strftime("%Y-%m-%d"),
                    'impact': 'NOT_IMPACTED',
                    'comments': "No Impact."
                }
            
            services_data.append(service_data)
        
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