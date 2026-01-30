// Admin Panel Logic for User and Group Management
(function() {
    const API_URL = window.MineServerGUI?.getApiBaseUrl?.() || window.location.origin;
    
    let isAdmin = false;
    let currentGroupId = null;
    
    // Initialize admin panel
    async function initAdminPanel() {
        // Check if user is admin
        const authResponse = await fetch(`${API_URL}/api/auth/status`, { credentials: 'include' });
        const authData = await authResponse.json();
        
        isAdmin = authData.is_admin;
        
        if (isAdmin) {
            // Show admin panel button
            document.getElementById('adminPanelBtn').style.display = 'inline-block';
            
            // Set up event listeners
            setupEventListeners();
            
            // Load initial data when modal is shown
            document.getElementById('adminPanelModal').addEventListener('shown.bs.modal', () => {
                loadUsers();
            });
        }
    }
    
    function setupEventListeners() {
        // Users tab
        document.getElementById('add-user-btn').addEventListener('click', showAddUserModal);
        document.getElementById('save-user-btn').addEventListener('click', createUser);
        document.getElementById('update-user-btn').addEventListener('click', updateUser);
        document.getElementById('users-tab').addEventListener('click', loadUsers);
        
        // Groups tab
        document.getElementById('add-group-btn').addEventListener('click', showAddGroupModal);
        document.getElementById('save-group-btn').addEventListener('click', createGroup);
        document.getElementById('update-group-btn').addEventListener('click', updateGroup);
        document.getElementById('groups-tab').addEventListener('click', loadGroups);
        
        // Group members
        document.getElementById('add-member-btn').addEventListener('click', showAddMemberModal);
        document.getElementById('save-member-btn').addEventListener('click', addMemberToGroup);
    }
    
    // ========== USER MANAGEMENT ==========
    
    async function loadUsers() {
        try {
            const response = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
            const data = await response.json();
            displayUsers(data.users);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    function displayUsers(users) {
        const tbody = document.getElementById('users-table-body');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.username}</td>
                <td><span class="badge bg-${user.role === 'admin' ? 'danger' : 'primary'}">${user.role}</span></td>
                <td><span class="badge bg-${user.is_active ? 'success' : 'secondary'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning edit-user-btn" data-user-id="${user.id}" data-username="${user.username}" data-role="${user.role}" data-active="${user.is_active}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-user-btn" data-user-id="${user.id}" data-username="${user.username}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners
        tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => showEditUserModal(btn.dataset));
        });
        tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.userId, btn.dataset.username));
        });
    }
    
    function showAddUserModal() {
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-user-role').value = 'user';
        const modal = new bootstrap.Modal(document.getElementById('addUserModal'));
        modal.show();
    }
    
    async function createUser() {
        const username = document.getElementById('new-username').value.trim();
        const password = document.getElementById('new-password').value;
        const role = document.getElementById('new-user-role').value;
        
        if (!username || !password) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Username and password are required', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        if (password.length < 6) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Password must be at least 6 characters', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password, role })
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'User created successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
                await loadUsers();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to create user', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error creating user:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to create user', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    function showEditUserModal(userData) {
        document.getElementById('edit-user-id').value = userData.userId;
        document.getElementById('edit-username').value = userData.username;
        document.getElementById('edit-password').value = '';
        document.getElementById('edit-user-role').value = userData.role;
        document.getElementById('edit-user-active').checked = userData.active === 'true';
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();
    }
    
    async function updateUser() {
        const userId = document.getElementById('edit-user-id').value;
        const password = document.getElementById('edit-password').value;
        const role = document.getElementById('edit-user-role').value;
        const isActive = document.getElementById('edit-user-active').checked;
        
        const updates = { role, is_active: isActive };
        if (password) {
            if (password.length < 6) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Password must be at least 6 characters', customClass: { popup: 'bg-dark text-white' } });
                return;
            }
            updates.password = password;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(updates)
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'User updated successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
                await loadUsers();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to update user', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error updating user:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update user', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    async function deleteUser(userId, username) {
        const confirm = await Swal.fire({
            title: 'Delete User?',
            text: `Are you sure you want to delete user "${username}"? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it',
            customClass: { popup: 'bg-dark text-white' }
        });
        
        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    Swal.fire({ icon: 'success', title: 'Deleted', text: 'User deleted successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                    await loadUsers();
                } else {
                    const data = await response.json();
                    Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to delete user', customClass: { popup: 'bg-dark text-white' } });
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to delete user', customClass: { popup: 'bg-dark text-white' } });
            }
        }
    }
    
    // ========== GROUP MANAGEMENT ==========
    
    async function loadGroups() {
        try {
            const response = await fetch(`${API_URL}/api/admin/groups`, { credentials: 'include' });
            const data = await response.json();
            displayGroups(data.groups);
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    }
    
    function displayGroups(groups) {
        const tbody = document.getElementById('groups-table-body');
        
        if (groups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary">No groups found</td></tr>';
            return;
        }
        
        tbody.innerHTML = groups.map(group => `
            <tr>
                <td>${group.name}</td>
                <td>${group.description || '<span class="text-muted">No description</span>'}</td>
                <td><span class="badge bg-info">${group.member_count}</span></td>
                <td>${new Date(group.created_at).toLocaleDateString()}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-info manage-members-btn" data-group-id="${group.id}" data-group-name="${group.name}">
                        <i class="fas fa-users"></i>
                    </button>
                    <button class="btn btn-sm btn-warning edit-group-btn" data-group-id="${group.id}" data-name="${group.name}" data-description="${group.description || ''}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-group-btn" data-group-id="${group.id}" data-name="${group.name}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners
        tbody.querySelectorAll('.manage-members-btn').forEach(btn => {
            btn.addEventListener('click', () => showManageMembersModal(btn.dataset.groupId, btn.dataset.groupName));
        });
        tbody.querySelectorAll('.edit-group-btn').forEach(btn => {
            btn.addEventListener('click', () => showEditGroupModal(btn.dataset));
        });
        tbody.querySelectorAll('.delete-group-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteGroup(btn.dataset.groupId, btn.dataset.name));
        });
    }
    
    function showAddGroupModal() {
        document.getElementById('new-group-name').value = '';
        document.getElementById('new-group-description').value = '';
        const modal = new bootstrap.Modal(document.getElementById('addGroupModal'));
        modal.show();
    }
    
    async function createGroup() {
        const name = document.getElementById('new-group-name').value.trim();
        const description = document.getElementById('new-group-description').value.trim();
        
        if (!name) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Group name is required', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/admin/groups`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, description })
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Group created successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('addGroupModal')).hide();
                await loadGroups();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to create group', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error creating group:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to create group', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    function showEditGroupModal(groupData) {
        document.getElementById('edit-group-id').value = groupData.groupId;
        document.getElementById('edit-group-name').value = groupData.name;
        document.getElementById('edit-group-description').value = groupData.description;
        const modal = new bootstrap.Modal(document.getElementById('editGroupModal'));
        modal.show();
    }
    
    async function updateGroup() {
        const groupId = document.getElementById('edit-group-id').value;
        const name = document.getElementById('edit-group-name').value.trim();
        const description = document.getElementById('edit-group-description').value.trim();
        
        if (!name) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Group name is required', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/admin/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, description })
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Group updated successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('editGroupModal')).hide();
                await loadGroups();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to update group', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error updating group:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to update group', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    async function deleteGroup(groupId, name) {
        const confirm = await Swal.fire({
            title: 'Delete Group?',
            text: `Are you sure you want to delete group "${name}"? This will also remove all permissions assigned to this group.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it',
            customClass: { popup: 'bg-dark text-white' }
        });
        
        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${API_URL}/api/admin/groups/${groupId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    Swal.fire({ icon: 'success', title: 'Deleted', text: 'Group deleted successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                    await loadGroups();
                } else {
                    const data = await response.json();
                    Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to delete group', customClass: { popup: 'bg-dark text-white' } });
                }
            } catch (error) {
                console.error('Error deleting group:', error);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to delete group', customClass: { popup: 'bg-dark text-white' } });
            }
        }
    }
    
    // ========== GROUP MEMBERS MANAGEMENT ==========
    
    async function showManageMembersModal(groupId, groupName) {
        currentGroupId = groupId;
        document.getElementById('members-group-id').value = groupId;
        document.getElementById('members-group-name').textContent = groupName;
        
        const modal = new bootstrap.Modal(document.getElementById('manageGroupMembersModal'));
        modal.show();
        
        await loadGroupMembers(groupId);
    }
    
    async function loadGroupMembers(groupId) {
        try {
            const response = await fetch(`${API_URL}/api/admin/groups/${groupId}/members`, { credentials: 'include' });
            const data = await response.json();
            displayGroupMembers(data.members);
        } catch (error) {
            console.error('Error loading group members:', error);
        }
    }
    
    function displayGroupMembers(members) {
        const tbody = document.getElementById('group-members-table-body');
        
        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-body-secondary">No members in this group</td></tr>';
            return;
        }
        
        tbody.innerHTML = members.map(member => `
            <tr>
                <td>${member.username}</td>
                <td><span class="badge bg-${member.role === 'admin' ? 'danger' : 'primary'}">${member.role}</span></td>
                <td>${new Date(member.assigned_at).toLocaleDateString()}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-danger remove-member-btn" data-user-id="${member.id}">
                        <i class="fas fa-user-minus"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners
        tbody.querySelectorAll('.remove-member-btn').forEach(btn => {
            btn.addEventListener('click', () => removeMemberFromGroup(currentGroupId, btn.dataset.userId));
        });
    }
    
    async function showAddMemberModal() {
        // Load all users for selection
        try {
            const response = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
            const data = await response.json();
            
            const select = document.getElementById('select-member-user');
            select.innerHTML = '<option value="">-- Select a user --</option>';
            data.users.filter(u => u.role !== 'admin').forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                select.appendChild(option);
            });
            
            const modal = new bootstrap.Modal(document.getElementById('addMemberToGroupModal'));
            modal.show();
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    async function addMemberToGroup() {
        const groupId = currentGroupId;
        const userId = document.getElementById('select-member-user').value;
        
        if (!userId) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Please select a user', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/admin/groups/${groupId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: userId })
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Member added successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('addMemberToGroupModal')).hide();
                await loadGroupMembers(groupId);
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to add member', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error adding member:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to add member', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    async function removeMemberFromGroup(groupId, userId) {
        const confirm = await Swal.fire({
            title: 'Remove Member?',
            text: 'Are you sure you want to remove this member from the group?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove',
            customClass: { popup: 'bg-dark text-white' }
        });
        
        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${API_URL}/api/admin/groups/${groupId}/members/${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    Swal.fire({ icon: 'success', title: 'Removed', text: 'Member removed successfully', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                    await loadGroupMembers(groupId);
                } else {
                    const data = await response.json();
                    Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to remove member', customClass: { popup: 'bg-dark text-white' } });
                }
            } catch (error) {
                console.error('Error removing member:', error);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to remove member', customClass: { popup: 'bg-dark text-white' } });
            }
        }
    }
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdminPanel);
    } else {
        initAdminPanel();
    }
})();
