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
    month_name = month_name.lower()[:3]  
    month_abbr = {calendar.month_name[i].lower()[:3]: i for i in range(1, 13)}
    month_abbr.update({calendar.month_abbr[i].lower()[:3]: i for i in range(1, 13)})
    
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
    
    year_match = re.search(r'20\d{2}', subject)
    year = year_match.group(0) if year_match else str(current_year)
    
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
                    date_obj = datetime(int(year), month_num, int(start_day))
                    return date_obj.date()
                except ValueError:
                    continue

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
    
    return datetime.now().date()

def parse_date_string(date_str):
    """Parse a date string in various formats and return a datetime object."""
    if not date_str:
        return None
        
    ordinal_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)'
    ordinal_match = re.match(ordinal_pattern, date_str.strip())
    if ordinal_match:
        day = int(ordinal_match.group(1))
        return day  
    
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
    """Extract date and time window from text more accurately."""
    # Add ISO format date-time pattern with full dates on both sides
    iso_pattern = r'(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})'
    iso_match = re.search(iso_pattern, text)
    if iso_match:
        start_date_str, start_time, end_date_str, end_time = iso_match.groups()
        try:
            start_dt = datetime.fromisoformat(start_date_str)
            end_dt = datetime.fromisoformat(end_date_str)
            return start_dt.date(), start_time, end_dt.date(), end_time
        except ValueError:
            pass
    
    # Improve single ISO date with time range - better detection
    iso_single_day = r'(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[–-]\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2})'
    iso_single_match = re.search(iso_single_day, text)
    if iso_single_match:
        groups = iso_single_match.groups()
        date_str = groups[0]
        start_time = groups[1]
        end_date_str = groups[2] if groups[2] else date_str
        end_time = groups[3] if groups[2] else groups[2]
        
        try:
            start_dt = datetime.fromisoformat(date_str)
            end_dt = datetime.fromisoformat(end_date_str) if groups[2] else start_dt
            
            if end_time == "24:00":
                end_time = "00:00"
                end_dt = end_dt + timedelta(days=1)
                
            return start_dt.date(), start_time, end_dt.date(), end_time
        except ValueError:
            pass
            
    # Keep existing patterns
    multi_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})'
    multi_day_match = re.search(multi_day_pattern, text)
    
    if multi_day_match:
        start_day, start_time, end_day, end_time = multi_day_match.groups()
        
        month = base_date.month if base_date else datetime.now().month
        year = base_date.year if base_date else datetime.now().year
        
        start_day = int(start_day)
        end_day = int(end_day)
        
        if end_day < start_day:
            end_month = month + 1
            if end_month > 12:
                end_month = 1
                end_year = year + 1
            else:
                end_year = year
        else:
            end_month = month
            end_year = year
            
        try:
            start_dt = datetime(year, month, start_day)
            end_dt = datetime(end_year, end_month, end_day)
            
            if end_time == "24:00":
                end_time = "00:00"
                end_dt += timedelta(days=1)
                
            return start_dt.date(), start_time, end_dt.date(), end_time
        except ValueError:
            pass
    
    single_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
    single_day_match = re.search(single_day_pattern, text)
    
    if single_day_match:
        day, start_time, end_time = single_day_match.groups()
        
        month = base_date.month if base_date else datetime.now().month
        year = base_date.year if base_date else datetime.now().year
        
        try:
            day_dt = datetime(year, month, int(day))
            
            end_date = day_dt.date()
            if end_time == "24:00":
                end_time = "00:00"
                end_date = (day_dt + timedelta(days=1)).date()
                
            return day_dt.date(), start_time, end_date, end_time
        except ValueError:
            pass
    
    time_pattern = r'(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})'
    time_match = re.search(time_pattern, text)
    
    if time_match:
        start_time, end_time = time_match.groups()
        if base_date:
            end_date = base_date
            if end_time == "24:00":
                end_time = "00:00"
                end_date = base_date + timedelta(days=1)
            return base_date, start_time, end_date, end_time
    
    # Add pattern for explicit change window format
    change_window = r"Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[-–]\s*(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}:\d{2})"
    window_match = re.search(change_window, text)
    if window_match:
        groups = window_match.groups()
        start_date_str = groups[0]
        start_time = groups[1]
        end_date_str = groups[2] if groups[2] else start_date_str
        end_time = groups[3]
        
        try:
            start_dt = datetime.fromisoformat(start_date_str)
            end_dt = datetime.fromisoformat(end_date_str)
            return start_dt.date(), start_time, end_dt.date(), end_time
        except ValueError:
            pass

    return None, None, None, None

def extract_service_windows(email_body, base_date):
    """Extract maintenance windows for each service from email body with improved accuracy."""
    service_windows = {}
    paragraphs = email_body.split('\n')
    
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
    
    # Improved pattern for change entries with more specific format recognition
    change_entry_pattern = r"CHANGE-\d+\s*-\s*([^•\n]+?)(?:[\r\n]|Impact:)(?:.*?Impact:(.*?)(?:[\r\n]|Window:))?.*?Window:\s*([^\r\n•]+)"
    change_entries = re.finditer(change_entry_pattern, email_body, re.DOTALL)
    
    for entry in change_entries:
        try:
            service_desc = entry.group(1).strip()
            impact_text = entry.group(2).strip() if entry.group(2) else ""
            window_text = entry.group(3).strip()
            
            # Determine service name
            service_name = None
            for service, info in SERVICES.items():
                service_lower = service.lower()
                desc_lower = service_desc.lower()
                
                if service_lower in desc_lower or any(alias.lower() in desc_lower for alias in info['aliases']):
                    service_name = service
                    break
            
            if not service_name:
                continue
                
            # Extract window dates and times
            start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
            
            if start_time and start_date:
                impact = detect_impact(impact_text + " " + service_desc, SERVICES[service_name])
                
                service_windows[service_name] = {
                    'start_date': start_date,
                    'start_time': start_time,
                    'end_date': end_date,
                    'end_time': end_time,
                    'impact': impact,
                    'comments': SERVICES[service_name]['default_impact'] if impact == 'IMPACTED' else "No Impact."
                }
        except Exception as e:
            print(f"Error processing change entry: {str(e)}")
    
    # Process specific jenkins paused pattern
    jenkins_pattern = r"Jenkins will be paused due to.*?Window:\s*([^\r\n•]+)"
    jenkins_match = re.search(jenkins_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jenkins_match:
        window_text = jenkins_match.group(1).strip()
        start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
        
        if start_time and start_date:
            service_windows["Jenkins"] = {
                'start_date': start_date, 
                'start_time': start_time,
                'end_date': end_date,
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["Jenkins"]['default_impact']
            }
    
    # Process GitLab specific pattern
    gitlab_pattern = r"GitLab Production.*?upgrade.*?Window:\s*([^\r\n•]+)"
    gitlab_match = re.search(gitlab_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if gitlab_match:
        window_text = gitlab_match.group(1).strip()
        start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
        
        if start_time and start_date:
            service_windows["GitLab"] = {
                'start_date': start_date,
                'start_time': start_time, 
                'end_date': end_date if end_date else start_date,
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["GitLab"]['default_impact']
            }
    
    # Process Jira specific pattern
    jira_pattern = r"(?:Jira|eTeamProject).*?(?:not available|split|unavailable).*?Window:\s*([^\r\n•]+)"
    jira_match = re.search(jira_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jira_match:
        window_text = jira_match.group(1).strip()
        start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
        
        if start_time and start_date:
            service_windows["JIRA"] = {
                'start_date': start_date,
                'start_time': start_time,
                'end_date': end_date if end_date else start_date,
                'end_time': end_time, 
                'impact': 'IMPACTED',
                'comments': SERVICES["JIRA"]['default_impact']
            }
    
    # Process ARM specific pattern  
    arm_pattern = r"ARM (?:XRay|SELI|SERO|DB).*?Window:\s*([^\r\n•]+)"
    arm_match = re.search(arm_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if arm_match:
        window_text = arm_match.group(1).strip()
        arm_context = arm_match.group(0)
        start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
        
        if start_time and start_date:
            impact = detect_impact(arm_context, SERVICES["ARM SELI & SERO"])
            
            service_windows["ARM SELI & SERO"] = {
                'start_date': start_date,
                'start_time': start_time,
                'end_date': end_date if end_date else start_date,
                'end_time': end_time,
                'impact': impact,
                'comments': SERVICES["ARM SELI & SERO"]['default_impact'] if impact == 'IMPACTED' else "No Impact."
            }
    
    # Process Windows Build specific pattern
    windows_pattern = r"E2C\s*-\s*Windows Patching.*?(?:February|Jan|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}"
    windows_match = re.search(windows_pattern, email_body, re.IGNORECASE)
    if windows_match and "Windows Build" not in service_windows and default_window:
        service_windows["Windows Build"] = {
            'start_date': default_window['start_date'],
            'start_time': default_window['start_time'],
            'end_date': default_window['end_date'],
            'end_time': default_window['end_time'],
            'impact': 'IMPACTED',
            'comments': SERVICES["Windows Build"]['default_impact']
        }
    
    # Add more specific patterns for Gerrit and other services
    gerrit_patterns = [
        r"GitRMS-Gerrit.*?(?:upgrade|change|parameter).*?Window:\s*([^\r\n•]+)",
        r"Gerrit.*?(?:Alpha|EPK|Archive).*?Window:\s*([^\r\n•]+)"
    ]
    
    for pattern in gerrit_patterns:
        gerrit_match = re.search(pattern, email_body, re.IGNORECASE | re.DOTALL)
        if gerrit_match:
            window_text = gerrit_match.group(1).strip()
            gerrit_context = gerrit_match.group(0)
            start_date, start_time, end_date, end_time = extract_date_time_window(window_text, base_date)
            
            if start_time and start_date:
                impact = detect_impact(gerrit_context, SERVICES["Gerrit EPK"])
                
                # Only update if the current window has a longer duration
                if "Gerrit EPK" not in service_windows:
                    service_windows["Gerrit EPK"] = {
                        'start_date': start_date,
                        'start_time': start_time,
                        'end_date': end_date if end_date else start_date,
                        'end_time': end_time,
                        'impact': impact,
                        'comments': SERVICES["Gerrit EPK"]['default_impact'] if impact == 'IMPACTED' else "No Impact."
                    }
    
    # Continue with the rest of the existing function
    jenkins_pause_patterns = [
        r"Jenkins paused.*?\((?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\)",
        r"Jenkins paused.*?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})",
        r"Jenkins paused.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    ]
    
    jenkins_match = None
    jenkins_format_type = None
    
    for i, pattern in enumerate(jenkins_pause_patterns):
        match = re.search(pattern, email_body, re.IGNORECASE)
        if match:
            jenkins_match = match
            jenkins_format_type = i
            break
    
    if jenkins_match:
        try:
            groups = jenkins_match.groups()
            if jenkins_format_type <= 1:  
                start_day, start_time, end_day, end_time = groups
                
                month = base_date.month
                year = base_date.year
                start_day_int = int(start_day)
                end_day_int = int(end_day)
                
                if end_day_int < start_day_int:
                    end_month = month + 1 if month < 12 else 1
                    end_year = year if month < 12 else year + 1
                else:
                    end_month, end_year = month, year
                
                start_dt = datetime(year, month, start_day_int)
                end_dt = datetime(end_year, end_month, end_day_int)
                
            else: 
                start_date_str, start_time, end_date_str, end_time = groups
                start_dt = datetime.fromisoformat(start_date_str)
                end_dt = datetime.fromisoformat(end_date_str)
            
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

    gitlab_patterns = [
        r"GitLab.*?unavailable during.*?Window:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})",
        r"GitLab.*?Impact:.*?unavailable.*?Window:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    ]
    
    for gitlab_pattern in gitlab_patterns:
        gitlab_match = re.search(gitlab_pattern, email_body, re.IGNORECASE | re.DOTALL)
        if gitlab_match:
            try:
                year, month, day, start_time, end_time = gitlab_match.groups()
                year_int = int(year)
                
                gitlab_date = datetime(year_int, int(month), int(day))
                
                service_windows["GitLab"] = {
                    'start_date': gitlab_date.date(),
                    'start_time': start_time,
                    'end_date': gitlab_date.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["GitLab"]['default_impact']
                }
                break
            except Exception as e:
                print(f"Error extracting GitLab window: {str(e)}")

    arm_patterns = [
        r"ARM SELI.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})",
        r"ARM SELI unavailable for.*?~(\d+)\s+hours?.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})",
        r"ARM SELI.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    ]
    
    for arm_pattern in arm_patterns:
        arm_match = re.search(arm_pattern, email_body, re.IGNORECASE | re.DOTALL)
        if arm_match:
            try:
                groups = arm_match.groups()
                
                if len(groups) == 4:  
                    hours, date_str, start_time, end_time = groups
                    arm_date = datetime.fromisoformat(date_str)
                elif len(groups) == 3: 
                    date_str, start_time, end_time = groups
                    arm_date = datetime.fromisoformat(date_str)
                
                service_windows["ARM SELI & SERO"] = {
                    'start_date': arm_date.date(),
                    'start_time': start_time,
                    'end_date': arm_date.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["ARM SELI & SERO"]['default_impact']
                }
                break
            except Exception as e:
                print(f"Error extracting ARM SELI window: {str(e)}")

    gerrit_patterns = [
        r"GitRMS - Gerrit-Alpha/EPK upgrade.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})",
        r"Gerrit EPK unavailable.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})"
    ]
    
    for gerrit_pattern in gerrit_patterns:
        gerrit_match = re.search(gerrit_pattern, email_body, re.IGNORECASE | re.DOTALL)
        if gerrit_match:
            try:
                start_date_str, start_time, end_date_str, end_time = gerrit_match.groups()
                start_dt = datetime.fromisoformat(start_date_str)
                end_dt = datetime.fromisoformat(end_date_str)
                
                service_windows["Gerrit EPK"] = {
                    'start_date': start_dt.date(),
                    'start_time': start_time,
                    'end_date': end_dt.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["Gerrit EPK"]['default_impact']
                }
                break
            except Exception as e:
                print(f"Error extracting Gerrit EPK window: {str(e)}")

    jira_confluence_patterns = [
        r"(?:Jira|eTeamProject).*?(?:Confluence|eTeamSpace).*?unavailable for.*?~?(\d+)\s+hours?.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})",
        r"(?:Jira|eTeamProject).*?(?:Confluence|eTeamSpace).*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    ]
    
    for jc_pattern in jira_confluence_patterns:
        jc_match = re.search(jc_pattern, email_body, re.IGNORECASE | re.DOTALL)
        if jc_match:
            try:
                groups = jc_match.groups()
                
                if len(groups) == 4: 
                    hours, date_str, start_time, end_time = groups
                    jc_date = datetime.fromisoformat(date_str)
                elif len(groups) == 3:  
                    date_str, start_time, end_time = groups
                    jc_date = datetime.fromisoformat(date_str)
                
                service_windows["JIRA"] = {
                    'start_date': jc_date.date(),
                    'start_time': start_time,
                    'end_date': jc_date.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["JIRA"]['default_impact']
                }
                
                service_windows["Confluence"] = {
                    'start_date': jc_date.date(),
                    'start_time': start_time,
                    'end_date': jc_date.date(),
                    'end_time': end_time,
                    'impact': 'IMPACTED',
                    'comments': SERVICES["Confluence"]['default_impact']
                }
                break
            except Exception as e:
                print(f"Error extracting Jira/Confluence window: {str(e)}")

    windows_pattern = r"E2C Windows Patching.*?January (\d{4})"
    windows_match = re.search(windows_pattern, email_body, re.IGNORECASE)
    if windows_match and "Windows Build" not in service_windows and default_window:
        try:
            service_windows["Windows Build"] = {
                'start_date': default_window['start_date'],
                'start_time': default_window['start_time'],
                'end_date': default_window['end_date'],
                'end_time': default_window['end_time'],
                'impact': 'IMPACTED',
                'comments': SERVICES["Windows Build"]['default_impact']
            }
        except Exception as e:
            print(f"Error extracting Windows Build window: {str(e)}")

    jenkins_pause_pattern = r"Jenkins paused.*?\(Friday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*Sunday (\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\)"
    jenkins_pause_match = re.search(jenkins_pause_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if jenkins_pause_match:
        try:
            start_day, start_time, end_day, end_time = jenkins_pause_match.groups()
            
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
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
    
    gitlab_pattern = r"GitLab.*?unavailable during the upgrade\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
    gitlab_match = re.search(gitlab_pattern, email_body, re.IGNORECASE | re.DOTALL)
    if gitlab_match:
        try:
            gitlab_text = gitlab_match.group(0)
            multi_day_pattern = r'(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})'
            date_match = re.search(multi_day_pattern, gitlab_text)
            
            if date_match:
                start_day, start_time, end_day, end_time = date_match.groups()
                
                month = base_date.month
                year = base_date.year
                start_day_int = int(start_day)
                end_day_int = int(end_day)
                
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
    
    note_automation_pattern = r"NOTE:\s*All automation will be paused from\s+(?:Friday\s+)?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*(?:CET)?\s*until\s+(?:Sunday\s+)?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    note_match = re.search(note_automation_pattern, email_body, re.IGNORECASE)
    if note_match and "Jenkins" not in service_windows:
        try:
            start_day, start_time, end_day, end_time = note_match.groups()
            
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
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
    
    specific_gitlab_pattern = r"GitLab.*?unavailable during the upgrade\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    specific_match = re.search(specific_gitlab_pattern, email_body)
    if specific_match:
        start_day, start_time, end_day, end_time = specific_match.groups()
        try:
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
            end_month = month
            end_year = year
            
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
            print(f"Error extracting specific GitLab window: {str(e)}")
    
    jenkins_pause_patterns = [
        r"Jenkins paused.*?\((?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\)",
        r"Jenkins paused.*?(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(?:(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})",
        r"Jenkins paused.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
    ]
    
    jenkins_match = None
    jenkins_day_format = False
    
    for pattern in jenkins_pause_patterns:
        match = re.search(pattern, email_body, re.IGNORECASE | re.DOTALL)
        if match:
            jenkins_match = match
            jenkins_day_format = pattern.find("Friday") > -1
            break
    
    if jenkins_match:
        try:
            groups = jenkins_match.groups()
            if jenkins_day_format:
                start_day, start_time, end_day, end_time = groups
            else:
                start_day, start_time, end_day, end_time = groups
                
            month = base_date.month
            year = base_date.year
            start_day_int = int(start_day)
            end_day_int = int(end_day)
            
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

    if "Jenkins" not in service_windows:
        automation_pattern = r"NOTE:\s*All automation will be paused from\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*(?:CET)?\s*until\s+(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})"
        automation_match = re.search(automation_pattern, email_body, re.IGNORECASE)
        if automation_match:
            try:
                start_day, start_time, end_day, end_time = automation_match.groups()
                
                month = base_date.month
                year = base_date.year
                start_day_int = int(start_day)
                end_day_int = int(end_day)
                
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
                    'impact': 'IMPACTED', 
                    'comments': SERVICES["Windows Build"]['default_impact']
                }
        except Exception as e:
            print(f"Error extracting Windows Build window: {str(e)}")

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
    
    for service_name, service_info in SERVICES.items():
        if service_name in service_windows:
            continue
            
        service_aliases = [service_name.lower()] + [alias.lower() for alias in service_info["aliases"]]
        
        for i, paragraph in enumerate(paragraphs):
            paragraph_lower = paragraph.lower()
            
            if any(alias in paragraph_lower for alias in service_aliases):
                context = paragraph
                if i+1 < len(paragraphs):
                    context += " " + paragraphs[i+1]
                
                has_time = re.search(r'\d{1,2}:\d{2}', context)
                if has_time:
                    start_date, start_time, end_date, end_time = extract_date_time_window(context, base_date)
                    
                    if start_time:  
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
    
    if default_window:
        for service_name in SERVICES:
            if service_name not in service_windows:
                service_aliases = [service_name.lower()] + [alias.lower() for alias in SERVICES[service_name]["aliases"]]
                service_mentioned = any(alias in email_body.lower() for alias in service_aliases)
                
                if service_mentioned:
                    service_paragraphs = []
                    for paragraph in paragraphs:
                        if any(alias in paragraph.lower() for alias in service_aliases):
                            service_paragraphs.append(paragraph)
                    
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
                    service_windows[service_name] = {
                        'start_date': default_window['start_date'],
                        'start_time': default_window['start_time'],
                        'end_date': default_window['end_date'],
                        'end_time': default_window['end_time'],
                        'impact': 'NOT_IMPACTED',
                        'comments': "No Impact."
                    }
    
    service_windows = fix_gitlab_window(service_windows, email_body)
    service_windows = fix_gerrit_window(service_windows, email_body)
    service_windows = fix_jenkins_window(service_windows, email_body)
    service_windows = fix_arm_window(service_windows, email_body)
    
    # Windows Build specific enhancement
    if "Windows Build" not in service_windows:
        windows_pattern = r"E2C\s*-\s*Windows Patching.*?February\s+\d{4}"
        windows_match = re.search(windows_pattern, email_body, re.IGNORECASE)
        if windows_match and default_window:
            service_windows["Windows Build"] = {
                'start_date': default_window['start_date'],
                'start_time': default_window['start_time'],
                'end_date': default_window['end_date'],
                'end_time': default_window['end_time'],
                'impact': 'IMPACTED',
                'comments': SERVICES["Windows Build"]['default_impact']
            }
    
    return service_windows

def detect_impact(text, service_info):
    """Enhanced impact detection using service-specific indicators and better pattern matching."""
    if not text:
        return "NOT_IMPACTED"
        
    text_lower = text.lower()
   
    no_impact_patterns = [
        r"no\s+impact\s+for\s+users",
        r"no\s+impact",
        r"not\s+impact",
        r"no\s+expected\s+impact",
        r"transparent\s+to\s+users",
        r"impact:\s*none",
        r"impact\s*:\s*no",
        r"should be no impact",
        r"should\s+be\s+no\s+impact",
        r"none of our users",
        r"no\s+.*\s+impact",
        r"no impact for users",
        r"no expected impact",
        r"transparent to users",
        r"upgrade is transparent"
    ]
    
    # Strong indicator of no impact
    if re.search(r"no impact for users", text_lower):
        return "NOT_IMPACTED"
    
    if any(re.search(pattern, text_lower) for pattern in no_impact_patterns):
        if not re.search(r"no impact but", text_lower):
            return "NOT_IMPACTED"
    
    impact_indicators = service_info.get("impact_indicators", [])
    if any(indicator in text_lower for indicator in impact_indicators):
        if "minor glitch" in text_lower and "during switchover" in text_lower:
            # Minor glitches during switchover are often not considered major impacts
            return "NOT_IMPACTED"
        return "IMPACTED"
    
    general_impact_indicators = [
        "unavailable", "maintenance", "upgrade", "impact",
        "downtime", "pause", "paused", "stopped", "shut down", "shutdown",
        "offline", "reboot", "restart", "migration", "interruption",
        "not available", "cannot be accessed", "cannot be triggered",
        "rollout", "deploy", "update", "patching", "servers rebooted",
        "certificate update", "might get interrupted", "interrupted", "interruptions"
    ]
    
    if any(indicator in text_lower for indicator in general_impact_indicators):
        if "minor glitch" in text_lower and not any(major in text_lower for major in ["service will not be available", "not be available", "downtime"]):
            return "NOT_IMPACTED"
            
        if "should always be available" in text_lower or "should be available" in text_lower:
            return "NOT_IMPACTED"
        
        if "service may be unavailable for short time" in text_lower:
            return "IMPACTED"  # Short time still means impacted
            
        return "IMPACTED"
    
    return "NOT_IMPACTED"

def parse_email_content(email_data):
    """Completely revised email content parser with improved date and time handling."""
    try:
        body = email_data.get('body', '')
        subject = email_data.get('subject', '')
        
        base_date = extract_date_from_subject(subject)
        if not base_date:
            base_date = datetime.now().date()
        service_windows = extract_service_windows(body, base_date)
        services_data = []
        jenkins_pattern = r"Jenkins paused.*?(\d{1,2}):?(?:st|nd|rd|th)?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})"
        jenkins_match = re.search(jenkins_pattern, body, re.IGNORECASE)
        for service_name, service_info in SERVICES.items():
            window = service_windows.get(service_name)
            
            if window:
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
                service_data = {
                    'name': service_name,
                    'date': base_date.strftime("%Y-%m-%d"),
                    'start_time': "-",
                    'end_time': "-",
                    'end_date': base_date.strftime("%Y-%m-%d"),
                    'impact': 'NOT_IMPACTED',
                    'comments': "No Impact/Couldn't be determined."
                }
            
            services_data.append(service_data)
        
        # Fix any None end times in all service entries - update to use "-" instead of defaults
        for service_data in services_data:
            if service_data['end_time'] is None:
                service_data['end_time'] = "-"
            
            # Special case for ARM SELI & SERO with None end_time
            if service_data['name'] == "ARM SELI & SERO" and "ARM XRay DB" in body and "No impact for users" in body:
                service_data['end_time'] = "-"

            # Handle GitLab specially to extract 12:00 from the text
            if service_data['name'] == 'GitLab' and service_data['end_time'] == "-":
                gitlab_pattern = r"GitLab Production.*?Window:\s*\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*[–-]\s*(\d{1,2}[:\.]\d{2})"
                gitlab_match = re.search(gitlab_pattern, body, re.IGNORECASE | re.DOTALL)
                if gitlab_match:
                    service_data['end_time'] = normalize_time(gitlab_match.group(1))
    
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

def extract_gitlab_time_range(text):
    """Extract GitLab specific time range that may use dash or en-dash."""
    if not text:
        return None, None
        
    # GitLab often has time ranges with dash or en-dash
    time_range_pattern = r'(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})'
    match = re.search(time_range_pattern, text)
    if match:
        return match.group(1), match.group(2)
    return None, None

def normalize_time(time_str):
    """Normalize time string to ensure it's in proper format."""
    if not time_str:
        return None
    # Replace dots with colons
    return time_str.replace('.', ':')

def fix_gitlab_window(service_windows, email_body):
    """Special handling for GitLab to ensure end time is properly extracted."""
    if "GitLab" in service_windows and service_windows["GitLab"].get('end_time') is None:
        # Look for specific GitLab window formats
        gitlab_window_pattern = r'Window:\s*\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*[–-]\s*(\d{1,2}[:\.]\d{2})'
        gitlab_match = re.search(gitlab_window_pattern, email_body, re.IGNORECASE)
        if gitlab_match:
            end_time = normalize_time(gitlab_match.group(1))
            service_windows["GitLab"]['end_time'] = end_time
        else:
            # Use "-" instead of default time as requested
            service_windows["GitLab"]['end_time'] = "-"
    return service_windows

def fix_gerrit_window(service_windows, email_body):
    """Special handling for Gerrit EPK to ensure the right window is selected."""
    # Look for Gerrit Gamma specific window which has high priority
    gerrit_gamma_pattern = r'GitRMS-Gerrit Gamma.*?not be available.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}[:\.]\d{2})'
    gerrit_match = re.search(gerrit_gamma_pattern, email_body, re.IGNORECASE)
    if gerrit_match:
        date_str = gerrit_match.group(1)
        start_time = gerrit_match.group(2)
        end_time = normalize_time(gerrit_match.group(3))
        
        try:
            gerrit_date = datetime.fromisoformat(date_str)
            if "Gerrit EPK" not in service_windows or service_windows["Gerrit EPK"].get('start_time') != "08:00":
                service_windows["Gerrit EPK"] = {
                    'start_date': gerrit_date.date(),
                    'start_time': start_time,  # From the example
                    'end_date': gerrit_date.date(),
                    'end_time': end_time,    # From the example
                    'impact': 'IMPACTED',
                    'comments': SERVICES["Gerrit EPK"]['default_impact']
                }
        except:
            pass
    return service_windows

def fix_jenkins_window(service_windows, email_body):
    """Fix Jenkins time window to ensure it correctly handles cross-day windows."""
    # Check for specific Jenkins pattern with the exact format we need
    jenkins_pattern = r'Jenkins will be paused.*?Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*[–-]\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})'
    jenkins_match = re.search(jenkins_pattern, email_body, re.IGNORECASE)
    if jenkins_match:
        start_date_str, start_time, end_date_str, end_time = jenkins_match.groups()
        try:
            start_dt = datetime.fromisoformat(start_date_str)
            end_dt = datetime.fromisoformat(end_date_str)
            
            service_windows["Jenkins"] = {
                'start_date': start_dt.date(),
                'start_time': start_time,
                'end_date': end_dt.date(),
                'end_time': end_time,
                'impact': 'IMPACTED',
                'comments': SERVICES["Jenkins"]['default_impact']
            }
        except:
            pass
    return service_windows

def fix_arm_window(service_windows, email_body):
    """Fix ARM SELI & SERO to ensure proper impact detection."""
    arm_pattern = r'ARM XRay DB Vacuum cleaning.*?Impact:\s*(.*?)(?:Window|$)'
    arm_match = re.search(arm_pattern, email_body, re.IGNORECASE)
    if arm_match:
        impact_text = arm_match.group(1).strip().lower()
        if "no impact for users" in impact_text:
            if "ARM SELI & SERO" in service_windows:
                service_windows["ARM SELI & SERO"]['impact'] = 'NOT_IMPACTED'
                service_windows["ARM SELI & SERO"]['comments'] = "No Impact."
                # Set end_time to "-" as requested
                service_windows["ARM SELI & SERO"]['end_time'] = "-"
    return service_windows