#!/usr/bin/env python3
"""
Entry point for the Change Management Application
This replaces the original app.py and imports the modular application
"""

# Import the modular application
from app.main import app

if __name__ == '__main__':
    import os
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
