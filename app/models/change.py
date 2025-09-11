"""
Change model
This file contains the Change data model for the application
"""
from datetime import datetime
from typing import Optional, Dict, Any, List


class Change:
    """Change model representing a change management entry"""
    
    def __init__(self, header_title: str = 'Change Weekend', date: str = '', 
                 services: List[Dict[str, Any]] = None, last_edited_by: str = ''):
        self.header_title = header_title
        self.date = date
        self.services = services or []
        self.last_edited_by = last_edited_by
        self.timestamp = datetime.now().timestamp()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert change to dictionary for Redis storage"""
        return {
            'header_title': self.header_title,
            'date': self.date,
            'services': self.services,
            'last_edited_by': self.last_edited_by,
            'timestamp': self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Change':
        """Create change from dictionary (from Redis)"""
        return cls(
            header_title=data.get('header_title', 'Change Weekend'),
            date=data.get('date', ''),
            services=data.get('services', []),
            last_edited_by=data.get('last_edited_by', ''),
            timestamp=data.get('timestamp', datetime.now().timestamp())
        )
    
    def add_service(self, service: Dict[str, Any]):
        """Add a service to the change"""
        self.services.append(service)
    
    def remove_service(self, service_index: int):
        """Remove a service by index"""
        if 0 <= service_index < len(self.services):
            del self.services[service_index]
    
    def update_service(self, service_index: int, service: Dict[str, Any]):
        """Update a service by index"""
        if 0 <= service_index < len(self.services):
            self.services[service_index] = service
    
    def get_service_count(self) -> int:
        """Get the number of services"""
        return len(self.services)
    
    def __repr__(self):
        return f"Change(title='{self.header_title}', services={len(self.services)})"