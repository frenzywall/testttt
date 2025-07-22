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
                      <h4><i class="fas fa-user-plus"></i> Add New User</h4>
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
                      </div>
                      <div id="profileMsg" class="profile-msg"></div>
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
                        </div>
                        <div class="user-mgmt-card">
                            <div id="userList"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
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
        fetch('/logout', {method:'POST'}).then(()=>window.location='/login');
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
                const oldPw = document.getElementById('oldPw').value;
                const newPw = document.getElementById('newPw').value;
                fetch('/change-password', {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({old_password:oldPw,new_password:newPw})
                }).then(r=>r.json()).then(data=>{
                    document.getElementById('changePwMsg').textContent = data.status==='success'?'Password updated!':(data.message||'Error');
                    if(data.status==='success') {
                        document.getElementById('oldPw').value = '';
                        document.getElementById('newPw').value = '';
                        setTimeout(()=>{
                            section.style.display = 'none';
                            // Only show add-user-card if admin
                            if(user.role === 'admin') {
                            document.querySelector('.add-user-card').style.display = '';
                            } else {
                                document.querySelector('.add-user-card').style.display = 'none';
                            }
                        }, 1200);
                    }
                });
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
                        info.innerHTML = `<span class="user-name">${u}</span>${lastLoginHtml}`;
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
                        logout.style.background = 'linear-gradient(135deg,#f59e0b,#fbbf24)';
                        
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
                            // Remove any other open editors
                            document.querySelectorAll('.user-edit-inline').forEach(e=>e.remove());
                            // Inline form
                            const inline = document.createElement('div');
                            inline.className = 'user-edit-inline';
                            inline.style.display = 'flex';
                            inline.style.alignItems = 'center';
                            inline.style.gap = '0.5rem';
                            inline.style.marginTop = '0.5rem';
                            inline.innerHTML = `
                              <input type="password" class="user-edit-input" placeholder="New Password" style="padding:0.4rem 0.8rem;border-radius:7px;border:1px solid #3b82f6;background:rgba(255,255,255,0.08);color:#eaf1fb;font-size:0.98rem;outline:none;">
                              <button class="btn save-btn" style="padding:0.4rem 1.5rem;font-size:1.08rem;">Save</button>
                              <button class="btn cancel-btn" style="padding:0.4rem 1.5rem;font-size:1.08rem;">Cancel</button>
                              <span class="user-edit-msg" style="margin-left:0.5rem;font-size:0.98rem;"></span>
                            `;
                            info.appendChild(inline);
                            // Save/cancel logic
                            inline.querySelector('.cancel-btn').onclick = function() {
                                inline.remove();
                                editing = false;
                            };
                            inline.querySelector('.save-btn').onclick = function() {
                                const npw = inline.querySelector('.user-edit-input').value;
                                if (!npw) {
                                    inline.querySelector('.user-edit-msg').textContent = 'Enter password';
                                    return;
                                }
                                fetch('/users',{
                                    method:'PUT',
                                    headers:{'Content-Type':'application/json'},
                                    body:JSON.stringify({username:u,password:npw})
                                }).then(r=>r.json()).then(data=>{
                                    inline.querySelector('.user-edit-msg').textContent = data.status==='success'?'Updated!':(data.message||'Error');
                                    if(data.status==='success') {
                                        createNotification('success', 'Password updated successfully!');
                                        setTimeout(()=>{
                                            inline.remove();
                                            editing = false;
                                        }, 1000);
                                    }
                                });
                            };
                        };
                        actions.appendChild(edit);
                        actions.appendChild(logout);
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
                                }).then(()=>{
                                    refreshUsers();
                                    createNotification('success', 'User deleted successfully!');
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
            fetch('/users',{
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({username:nu,password:npw})
            }).then(r=>r.json()).then(data=>{
                const msgDiv = document.getElementById('profileMsg');
                if (data.status === 'success') {
                    msgDiv.innerHTML = '<span class="feedback-message"><span class="icon">✔️</span> User added!</span>';
                } else {
                    msgDiv.innerHTML = '<span class="feedback-message error"><span class="icon">❗</span> ' + (data.message || 'Error') + '</span>';
                }
                // Clear form fields
                document.getElementById('newUser').value = '';
                document.getElementById('newUserPw').value = '';
                // Fade out the message after 2.5s
                const feedback = msgDiv.querySelector('.feedback-message');
                if (feedback) {
                    setTimeout(() => {
                        feedback.classList.add('fade-out');
                        setTimeout(() => { msgDiv.innerHTML = ''; }, 600);
                    }, 2500);
                }
                refreshUsers();
            });
        };
    }
}

// Usage: fetch('/current-user').then(r=>r.json()).then(u=>showProfileModal(u)); 