document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');
    const btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        errorDiv.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Logging in...';
        fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: form.username.value.trim(),
                password: form.password.value
            })
        })
        .then(res => res.json().then(data => ({ok: res.ok, data})))
        .then(({ok, data}) => {
            if (ok && data.status === 'success') {
                window.location.href = '/';
            } else {
                errorDiv.textContent = data.message || 'Login failed.';
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Log In';
            }
        })
        .catch(() => {
            errorDiv.textContent = 'Network error. Please try again.';
            errorDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Log In';
        });
    });
}); 