"""
Email processing service
This file contains the FileProcessor class and related functionality from app.py
"""
import os
import re
from datetime import datetime
import extract_msg
from dateutil import parser

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

class FileProcessor:
    """Abstract file processor to support multiple file formats"""
    
    @staticmethod
    def get_supported_extensions():
        """Return list of supported file extensions"""
        return ['.msg', '.txt', '.eml', '.html', '.htm']
    
    @staticmethod
    def can_process_file(filename):
        """Check if file can be processed"""
        if not filename:
            return False
        ext = os.path.splitext(filename.lower())[1]
        return ext in FileProcessor.get_supported_extensions()
    
    @staticmethod
    def process_file(file_path, filename):
        """Process file and extract email-like data"""
        ext = os.path.splitext(filename.lower())[1]
        
        if ext == '.msg':
            return FileProcessor._process_msg(file_path)
        elif ext == '.txt':
            return FileProcessor._process_txt(file_path)
        elif ext == '.eml':
            return FileProcessor._process_eml(file_path)
        elif ext in ['.html', '.htm']:
            return FileProcessor._process_html(file_path)
        else:
            raise ValueError(f"Unsupported file format: {ext}")
    
    @staticmethod
    def _process_msg(file_path):
        """Process Outlook .msg file"""
        msg = extract_msg.Message(file_path)
        maintenance_date = extract_date_from_subject(msg.subject)
        if not maintenance_date:
            if isinstance(msg.date, datetime):
                msg_date = msg.date
            else:
                msg_date = parser.parse(msg.date)
            maintenance_date = msg_date.strftime("%Y-%m-%d")
        
        return {
            'subject': msg.subject,
            'sender': msg.sender,
            'date': maintenance_date,
            'body': msg.body
        }
    
    @staticmethod
    def _process_txt(file_path):
        """Process plain text file - minimal processing, let AI do the work"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Simple extraction - just get first line as potential subject
            lines = content.split('\n')
            subject = lines[0].strip() if lines and lines[0].strip() else "Content"
            
            # Use current date as default - AI will extract actual dates
            date_str = datetime.now().strftime("%Y-%m-%d")
            
            return {
                'subject': subject,
                'sender': 'Unknown',
                'date': date_str,
                'body': content
            }
        except Exception as e:
            # Return minimal data on any error
            return {
                'subject': 'Content',
                'sender': 'Unknown',
                'date': datetime.now().strftime("%Y-%m-%d"),
                'body': 'Error reading file content'
            }
    
    @staticmethod
    def _process_eml(file_path):
        """Process .eml file - minimal processing, let AI do the work"""
        try:
            import email
            from email import policy
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                msg = email.message_from_file(f, policy=policy.default)
            
            subject = msg.get('subject', 'Email Content')
            sender = msg.get('from', 'Unknown')
            
            # Extract body
            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        body = part.get_content()
                        break
            else:
                body = msg.get_content()
            
            return {
                'subject': subject,
                'sender': sender,
                'date': datetime.now().strftime("%Y-%m-%d"),
                'body': body
            }
        except Exception as e:
            return {
                'subject': 'Email Content',
                'sender': 'Unknown',
                'date': datetime.now().strftime("%Y-%m-%d"),
                'body': 'Error reading email content'
            }
    
    @staticmethod
    def _process_html(file_path):
        """Process HTML file - minimal processing, let AI do the work"""
        try:
            from bs4 import BeautifulSoup
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            soup = BeautifulSoup(content, 'html.parser')
            
            # Extract title/subject
            title = soup.find('title')
            subject = title.get_text() if title else "HTML Content"
            
            # Extract body text
            body = soup.get_text()
            
            return {
                'subject': subject,
                'sender': 'Unknown',
                'date': datetime.now().strftime("%Y-%m-%d"),
                'body': body
            }
        except Exception as e:
            return {
                'subject': 'HTML Content',
                'sender': 'Unknown',
                'date': datetime.now().strftime("%Y-%m-%d"),
                'body': 'Error reading HTML content'
            }
