// Permissions Management for Server Details Page
(function() {
    const API_URL = window.location.origin;
    const params = new URLSearchParams(window.location.search);
    const serverId = params.get('id');
    
    let allUsers = [];
    let allGroups = [];
    
    // Initialize permissions tab
    async function initPermissions() {
        // Check if user is admin
        const authResponse = await fetch(`${API_URL}/api/auth/status`, { credentials: 'include' });
        const authData = await authResponse.json();
        
        if (!authData.is_admin) {
            // Hide permissions tab for non-admins
            document.getElementById('permissions-tab-nav').style.display = 'none';
            return;
        }
        
        // Show permissions tab for admins
        document.getElementById('permissions-tab-nav').style.display = 'block';
        
        // Load users and groups
        await loadAllUsers();
        await loadAllGroups();
        
        // Load existing permissions
        await loadServerPermissions();
        
        // Set up event listeners
        setupEventListeners();
    }
    
    async function loadAllUsers() {
        try {
            const response = await fetch(`${API_URL}/api/admin/users`, { credentials: 'include' });
            const data = await response.json();
            allUsers = data.users.filter(u => u.role !== 'admin'); // Don't show admins
            
            // Populate user select dropdown
            const userSelect = document.getElementById('select-user');
            userSelect.innerHTML = '<option value="">-- Select a user --</option>';
            allUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                userSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }
    
    async function loadAllGroups() {
        try {
            const response = await fetch(`${API_URL}/api/admin/groups`, { credentials: 'include' });
            const data = await response.json();
            allGroups = data.groups;
            
            // Populate group select dropdown
            const groupSelect = document.getElementById('select-group');
            groupSelect.innerHTML = '<option value="">-- Select a group --</option>';
            allGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                groupSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    }
    
    async function loadServerPermissions() {
        try {
            const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            displayUserPermissions(data.user_permissions);
            displayGroupPermissions(data.group_permissions);
        } catch (error) {
            console.error('Error loading server permissions:', error);
        }
    }
    
    function displayUserPermissions(permissions) {
        const tbody = document.getElementById('user-permissions-table-body');
        
        if (permissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-body-secondary">No user permissions set</td></tr>';
            return;
        }
        
        tbody.innerHTML = permissions.map(perm => `
            <tr data-user-id="${perm.user_id}">
                <td>${perm.username}</td>
                <td class="text-center">${perm.can_view ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_start_stop ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_edit_config ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_delete ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_access_console ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning edit-user-perm-btn" data-user-id="${perm.user_id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger remove-user-perm-btn" data-user-id="${perm.user_id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners to buttons
        tbody.querySelectorAll('.edit-user-perm-btn').forEach(btn => {
            btn.addEventListener('click', () => editUserPermission(btn.dataset.userId));
        });
        tbody.querySelectorAll('.remove-user-perm-btn').forEach(btn => {
            btn.addEventListener('click', () => removeUserPermission(btn.dataset.userId));
        });
    }
    
    function displayGroupPermissions(permissions) {
        const tbody = document.getElementById('group-permissions-table-body');
        
        if (permissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-body-secondary">No group permissions set</td></tr>';
            return;
        }
        
        tbody.innerHTML = permissions.map(perm => `
            <tr data-group-id="${perm.group_id}">
                <td>${perm.name}</td>
                <td class="text-center">${perm.can_view ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_start_stop ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_edit_config ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_delete ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">${perm.can_access_console ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning edit-group-perm-btn" data-group-id="${perm.group_id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger remove-group-perm-btn" data-group-id="${perm.group_id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners to buttons
        tbody.querySelectorAll('.edit-group-perm-btn').forEach(btn => {
            btn.addEventListener('click', () => editGroupPermission(btn.dataset.groupId));
        });
        tbody.querySelectorAll('.remove-group-perm-btn').forEach(btn => {
            btn.addEventListener('click', () => removeGroupPermission(btn.dataset.groupId));
        });
    }
    
    function setupEventListeners() {
        // Add user permission button
        document.getElementById('add-user-permission-btn').addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addUserPermissionModal'));
            // Clear all checkboxes
            const allUserPermIds = [
                'user-perm-view-logs', 'user-perm-view-analytics',
                'user-perm-start-server', 'user-perm-stop-server', 'user-perm-restart-server',
                'user-perm-edit-properties', 'user-perm-edit-files',
                'user-perm-manage-backups', 'user-perm-manage-worlds', 'user-perm-manage-scheduler',
                'user-perm-manage-plugins', 'user-perm-change-settings',
                'user-perm-console', 'user-perm-delete-server'
            ];
            allUserPermIds.forEach(id => {
                const elem = document.getElementById(id);
                if (elem) elem.checked = false;
            });
            document.getElementById('select-user').value = '';
            modal.show();
        });
        
        // Add group permission button
        document.getElementById('add-group-permission-btn').addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addGroupPermissionModal'));
            // Clear all checkboxes
            const allGroupPermIds = [
                'group-perm-view-logs', 'group-perm-view-analytics',
                'group-perm-start-server', 'group-perm-stop-server', 'group-perm-restart-server',
                'group-perm-edit-properties', 'group-perm-edit-files',
                'group-perm-manage-backups', 'group-perm-manage-worlds', 'group-perm-manage-scheduler',
                'group-perm-manage-plugins', 'group-perm-change-settings',
                'group-perm-console', 'group-perm-delete-server'
            ];
            allGroupPermIds.forEach(id => {
                const elem = document.getElementById(id);
                if (elem) elem.checked = false;
            });
            document.getElementById('select-group').value = '';
            modal.show();
        });
        
        // Save user permission
        document.getElementById('save-user-permission-btn').addEventListener('click', saveUserPermission);
        
        // Save group permission
        document.getElementById('save-group-permission-btn').addEventListener('click', saveGroupPermission);
    }
    
    async function saveUserPermission() {
        const userId = document.getElementById('select-user').value;
        if (!userId) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Please select a user', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        const permissions = {
            can_view_logs: document.getElementById('user-perm-view-logs').checked,
            can_view_analytics: document.getElementById('user-perm-view-analytics').checked,
            can_start_server: document.getElementById('user-perm-start-server').checked,
            can_stop_server: document.getElementById('user-perm-stop-server').checked,
            can_restart_server: document.getElementById('user-perm-restart-server').checked,
            can_edit_properties: document.getElementById('user-perm-edit-properties').checked,
            can_edit_files: document.getElementById('user-perm-edit-files').checked,
            can_manage_backups: document.getElementById('user-perm-manage-backups').checked,
            can_manage_worlds: document.getElementById('user-perm-manage-worlds').checked,
            can_manage_scheduler: document.getElementById('user-perm-manage-scheduler').checked,
            can_manage_plugins: document.getElementById('user-perm-manage-plugins').checked,
            can_change_settings: document.getElementById('user-perm-change-settings').checked,
            can_access_console: document.getElementById('user-perm-console').checked,
            can_delete_server: document.getElementById('user-perm-delete-server').checked
        };
        
        try {
            const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions/users/${userId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(permissions)
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Permissions updated', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('addUserPermissionModal')).hide();
                await loadServerPermissions();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to update permissions', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error saving user permission:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save permissions', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    async function saveGroupPermission() {
        const groupId = document.getElementById('select-group').value;
        if (!groupId) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Please select a group', customClass: { popup: 'bg-dark text-white' } });
            return;
        }
        
        const permissions = {
            can_view_logs: document.getElementById('group-perm-view-logs').checked,
            can_view_analytics: document.getElementById('group-perm-view-analytics').checked,
            can_start_server: document.getElementById('group-perm-start-server').checked,
            can_stop_server: document.getElementById('group-perm-stop-server').checked,
            can_restart_server: document.getElementById('group-perm-restart-server').checked,
            can_edit_properties: document.getElementById('group-perm-edit-properties').checked,
            can_edit_files: document.getElementById('group-perm-edit-files').checked,
            can_manage_backups: document.getElementById('group-perm-manage-backups').checked,
            can_manage_worlds: document.getElementById('group-perm-manage-worlds').checked,
            can_manage_scheduler: document.getElementById('group-perm-manage-scheduler').checked,
            can_manage_plugins: document.getElementById('group-perm-manage-plugins').checked,
            can_change_settings: document.getElementById('group-perm-change-settings').checked,
            can_access_console: document.getElementById('group-perm-console').checked,
            can_delete_server: document.getElementById('group-perm-delete-server').checked
        };
        
        try {
            const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions/groups/${groupId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(permissions)
            });
            
            if (response.ok) {
                Swal.fire({ icon: 'success', title: 'Success', text: 'Permissions updated', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                bootstrap.Modal.getInstance(document.getElementById('addGroupPermissionModal')).hide();
                await loadServerPermissions();
            } else {
                const data = await response.json();
                Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to update permissions', customClass: { popup: 'bg-dark text-white' } });
            }
        } catch (error) {
            console.error('Error saving group permission:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save permissions', customClass: { popup: 'bg-dark text-white' } });
        }
    }
    
    async function editUserPermission(userId) {
        // Load current permissions and show modal with pre-filled values
        try {
            const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions`, { credentials: 'include' });
            const data = await response.json();
            const userPerm = data.user_permissions.find(p => p.user_id == userId);
            
            if (userPerm) {
                document.getElementById('select-user').value = userId;
                
                // Set all 14 granular permissions
                document.getElementById('user-perm-view-logs').checked = userPerm.can_view_logs || false;
                document.getElementById('user-perm-view-analytics').checked = userPerm.can_view_analytics || false;
                document.getElementById('user-perm-start-server').checked = userPerm.can_start_server || false;
                document.getElementById('user-perm-stop-server').checked = userPerm.can_stop_server || false;
                document.getElementById('user-perm-restart-server').checked = userPerm.can_restart_server || false;
                document.getElementById('user-perm-edit-properties').checked = userPerm.can_edit_properties || false;
                document.getElementById('user-perm-edit-files').checked = userPerm.can_edit_files || false;
                document.getElementById('user-perm-manage-backups').checked = userPerm.can_manage_backups || false;
                document.getElementById('user-perm-manage-worlds').checked = userPerm.can_manage_worlds || false;
                document.getElementById('user-perm-manage-scheduler').checked = userPerm.can_manage_scheduler || false;
                document.getElementById('user-perm-manage-plugins').checked = userPerm.can_manage_plugins || false;
                document.getElementById('user-perm-change-settings').checked = userPerm.can_change_settings || false;
                document.getElementById('user-perm-console').checked = userPerm.can_access_console || false;
                document.getElementById('user-perm-delete-server').checked = userPerm.can_delete_server || false;
                
                const modal = new bootstrap.Modal(document.getElementById('addUserPermissionModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading user permission:', error);
        }
    }
    
    async function editGroupPermission(groupId) {
        // Load current permissions and show modal with pre-filled values
        try {
            const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions`, { credentials: 'include' });
            const data = await response.json();
            const groupPerm = data.group_permissions.find(p => p.group_id == groupId);
            
            if (groupPerm) {
                document.getElementById('select-group').value = groupId;
                
                // Set all 14 granular permissions
                document.getElementById('group-perm-view-logs').checked = groupPerm.can_view_logs || false;
                document.getElementById('group-perm-view-analytics').checked = groupPerm.can_view_analytics || false;
                document.getElementById('group-perm-start-server').checked = groupPerm.can_start_server || false;
                document.getElementById('group-perm-stop-server').checked = groupPerm.can_stop_server || false;
                document.getElementById('group-perm-restart-server').checked = groupPerm.can_restart_server || false;
                document.getElementById('group-perm-edit-properties').checked = groupPerm.can_edit_properties || false;
                document.getElementById('group-perm-edit-files').checked = groupPerm.can_edit_files || false;
                document.getElementById('group-perm-manage-backups').checked = groupPerm.can_manage_backups || false;
                document.getElementById('group-perm-manage-worlds').checked = groupPerm.can_manage_worlds || false;
                document.getElementById('group-perm-manage-scheduler').checked = groupPerm.can_manage_scheduler || false;
                document.getElementById('group-perm-manage-plugins').checked = groupPerm.can_manage_plugins || false;
                document.getElementById('group-perm-change-settings').checked = groupPerm.can_change_settings || false;
                document.getElementById('group-perm-console').checked = groupPerm.can_access_console || false;
                document.getElementById('group-perm-delete-server').checked = groupPerm.can_delete_server || false;
                
                const modal = new bootstrap.Modal(document.getElementById('addGroupPermissionModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error loading group permission:', error);
        }
    }
    
    async function removeUserPermission(userId) {
        const confirm = await Swal.fire({
            title: 'Remove Permission?',
            text: 'Are you sure you want to remove this user\'s permissions for this server?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove it',
            customClass: { popup: 'bg-dark text-white' }
        });
        
        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions/users/${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    Swal.fire({ icon: 'success', title: 'Removed', text: 'Permission removed', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                    await loadServerPermissions();
                } else {
                    const data = await response.json();
                    Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to remove permission', customClass: { popup: 'bg-dark text-white' } });
                }
            } catch (error) {
                console.error('Error removing user permission:', error);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to remove permission', customClass: { popup: 'bg-dark text-white' } });
            }
        }
    }
    
    async function removeGroupPermission(groupId) {
        const confirm = await Swal.fire({
            title: 'Remove Permission?',
            text: 'Are you sure you want to remove this group\'s permissions for this server?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, remove it',
            customClass: { popup: 'bg-dark text-white' }
        });
        
        if (confirm.isConfirmed) {
            try {
                const response = await fetch(`${API_URL}/api/admin/servers/${serverId}/permissions/groups/${groupId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (response.ok) {
                    Swal.fire({ icon: 'success', title: 'Removed', text: 'Permission removed', timer: 1500, showConfirmButton: false, customClass: { popup: 'bg-dark text-white' } });
                    await loadServerPermissions();
                } else {
                    const data = await response.json();
                    Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Failed to remove permission', customClass: { popup: 'bg-dark text-white' } });
                }
            } catch (error) {
                console.error('Error removing group permission:', error);
                Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to remove permission', customClass: { popup: 'bg-dark text-white' } });
            }
        }
    }
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPermissions);
    } else {
        initPermissions();
    }
})();
