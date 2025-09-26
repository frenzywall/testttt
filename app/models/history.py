"""
History model
This file contains the History data model for the application
"""
from datetime import datetime
from typing import Optional, Dict, Any
from .change import Change


class HistoryItem:
    """History item model representing a saved change management state"""
    
    def __init__(self, timestamp: float, title: str, date: str, data: Dict[str, Any]):
        self.timestamp = timestamp
        self.title = title
        self.date = date
        self.data = data
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert history item to dictionary for Redis storage"""
        return {
            'timestamp': self.timestamp,
            'title': self.title,
            'date': self.date,
            'data': self.data
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'HistoryItem':
        """Create history item from dictionary (from Redis)"""
        return cls(
            timestamp=data.get('timestamp', 0),
            title=data.get('title', ''),
            date=data.get('date', ''),
            data=data.get('data', {})
        )
    
    @classmethod
    def from_change(cls, change: Change, title: str = None) -> 'HistoryItem':
        """Create history item from a Change object"""
        return cls(
            timestamp=change.timestamp,
            title=title or change.header_title,
            date=change.date,
            data=change.to_dict()
        )
    
    def get_change(self) -> Change:
        """Get the Change object from this history item"""
        return Change.from_dict(self.data)
    
    def get_formatted_date(self) -> str:
        """Get formatted date string"""
        try:
            dt = datetime.fromtimestamp(self.timestamp)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except (ValueError, OSError):
            return self.date
    
    def get_service_count(self) -> int:
        """Get the number of services in this history item"""
        return len(self.data.get('services', []))
    
    def __repr__(self):
        return f"HistoryItem(timestamp={self.timestamp}, title='{self.title}')"