"""
User model
This file contains the User data model for the application
"""
from datetime import datetime
from typing import Optional, Dict, Any


class User:
    """User model representing a user in the system"""
    
    def __init__(self, username: str, password: str, role: str = 'user', 
                 last_login: str = '-', created_by: str = 'admin'):
        self.username = username
        self.password = password  # This should be hashed
        self.role = role
        self.last_login = last_login
        self.created_by = created_by
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert user to dictionary for Redis storage"""
        return {
            'username': self.username,
            'password': self.password,
            'role': self.role,
            'last_login': self.last_login,
            'created_by': self.created_by
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'User':
        """Create user from dictionary (from Redis)"""
        return cls(
            username=data.get('username', ''),
            password=data.get('password', ''),
            role=data.get('role', 'user'),
            last_login=data.get('last_login', '-'),
            created_by=data.get('created_by', 'admin')
        )
    
    def is_admin(self) -> bool:
        """Check if user is an admin"""
        return self.role == 'admin'
    
    def update_last_login(self):
        """Update last login timestamp"""
        self.last_login = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    def __repr__(self):
        return f"User(username='{self.username}', role='{self.role}')"