document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');
    const authSwitch = document.getElementById('authSwitch');
    const switchText = document.getElementById('switchText');
    const switchLink = document.getElementById('switchLink');
    
    let isSignupMode = false;
    
    // Check if signup is enabled
    fetch('/signup-enabled')
        .then(res => res.json())
        .then(data => {
            if (data.enabled) {
                // Show signup option
                authSwitch.style.display = 'block';
                switchText.textContent = "Don't have an account? ";
                switchLink.textContent = "Sign Up";
                switchLink.onclick = function(e) {
                    e.preventDefault();
                    toggleAuthMode();
                };
            } else {
                authSwitch.style.display = 'none';
            }
        })
        .catch(err => {
            console.error('Failed to check signup status:', err);
        });
    
    function toggleAuthMode() {
        isSignupMode = !isSignupMode;
        
        if (isSignupMode) {
            // Switch to signup mode
            btn.querySelector('span').textContent = 'Sign Up';
            switchText.textContent = 'Already have an account? ';
            switchLink.textContent = 'Sign In';
            form.username.placeholder = 'Choose Username';
            form.password.placeholder = 'Choose Password';
        } else {
            // Switch to login mode
            btn.querySelector('span').textContent = 'Log In';
            switchText.textContent = "Don't have an account? ";
            switchLink.textContent = 'Sign Up';
            form.username.placeholder = 'Username';
            form.password.placeholder = 'Password';
        }
        
        // Clear any previous messages
        errorDiv.style.display = 'none';
        form.username.value = '';
        form.password.value = '';
        form.username.focus();
    }
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        errorDiv.style.display = 'none';
        btn.disabled = true;
        
        const username = form.username.value.trim();
        const password = form.password.value;
        
        const endpoint = isSignupMode ? '/signup' : '/login';
        const loadingText = isSignupMode ? 'Creating Account...' : 'Logging in...';
        
        btn.querySelector('span').textContent = loadingText;
        
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json().then(data => ({ok: res.ok, data})))
        .then(({ok, data}) => {
            if (ok && data.status === 'success') {
                if (isSignupMode) {
                    // Show success message for signup
                    errorDiv.textContent = 'Sign Up Successful! You can now log in.';
                    errorDiv.className = 'signup-success';
                    errorDiv.style.display = 'block';
                    
                    // Switch back to login mode after 2 seconds
                    const SUCCESS_DELAY = 2000;
                    setTimeout(() => {
                        toggleAuthMode();
                        errorDiv.style.display = 'none';
                    }, SUCCESS_DELAY);
                } else {
                    // Redirect for successful login
                    window.location.href = '/';
                }
            } else {
                // Handle existing user case
                if (isSignupMode && data.message === 'existing_user_match') {
                    errorDiv.textContent = 'You already have an account. Please log in.';
                    errorDiv.className = 'login-error';
                    errorDiv.style.display = 'block';
                    
                    // Switch to login mode
                    const SUCCESS_DELAY = 2000;
                    setTimeout(() => {
                        toggleAuthMode();
                        errorDiv.style.display = 'none';
                    }, SUCCESS_DELAY);
                } else {
                    const errorMessage = data.message || (isSignupMode ? 'Signup failed.' : 'Login failed.');
                    // Better XSS protection - remove all HTML tags and special chars
                    const sanitizedMessage = errorMessage.replace(/[<>'"&]/g, '');
                    errorDiv.textContent = sanitizedMessage;
                    errorDiv.className = 'login-error';
                    errorDiv.style.display = 'block';
                }
            }
            btn.disabled = false;
            btn.querySelector('span').textContent = isSignupMode ? 'Sign Up' : 'Log In';
        })
        .catch(() => {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.className = 'login-error';
            errorDiv.style.display = 'block';
            btn.disabled = false;
            btn.querySelector('span').textContent = isSignupMode ? 'Sign Up' : 'Log In';
        });
    });
}); 