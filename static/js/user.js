// User/profile modal logic
// To be used with a modal in result.html
function showProfileModal(user) {
    // Create modal if not exists
    let modal = document.getElementById('profileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content profile-modal-content split-modal larger-modal">
                <div class="profile-left">
                    <div class="modal-header">
                        <h2><span class="profile-glow"><i class="fas fa-user-circle"></i></span> Profile</h2>
                        <span class="close" id="closeProfileModal">&times;</span>
                    </div>
                    <div class="profile-status">
                        <span>Status: <b id="profileStatus"></b></span>
                        <span>Username: <b id="profileUsername"></b></span>
                    </div>
                    <div class="profile-actions">
                        <button id="logoutBtn" class="btn danger-btn">Log Out</button>
                        <button id="changePwBtn" class="btn secondary-btn">Change Password</button>
                    </div>
                    <div id="changePwSection" style="display:none; margin-top:1rem;">
                        <button id="closePwBtn" class="btn close-btn" style="background:none;color:#fff;font-size:1.3rem;line-height:1;margin-right:0.7rem;">&times;</button>
                        <input type="text" id="oldPw" placeholder="Old Password">
                        <input type="text" id="newPw" placeholder="New Password">
                        <button id="submitPwBtn" class="btn success-btn">Update Password</button>
                    </div>
                    <div class="add-user-card">
                      <div class="add-user-card-inner">
                        <div class="add-user-header" style="display:flex;align-items:center;justify-content:space-between;">
                          <h4 style="margin:0;"><i class="fas fa-user-plus"></i> Add New User</h4>
                        </div>
                        <div class="add-user-fields">
                          <div class="input-icon-group">
                            <i class="fas fa-user"></i>
                            <input type="text" id="newUser" placeholder="New Username" autocomplete="off">
                          </div>
                          <div class="input-icon-group">
                            <i class="fas fa-lock"></i>
                            <input type="text" id="newUserPw" placeholder="New User Password" autocomplete="off">
                          </div>
                          <button id="addUserBtn" class="btn primary-btn add-user-btn">
                            <i class="fas fa-plus"></i> Add User
                          </button>
                          <div id="addUserMsg" class="profile-msg" style="display:none;"></div>
                        </div>
                      </div>
                    </div>

                </div>
                <div class="profile-right">
                    <div id="adminSection" style="margin:0;">
                        <h3>User Management</h3>
                        <div style="display:flex;align-items:center;gap:0.7rem;margin-bottom:0.3rem;">
                            <input type="text" id="userSearch" class="user-search" placeholder="Search users..." autocomplete="off">
                            <span id="userSortIcon" class="user-sort-icon" style="cursor:pointer;font-size:1.3rem;display:flex;align-items:center;" title="Sort by Last Login">
                                <i class="fas fa-sort-amount-down-alt"></i>
                            </span>
                            <span id="userRefreshIcon" class="user-refresh-icon" style="cursor:pointer;font-size:1.3rem;display:flex;align-items:center;margin-left:0.5rem;" title="Refresh User List">
                                <i class="fas fa-sync-alt"></i>
                            </span>
                            <span id="signupToggleIcon" class="signup-toggle-icon" style="cursor:pointer;font-size:1.3rem;display:flex;align-items:center;margin-left:0.5rem;color:#94a3b8;transition:color 0.2s;" title="Sign Up Settings" onmouseover="this.style.color='#3b82f6'" onmouseout="this.style.color='#94a3b8'">
                                <i class="fas fa-user-plus"></i>
                            </span>
                        </div>
                        <div class="user-mgmt-card">
                            <div id="userList"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add iPhone notch for admin settings
        const settingsNotch = document.createElement('div');
        settingsNotch.className = 'settings-notch';
        settingsNotch.id = 'adminSettingsNotch';
        settingsNotch.style.cssText = `
            position: fixed;
            top: -60px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 320px;
            min-height: 120px;
            border-radius: 0 0 20px 20px;
            background: rgba(60, 60, 67, 0.78);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
            color: rgba(255, 255, 255, 0.87);
            font-weight: 500;
            font-size: 15px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            letter-spacing: -0.24px;
            text-align: center;
            user-select: none;
            pointer-events: none;
            transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            padding: 1rem;
            opacity: 0;
            visibility: hidden;
        `;
        settingsNotch.innerHTML = `
            <div class="settings-title" style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #ffffff;">Sign Up Settings</div>
            <div class="setting-option" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 0.5rem;">
                <div class="setting-label" style="color: #e2e8f0; font-size: 0.9rem;">Enable Public Sign Up</div>
                <div class="toggle-switch" id="signupToggle" style="position: relative; width: 44px; height: 24px; background: #475569; border-radius: 12px; cursor: pointer; transition: background 0.3s;">
                    <div class="toggle-slider" style="position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #ffffff; border-radius: 50%; transition: transform 0.3s;"></div>
                </div>
            </div>
            <div class="setting-description" style="color: #94a3b8; font-size: 0.8rem; line-height: 1.4; text-align: left;">
                When enabled, new users can create accounts on the login page
            </div>
            <div id="signupToggleMsg" class="profile-msg" style="display: none; margin-top: 0.5rem;"></div>
        `;
        document.body.appendChild(settingsNotch);
    }
    // Fill info
    document.getElementById('profileStatus').textContent = user.role === 'admin' ? 'Admin' : 'User';
    document.getElementById('profileUsername').textContent = user.username;
    // Show admin section and add user card only if admin
    if(user.role === 'admin') {
        document.querySelector('.profile-right').style.display = '';
        document.querySelector('.add-user-card').style.display = '';
    } else {
        document.querySelector('.profile-right').style.display = 'none';
        const addUserCard = document.querySelector('.add-user-card');
        if(addUserCard) addUserCard.style.display = 'none';
    }
    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Close logic
    document.getElementById('closeProfileModal').onclick = function() {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };
    // Logout
    document.getElementById('logoutBtn').onclick = function() {
        createConfirmDialog({
            type: 'danger',
            icon: 'fa-sign-out-alt',
            title: 'Logout',
            message: 'Are you sure you want to log out?',
            confirmText: 'Logout',
            cancelText: 'Cancel'
        }).then(confirmed => {
            if (!confirmed) return;
            // Clear local reauth cache on manual logout
            localStorage.removeItem('reauthUntil');
            localStorage.removeItem('reauthUser');
            // Clear all local caches on manual logout
            if (window.historyCache) {
                window.historyCache.invalidateCache();
            }
            fetch('/logout', {method:'POST'}).then(()=>window.location='/login');
        });
    };
    // Change password
    document.getElementById('changePwBtn').onclick = function() {
        const section = document.getElementById('changePwSection');
        if (section.style.display === '' || section.style.display === 'block') {
            section.style.display = 'none';
            // Only show add-user-card if admin
            if(user.role === 'admin') {
            document.querySelector('.add-user-card').style.display = '';
            } else {
                document.querySelector('.add-user-card').style.display = 'none';
            }
        } else {
            // Modern card layout for change password
            section.innerHTML = `
              <div class="change-password-card">
                <div class="change-password-header">
                  <h4><i class="fas fa-key"></i> Change Password</h4>
                  <button id="closePwBtn" class="btn close-btn" title="Close">&times;</button>
                </div>
                <div class="change-password-fields">
                  <div class="input-icon-group">
                    <i class="fas fa-key"></i>
                    <input type="password" id="oldPw" placeholder="Old Password" autocomplete="current-password">
                  </div>
                  <div class="input-icon-group">
                    <i class="fas fa-lock"></i>
                    <input type="password" id="newPw" placeholder="New Password" autocomplete="new-password">
                  </div>
                  <button id="submitPwBtn" class="btn success-btn change-password-btn">
                    <i class="fas fa-sync-alt"></i> Update Password
                  </button>
                </div>
                <div id="changePwMsg" class="profile-msg"></div>
              </div>
            `;
            section.style.display = '';
            // Only hide add-user-card if admin, otherwise always hidden for non-admin
            if(user.role === 'admin') {
                document.querySelector('.add-user-card').style.display = 'none';
            } else {
            document.querySelector('.add-user-card').style.display = 'none';
            }
            // Attach close and submit handlers
            document.getElementById('closePwBtn').onclick = function() {
                section.style.display = 'none';
                // Only show add-user-card if admin
                if(user.role === 'admin') {
                document.querySelector('.add-user-card').style.display = '';
                } else {
                    document.querySelector('.add-user-card').style.display = 'none';
                }
            };
            document.getElementById('submitPwBtn').onclick = function() {
                const submitBtn = this;
                const oldPw = document.getElementById('oldPw').value;
                const newPw = document.getElementById('newPw').value;
                const msgDiv = document.getElementById('changePwMsg');
                // Clear previous message
                msgDiv.textContent = '';
                msgDiv.className = 'profile-msg';
                // Validation: both fields required
                if (!oldPw || !newPw) {
                    msgDiv.textContent = 'Please fill in all fields.';
                    msgDiv.classList.add('error-msg');
                    return;
                }
                // Prevent double submission
                submitBtn.disabled = true;
                fetch('/change-password', {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({old_password:oldPw,new_password:newPw})
                }).then(r=>r.json()).then(data=>{
                    msgDiv.textContent = data.status==='success'?'Password updated!':(data.message||'Error');
                    msgDiv.className = 'profile-msg';
                    if(data.status==='success') {
                        msgDiv.classList.add('success-msg');
                        document.getElementById('oldPw').value = '';
                        document.getElementById('newPw').value = '';
                        setTimeout(()=>{
                            section.style.display = 'none';
                            if(user.role === 'admin') {
                                document.querySelector('.add-user-card').style.display = '';
                            } else {
                                document.querySelector('.add-user-card').style.display = 'none';
                            }
                        }, 1200);
                    } else {
                        msgDiv.classList.add('error-msg');
                    }
                    submitBtn.disabled = false;
                }).catch(()=>{
                    msgDiv.textContent = 'Unable to update password';
                    msgDiv.className = 'profile-msg error-msg';
                    submitBtn.disabled = false;
                });
                // Clear message on input
                document.getElementById('oldPw').oninput = document.getElementById('newPw').oninput = function() {
                    msgDiv.textContent = '';
                    msgDiv.className = 'profile-msg';
                };
                    };
        

    }
};
    document.getElementById('closePwBtn').onclick = function() {
        document.getElementById('changePwSection').style.display = 'none';
        document.getElementById('addUserForm').style.display = '';
    };
    document.getElementById('submitPwBtn').onclick = function() {
        const oldPw = document.getElementById('oldPw').value;
        const newPw = document.getElementById('newPw').value;
        fetch('/change-password', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({old_password:oldPw,new_password:newPw})
        }).then(r=>r.json()).then(data=>{
            document.getElementById('profileMsg').textContent = data.status==='success'?'Password updated!':(data.message||'Error');
            if(data.status==='success') {
                document.getElementById('oldPw').value = '';
                document.getElementById('newPw').value = '';
                document.getElementById('changePwSection').style.display = 'none';
                document.getElementById('addUserForm').style.display = '';
            }
        }).catch(()=>{
            document.getElementById('profileMsg').textContent = 'Unable to update password';
            document.getElementById('profileMsg').className = 'profile-msg error-msg';
        });
    };
    // Admin user management
    if(user.role==='admin'){
        let userSortOrder = 'desc'; // 'desc' for newest first, 'asc' for oldest first
        function refreshUsers(){
            fetch('/users')
                .then(r => r.json())
                .then(data => {
                    const list = document.getElementById('userList');
                    list.innerHTML = '';
                    const users = (data.users||[]);
                    const searchVal = (document.getElementById('userSearch')?.value||'').toLowerCase();
                    let filteredUsers = users.filter(uobj => uobj.username.toLowerCase().includes(searchVal));
                    if(userSortOrder==='desc') {
                        filteredUsers = filteredUsers.slice().sort((a,b)=>{
                            if(a.last_login==='-' && b.last_login==='-') return 0;
                            if(a.last_login==='-') return 1;
                            if(b.last_login==='-') return -1;
                            return b.last_login.localeCompare(a.last_login);
                        });
                    } else if(userSortOrder==='asc') {
                        filteredUsers = filteredUsers.slice().sort((a,b)=>{
                            if(a.last_login==='-' && b.last_login==='-') return 0;
                            if(a.last_login==='-') return 1;
                            if(b.last_login==='-') return -1;
                            return a.last_login.localeCompare(b.last_login);
                        });
                    }
                    // User count and divider
                    const countDiv = document.createElement('div');
                    countDiv.className = 'user-count';
                    countDiv.innerHTML = `<span><b>${filteredUsers.length}</b> User${filteredUsers.length!==1?'s':''}</span>`;
                    list.appendChild(countDiv);
                    if(filteredUsers.length>0){
                        const divider = document.createElement('div');
                        divider.className = 'user-divider';
                        list.appendChild(divider);
                    }
                    // User list scrollable
                    if(filteredUsers.length === 0) {
                        const emptyMsg = document.createElement('div');
                        emptyMsg.className = 'user-list-empty';
                        emptyMsg.style.cssText = 'padding:2.5rem 0;text-align:center;color:#64748b;font-size:1.13rem;opacity:0.85;';
                        emptyMsg.innerHTML = '<i class="fas fa-user-slash" style="font-size:1.5rem;margin-bottom:0.5rem;display:block;"></i>No users found';
                        list.appendChild(emptyMsg);
                        return;
                    }
                    const scrollWrap = document.createElement('div');
                    scrollWrap.className = 'user-list-scroll';
                    filteredUsers.forEach(uobj=>{
                        const u = uobj.username;
                        let lastLogin = uobj.last_login || '-';
                        if (lastLogin && lastLogin !== '-') {
                            try {
                                const d = new Date(lastLogin);
                                if (!isNaN(d)) {
                                    lastLogin = d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                }
                            } catch (e) {}
                        }
                        // Add refresh icon for animation
                        const lastLoginHtml = `<span class="user-last-login">Last login: <b>${lastLogin}</b> <i class="fas fa-sync-alt last-login-refresh" style="margin-left:6px;"></i></span>`;
                        const card = document.createElement('div');
                        card.className = 'user-card';
                        // Avatar/initials
                        const avatar = document.createElement('div');
                        avatar.className = 'user-avatar';
                        avatar.textContent = u[0].toUpperCase();
                        card.appendChild(avatar);
                        // Username and last login
                        const info = document.createElement('div');
                        info.className = 'user-info';
                        const createdBy = uobj.created_by || 'admin';
                        const indicator = createdBy === 'signup' ? 
                            '<span class="user-signup-indicator" title="Self-signed up"><i class="fas fa-user-plus"></i></span>' : 
                            '<span class="user-admin-indicator" title="Added by admin"><i class="fas fa-user-cog"></i></span>';
                        const roleIndicator = uobj.role === 'admin' ? 
                            '<span class="user-role-admin" title="Admin User"><i class="fas fa-shield-alt"></i></span>' : 
                            '<span class="user-role-user" title="Regular User"><i class="fas fa-user"></i></span>';
                        info.innerHTML = `<div class="user-name-row"><span class="user-name">${u}</span>${indicator}${roleIndicator}</div>${lastLoginHtml}`;
                        card.appendChild(info);
                        // Actions
                        const actions = document.createElement('div');
                        actions.className = 'user-actions';
                        // Edit button
                        const edit = document.createElement('button');
                        edit.innerHTML = '<i class="fas fa-edit"></i>';
                        edit.className = 'btn user-edit-btn';
                        edit.title = 'Edit Password';
                        // Logout button
                        const logout = document.createElement('button');
                        logout.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
                        logout.className = 'btn user-logout-btn';
                        logout.title = 'Logout User';
                        
                        // Make Admin button (show for all users except the current admin)
                        const makeAdmin = document.createElement('button');
                        makeAdmin.innerHTML = uobj.role === 'admin' ? '<i class="fas fa-user-minus"></i>' : '<i class="fas fa-user-shield"></i>';
                        makeAdmin.className = 'btn user-admin-btn';
                        makeAdmin.title = uobj.role === 'admin' ? 'Remove Admin' : 'Make Admin';
                        // Don't show the button for the current user (prevent self-demotion)
                        makeAdmin.style.display = (u === user.username) ? 'none' : 'inline-block';
                        
                        // Delete button
                        const del = document.createElement('button');
                        del.innerHTML = '<i class="fas fa-trash"></i>';
                        del.className = 'btn user-delete-btn';
                        del.title = 'Delete User';
                        // Inline password edit logic
                        let editing = false;
                        edit.onclick = function() {
                            if (editing) return;
                            editing = true;
                            
                            // Hide other elements during edit
                            const avatar = card.querySelector('.user-avatar');
                            const userInfo = card.querySelector('.user-info');
                            const userActions = card.querySelector('.user-actions');
                            
                            if (avatar) avatar.style.display = 'none';
                            if (userInfo) userInfo.style.display = 'none';
                            if (userActions) userActions.style.display = 'none';
                            
                            // Remove any other open editors
                            document.querySelectorAll('.user-edit-inline').forEach(e=>e.remove());
                            
                            // Create edit form
                            const editForm = document.createElement('div');
                            editForm.className = 'user-edit-inline';
                            editForm.innerHTML = `
                                <div style="display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.3rem;">
                                    <div style="font-weight: 600; color: #eaf1fb; font-size: 1rem; letter-spacing: 0.01em;">${u}</div>
                                    <div style="font-size: 0.8rem; color: #60a5fa; font-weight: 500;">Change Password</div>
                                </div>
                                <div class="input-row">
                                    <input type="password" placeholder="New Password" autocomplete="new-password">
                                    <button class="btn save-btn">
                                        <i class="fas fa-check"></i>
                                        Save
                                    </button>
                                    <button class="btn cancel-btn">
                                        <i class="fas fa-times"></i>
                                        Cancel
                                    </button>
                                </div>
                                <div class="user-edit-msg"></div>
                            `;
                            
                            card.appendChild(editForm);
                            
                            // Focus on input
                            setTimeout(() => {
                                const inputField = editForm.querySelector('input[type="password"]');
                                if (inputField) {
                                    inputField.focus();
                                }
                            }, 100);
                            
                            // Clear error message when user starts typing
                            const inputField = editForm.querySelector('input[type="password"]');
                            if (inputField) {
                                inputField.addEventListener('input', function() {
                                    const msgElement = editForm.querySelector('.user-edit-msg');
                                    if (msgElement && msgElement.textContent.includes('Enter password')) {
                                        msgElement.textContent = '';
                                        msgElement.className = 'user-edit-msg';
                                    }
                                });
                            }
                            
                            // Save/cancel logic
                            const restoreLayout = () => {
                                if (avatar) avatar.style.display = 'flex';
                                if (userInfo) userInfo.style.display = 'flex';
                                if (userActions) userActions.style.display = 'flex';
                                editForm.remove();
                                editing = false;
                            };
                            
                            editForm.querySelector('.cancel-btn').onclick = function() {
                                restoreLayout();
                            };
                            
                            editForm.querySelector('.save-btn').onclick = function() {
                                const inputField = editForm.querySelector('input[type="password"]');
                                const msgElement = editForm.querySelector('.user-edit-msg');
                                
                                if (!inputField) {
                                    console.error('Password input field not found');
                                    return;
                                }
                                
                                const npw = inputField.value;
                                if (!npw) {
                                    if (msgElement) {
                                        msgElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Enter password';
                                        msgElement.className = 'user-edit-msg error';
                                    }
                                    return;
                                }
                                
                                // Disable buttons during save
                                const saveBtn = editForm.querySelector('.save-btn');
                                const cancelBtn = editForm.querySelector('.cancel-btn');
                                if (saveBtn) saveBtn.disabled = true;
                                if (cancelBtn) cancelBtn.disabled = true;
                                if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                                
                                fetch('/users',{
                                    method:'PUT',
                                    headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({username:u,password:npw})
                                }).then(r=>r.json()).then(data=>{
                                    if(data.status==='success') {
                                        createNotification('success', 'Password updated successfully!');
                                        setTimeout(()=>{
                                            restoreLayout();
                                        }, 500);
                                    } else {
                                        if (msgElement) {
                                            msgElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (data.message || 'Error');
                                            msgElement.className = 'user-edit-msg error';
                                        }
                                        if (saveBtn) {
                                            saveBtn.disabled = false;
                                            saveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
                                        }
                                        if (cancelBtn) cancelBtn.disabled = false;
                                    }
                                }).catch(() => {
                                    if (msgElement) {
                                        msgElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Network error';
                                        msgElement.className = 'user-edit-msg error';
                                    }
                                    if (saveBtn) {
                                        saveBtn.disabled = false;
                                        saveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
                                    }
                                    if (cancelBtn) cancelBtn.disabled = false;
                                });
                            };
                        };
                        actions.appendChild(edit);
                        actions.appendChild(logout);
                        actions.appendChild(makeAdmin);
                        actions.appendChild(del);
                        
                        // Logout button functionality
                        logout.onclick = function(){
                            createConfirmDialog({
                                type: 'warning',
                                icon: 'fa-sign-out-alt',
                                title: 'Logout User',
                                message: `Are you sure you want to log out user <b>${u}</b>? They will be redirected to the login page.`,
                                confirmText: 'Logout',
                                cancelText: 'Cancel'
                            }).then(confirmed => {
                                if (!confirmed) return;
                                fetch('/admin-logout-user',{
                                    method:'POST',
                                    headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({username:u})
                                }).then(r=>r.json()).then(data=>{
                                    if(data.status==='success') {
                                        createNotification('success', `Logout request sent for user ${u}`);
                                    } else {
                                        createNotification('error', data.message || 'Failed to send logout request');
                                    }
                                });
                            });
                        };
                        
                        // Make Admin button functionality
                        makeAdmin.onclick = function(){
                            const isCurrentlyAdmin = uobj.role === 'admin';
                            const action = isCurrentlyAdmin ? 'remove admin privileges from' : 'grant admin privileges to';
                            
                            createConfirmDialog({
                                type: 'warning',
                                icon: 'fa-user-shield',
                                title: isCurrentlyAdmin ? 'Remove Admin Privileges' : 'Grant Admin Privileges',
                                message: `Are you sure you want to ${action} user <b>${u}</b>? This will ${isCurrentlyAdmin ? 'restrict' : 'grant'} their access to admin features.`,
                                confirmText: isCurrentlyAdmin ? 'Remove Admin' : 'Make Admin',
                                cancelText: 'Cancel'
                            }).then(confirmed => {
                                if (!confirmed) return;
                                
                                const newRole = isCurrentlyAdmin ? 'user' : 'admin';
                                fetch('/update-user-role',{
                                    method:'POST',
                                    headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({username:u, role:newRole})
                                }).then(r=>r.json()).then(data=>{
                                    if(data.status==='success') {
                                        createNotification('success', data.message || `User ${u} role updated successfully!`);
                                        refreshUsers(); // Refresh the user list to update the UI
                                    } else {
                                        createNotification('error', data.message || 'Failed to update user role');
                                    }
                                }).catch(() => {
                                    createNotification('error', 'Network error while updating user role');
                                });
                            });
                        };
                        
                        del.onclick = function(){
                            createConfirmDialog({
                                type: 'danger',
                                icon: 'fa-trash',
                                title: 'Delete User',
                                message: `Are you sure you want to delete user <b>${u}</b>? This action cannot be undone.`,
                                confirmText: 'Delete',
                                cancelText: 'Cancel'
                            }).then(confirmed => {
                                if (!confirmed) return;
                                fetch('/users',{
                                    method:'DELETE',
                                    headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({username:u})
                                }).then(r=>r.json()).then(data=>{
                                    if(data.status==='success') {
                                        refreshUsers();
                                        createNotification('success', 'User deleted successfully!');
                                    } else {
                                        createNotification('error', data.message || 'Failed to delete user');
                                    }
                                }).catch(() => {
                                    createNotification('error', 'Network error while deleting user');
                                });
                            });
                        };
                        card.appendChild(actions);
                        scrollWrap.appendChild(card);
                    });
                    list.appendChild(scrollWrap);
                })
                .catch(err => {
                    const list = document.getElementById('userList');
                    list.innerHTML = '';
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'user-list-empty';
                    errorMsg.style.cssText = 'padding:2.5rem 0;text-align:center;color:#ef4444;font-size:1.13rem;opacity:0.95;';
                    errorMsg.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:1.5rem;margin-bottom:0.5rem;display:block;"></i>Failed to load users';
                    list.appendChild(errorMsg);
                });
        }
        refreshUsers();
        const userSearch = document.getElementById('userSearch');
        if(userSearch) {
            userSearch.oninput = refreshUsers;
        }
        // Sort icon logic
        const userSortIcon = document.getElementById('userSortIcon');
        if(userSortIcon) {
            userSortIcon.onclick = function() {
                userSortOrder = userSortOrder === 'desc' ? 'asc' : 'desc';
                // Change icon direction
                const icon = userSortIcon.querySelector('i');
                if(userSortOrder==='desc') {
                    icon.className = 'fas fa-sort-amount-down-alt';
                    userSortIcon.title = 'Sort by Last Login (Newest First)';
                } else {
                    icon.className = 'fas fa-sort-amount-up-alt';
                    userSortIcon.title = 'Sort by Last Login (Oldest First)';
                }
                refreshUsers();
            };
            // Set initial icon
            userSortIcon.title = 'Sort by Last Login (Newest First)';
        }
        // Refresh icon logic
        const userRefreshIcon = document.getElementById('userRefreshIcon');
        if(userRefreshIcon) {
            userRefreshIcon.onclick = function() {
                userRefreshIcon.classList.add('spinning');
                Promise.resolve(refreshUsers()).finally(() => {
                    setTimeout(() => userRefreshIcon.classList.remove('spinning'), 600);
                });
            };
        }
        document.getElementById('addUserBtn').onclick = function(){
            const nu = document.getElementById('newUser').value.trim();
            const npw = document.getElementById('newUserPw').value;
            const msgDiv = document.getElementById('addUserMsg');
            msgDiv.style.display = '';
            msgDiv.textContent = '';
            msgDiv.className = 'profile-msg';
            // Validation: both fields required
            if (!nu || !npw) {
                msgDiv.textContent = 'Please fill in all fields.';
                msgDiv.classList.add('error-msg');
                return;
            }
            fetch('/users',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({username:nu,password:npw})
            }).then(r=>r.json()).then(data=>{
                if (data.status === 'success') {
                    msgDiv.textContent = 'User added!';
                    msgDiv.className = 'profile-msg success-msg';
                } else {
                    msgDiv.textContent = data.message || 'Error';
                    msgDiv.className = 'profile-msg error-msg';
                }
                // Clear form fields
                document.getElementById('newUser').value = '';
                document.getElementById('newUserPw').value = '';
                // Fade out the message after 2.5s
                setTimeout(() => {
                    msgDiv.style.display = 'none';
                    msgDiv.textContent = '';
                    msgDiv.className = 'profile-msg';
                }, 2500);
                refreshUsers();
            }).catch(()=>{
                msgDiv.textContent = 'Unable to add user';
                msgDiv.className = 'profile-msg error-msg';
                // Don't clear form fields on network error
                // Don't auto-hide the error message
            });
            // Clear message on input
            document.getElementById('newUser').oninput = document.getElementById('newUserPw').oninput = function() {
                msgDiv.textContent = '';
                msgDiv.className = 'profile-msg';
                msgDiv.style.display = 'none';
            };
        };
        
        // Signup toggle functionality for admin
        setTimeout(() => {
            const signupToggleIcon = document.getElementById('signupToggleIcon');
            const adminSettingsNotch = document.getElementById('adminSettingsNotch');
            const signupToggle = document.getElementById('signupToggle');
            const signupToggleMsg = document.getElementById('signupToggleMsg');
            let settingsTimeout;
            
            if (signupToggleIcon && adminSettingsNotch) {
                // Signup toggle icon click handler
                signupToggleIcon.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Load current signup status
                    fetch('/signup-enabled')
                        .then(r => r.json())
                        .then(data => {
                            if (data.enabled) {
                                signupToggle.classList.add('active');
                                signupToggle.style.background = '#3b82f6';
                                signupToggle.querySelector('.toggle-slider').style.transform = 'translateX(20px)';
                            } else {
                                signupToggle.classList.remove('active');
                                signupToggle.style.background = '#475569';
                                signupToggle.querySelector('.toggle-slider').style.transform = 'translateX(0)';
                            }
                        })
                        .catch(err => {
                            console.error('Failed to load signup status:', err);
                        });
                    
                    adminSettingsNotch.classList.add('active');
                    adminSettingsNotch.style.pointerEvents = 'auto';
                    adminSettingsNotch.style.opacity = '1';
                    adminSettingsNotch.style.visibility = 'visible';
                    requestAnimationFrame(() => {
                        adminSettingsNotch.style.top = '0px';
                    });
                    
                    clearTimeout(settingsTimeout);
                    settingsTimeout = setTimeout(() => {
                        hideAdminSettingsNotch();
                    }, 5000);
                });
                
                // Signup toggle functionality
                if (signupToggle) {
                    signupToggle.onclick = function() {
                        
                        // Show loading state
                        this.style.pointerEvents = 'none';
                        signupToggleMsg.style.display = '';
                        signupToggleMsg.textContent = 'Updating...';
                        signupToggleMsg.className = 'profile-msg info-msg';
                        
                        fetch('/toggle-signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        })
                        .then(r => r.json())
                        .then(data => {
                            if (data.status === 'success') {
                                if (data.enabled) {
                                    this.classList.add('active');
                                    this.style.background = '#3b82f6';
                                    this.querySelector('.toggle-slider').style.transform = 'translateX(20px)';
                                    signupToggleMsg.textContent = 'Sign-up enabled!';
                                    signupToggleMsg.className = 'profile-msg success-msg';
                                } else {
                                    this.classList.remove('active');
                                    this.style.background = '#475569';
                                    this.querySelector('.toggle-slider').style.transform = 'translateX(0)';
                                    signupToggleMsg.textContent = 'Sign-up disabled!';
                                    signupToggleMsg.className = 'profile-msg info-msg';
                                }
                                
                                // Force refresh the login page signup status
                                if (window.location.pathname === '/login') {
                                    window.location.reload();
                                }
                            } else {
                                signupToggleMsg.textContent = data.message || 'Failed to update setting';
                                signupToggleMsg.className = 'profile-msg error-msg';
                            }
                        })
                        .catch(err => {
                            console.error('Toggle error:', err);
                            signupToggleMsg.textContent = 'Network error';
                            signupToggleMsg.className = 'profile-msg error-msg';
                        })
                        .finally(() => {
                            this.style.pointerEvents = '';
                            setTimeout(() => {
                                signupToggleMsg.style.display = 'none';
                            }, 3000);
                        });
                    };
                }
                
                // Hide settings notch when clicking outside
                const outsideClickHandler = function(e) {
                    if (adminSettingsNotch && signupToggleIcon) {
                        if (!adminSettingsNotch.contains(e.target) && !signupToggleIcon.contains(e.target)) {
                            if (adminSettingsNotch.classList.contains('active')) {
                                hideAdminSettingsNotch();
                            }
                        }
                    }
                };
                document.addEventListener('click', outsideClickHandler);
                
                function hideAdminSettingsNotch() {
                    if (adminSettingsNotch) {
                        adminSettingsNotch.style.top = '-60px';
                        setTimeout(() => {
                            adminSettingsNotch.classList.remove('active');
                            adminSettingsNotch.style.pointerEvents = 'none';
                            adminSettingsNotch.style.opacity = '0';
                            adminSettingsNotch.style.visibility = 'hidden';
                        }, 500);
                    }
                }
            }
        }, 100); // Small delay to ensure modal is fully rendered
    }
}

// Usage: fetch('/current-user').then(r=>r.json()).then(u=>showProfileModal(u)); 