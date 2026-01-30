const API_URL = window.MineServerGUI?.getApiBaseUrl?.() || window.location.origin;

document.addEventListener('DOMContentLoaded', () => {
    // --- Fetch Wrapper with Credentials ---
    const authenticatedFetch = (url, options = {}) => {
        return fetch(url, {
            ...options,
            credentials: 'include'
        });
    };
    const settingsModal = document.getElementById('settingsModal');
    const serversDirInput = document.getElementById('servers-dir-input');
    const configsDirInput = document.getElementById('configs-dir-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const screenList = document.getElementById('screen-list');
    const terminateAllScreensBtn = document.getElementById('terminate-all-screens-btn');

    // File Explorer Elements
    const fileExplorerModal = new bootstrap.Modal(document.getElementById('fileExplorerModal'));
    const fileExplorerList = document.getElementById('fileExplorerList');
    const currentPathDisplay = document.getElementById('currentPathDisplay');
    const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');
    const browseBtns = document.querySelectorAll('.browse-btn');
    let activeInputId = null; // To store which input triggered the browser

    const fetchConfig = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/config`);
            const config = await response.json();
            if (response.ok) {
                serversDirInput.value = config.servers_dir;
                configsDirInput.value = config.configs_dir;
            } else {
                console.error('Failed to fetch config:', config.error);
            }
        } catch (error) {
            console.error('Error fetching config:', error);
        }
    };

    const openFileExplorer = async (path = '') => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/browse?path=${encodeURIComponent(path)}`);
            const data = await response.json();

            if (!response.ok) {
                Swal.fire('Error', `Failed to browse path: ${data.error}`, 'error');
                return;
            }
            
            currentPathDisplay.textContent = data.current_path;
            fileExplorerList.innerHTML = ''; // Clear previous content

            // Add an 'up' directory item
            if (data.parent_path !== null && data.parent_path !== undefined) {
                 const upEl = document.createElement('a');
                 upEl.href = '#';
                 upEl.className = 'list-group-item list-group-item-action list-group-item-secondary';
                 upEl.innerHTML = `<i class="fas fa-arrow-up me-2"></i>..`;
                 upEl.addEventListener('click', (e) => {
                     e.preventDefault();
                     openFileExplorer(data.parent_path);
                 });
                 fileExplorerList.appendChild(upEl);
            }

            data.directories.forEach(dir => {
                const dirEl = document.createElement('a');
                dirEl.href = '#';
                dirEl.className = 'list-group-item list-group-item-action';
                dirEl.innerHTML = `<i class="fas fa-folder me-2"></i>${dir}`;
                dirEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    let newPath;
                    if (data.current_path === 'My Computer') {
                        newPath = dir;
                    } else {
                        // Use forward slashes for consistency, as the backend expects them on non-Windows platforms.
                        const basePath = data.current_path.replace(/\\\\/g, '/');
                        newPath = basePath.endsWith('/') ? `${basePath}${dir}` : `${basePath}/${dir}`;
                    }
                    openFileExplorer(newPath);
                });
                fileExplorerList.appendChild(dirEl);
            });

        } catch (error) {
            Swal.fire('Error', `Error opening file explorer: ${error}`, 'error');
        }
    };

    const saveConfig = async () => {
        const spinner = saveSettingsBtn.querySelector('.spinner-border');
        const buttonText = saveSettingsBtn.querySelector('.button-text');
        
        // Show spinner and disable button
        spinner.style.display = 'inline-block';
        buttonText.textContent = 'Saving...';
        saveSettingsBtn.disabled = true;

        try {
            const response = await authenticatedFetch(`${API_URL}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    servers_dir: serversDirInput.value,
                    configs_dir: configsDirInput.value 
                })
            });
            const result = await response.json();
            if (response.ok) {
                Swal.fire('Success!', 'Settings saved successfully. The application will now reload.', 'success')
                    .then(() => location.reload());
            } else {
                Swal.fire('Error', `Failed to save settings: ${result.error}`, 'error');
            }
        } catch (error) {
            Swal.fire('Error', `Error saving settings: ${error}`, 'error');
        } finally {
            // Hide spinner and enable button
            spinner.style.display = 'none';
            buttonText.textContent = 'Save Settings';
            saveSettingsBtn.disabled = false;
        }
    };

    // Event Listeners for Browse Buttons
    browseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            activeInputId = btn.getAttribute('data-input-target');
            const currentPath = document.getElementById(activeInputId).value;
            openFileExplorer(currentPath);
            fileExplorerModal.show();
        });
    });

    // Event Listener for Select Directory Button
    selectDirectoryBtn.addEventListener('click', () => {
        if (activeInputId) {
            const selectedPath = currentPathDisplay.textContent;
            // Avoid setting path to "My Computer"
            if (selectedPath !== "My Computer") {
                document.getElementById(activeInputId).value = selectedPath;
            }
        }
        fileExplorerModal.hide();
    });

    const fetchScreens = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/screens`);
            const screens = await response.json();
            screenList.innerHTML = ''; // Clear existing list
            if (response.ok) {
                if (screens.length > 0) {
                    screens.forEach(screen => {
                        const screenItem = document.createElement('div');
                        screenItem.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
                        screenItem.innerHTML = `
                            <span>
                                <i class="fas fa-desktop me-2"></i>
                                <strong>${screen.pid}</strong> - ${screen.name}
                            </span>
                            <small>${screen.details}</small>
                        `;
                        screenList.appendChild(screenItem);
                    });
                } else {
                    screenList.innerHTML = '<p class="text-body-secondary">No active screens found.</p>';
                }
            } else {
                screenList.innerHTML = `<p class="text-danger">Error: ${screens.error}</p>`;
            }
        } catch (error) {
            screenList.innerHTML = `<p class="text-danger">Error fetching screens: ${error.message}</p>`;
        }
    };

    const terminateAllScreens = async () => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "This will terminate all running screen sessions, potentially stopping servers.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Yes, terminate all!'
        });

        if (result.isConfirmed) {
            try {
                const response = await authenticatedFetch(`${API_URL}/api/screens/terminate-all`, { method: 'POST' });
                const res = await response.json();
                if (response.ok) {
                    Swal.fire('Success!', res.message, 'success');
                    fetchScreens(); // Refresh the list
                } else {
                    Swal.fire('Error', res.error, 'error');
                }
            } catch (error) {
                Swal.fire('Error', `An error occurred: ${error.message}`, 'error');
            }
        }
    };

    // OAuth2 Management Functions
    const loadOAuthClients = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/self/oauth2`);
            const data = await response.json();
            
            const clientsList = document.getElementById('oauth-clients-list');
            const oauthUserDisplay = document.getElementById('oauth-user-display');
            
            // Update user display
            const statusResponse = await authenticatedFetch(`${API_URL}/api/auth/status`);
            const statusData = await statusResponse.json();
            if (statusData.authenticated) {
                oauthUserDisplay.textContent = `${statusData.username} (${statusData.role})`;
            }
            
            if (!response.ok) {
                clientsList.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load OAuth2 clients</td></tr>';
                return;
            }
            
            if (!data.clients || data.clients.length === 0) {
                clientsList.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary">No OAuth2 clients yet. Create one to get started!</td></tr>';
                return;
            }
            
            clientsList.innerHTML = data.clients.map(client => {
                const createdDate = new Date(client.created_at).toLocaleString();
                const lastUsed = client.last_used ? new Date(client.last_used).toLocaleString() : 'Never';
                
                return `
                    <tr>
                        <td>${escapeHtml(client.client_name)}</td>
                        <td><code class="text-info">${escapeHtml(client.client_id)}</code></td>
                        <td>${createdDate}</td>
                        <td>${lastUsed}</td>
                        <td class="text-center">
                            <button class="btn btn-sm btn-danger delete-oauth-client" data-client-id="${escapeHtml(client.client_id)}" data-client-name="${escapeHtml(client.client_name)}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            // Add event listeners to delete buttons
            document.querySelectorAll('.delete-oauth-client').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const clientId = e.currentTarget.dataset.clientId;
                    const clientName = e.currentTarget.dataset.clientName;
                    
                    const result = await Swal.fire({
                        title: 'Delete OAuth2 Client?',
                        html: `Are you sure you want to delete <strong>${clientName}</strong>?<br><br>This will invalidate all tokens for this client.`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#d33',
                        cancelButtonColor: '#3085d6',
                        confirmButtonText: 'Yes, delete it!'
                    });
                    
                    if (result.isConfirmed) {
                        try {
                            const deleteResponse = await authenticatedFetch(`${API_URL}/api/self/oauth2/${clientId}`, {
                                method: 'DELETE'
                            });
                            
                            if (deleteResponse.ok) {
                                Swal.fire('Deleted!', 'OAuth2 client has been deleted.', 'success');
                                loadOAuthClients();
                            } else {
                                const errorData = await deleteResponse.json();
                                Swal.fire('Error', errorData.msg || 'Failed to delete OAuth2 client', 'error');
                            }
                        } catch (error) {
                            Swal.fire('Error', `An error occurred: ${error.message}`, 'error');
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Error loading OAuth2 clients:', error);
            const clientsList = document.getElementById('oauth-clients-list');
            clientsList.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading OAuth2 clients</td></tr>';
        }
    };
    
    const createOAuthClient = async (clientName) => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/self/oauth2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_name: clientName })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                Swal.fire('Error', data.msg || 'Failed to create OAuth2 client', 'error');
                return;
            }
            
            // Show the secret modal with credentials
            document.getElementById('oauth-client-name-display').value = data.client_name;
            document.getElementById('oauth-client-id-display').value = data.client_id;
            document.getElementById('oauth-client-secret-display').value = data.client_secret;
            
            const secretModal = new bootstrap.Modal(document.getElementById('oauthSecretModal'));
            secretModal.show();
            
            // Reload clients list
            loadOAuthClients();
        } catch (error) {
            Swal.fire('Error', `An error occurred: ${error.message}`, 'error');
        }
    };
    
    const viewUserPermissions = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/auth/status`);
            const data = await response.json();
            
            const permissionsContent = document.getElementById('user-permissions-content');
            
            if (!data.authenticated) {
                permissionsContent.innerHTML = '<p class="text-danger">Not authenticated</p>';
                return;
            }
            
            if (data.is_admin) {
                permissionsContent.innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-crown me-2"></i>
                        <strong>Administrator Account</strong>
                        <p class="mb-0 mt-2">As an administrator, you have full access to all servers and features. OAuth2 clients created by your account will inherit these administrator privileges.</p>
                    </div>
                    <h6 class="mt-3">Full Permissions Include:</h6>
                    <ul class="list-unstyled">
                        <li><i class="fas fa-check text-success me-2"></i>Create, manage, and delete servers</li>
                        <li><i class="fas fa-check text-success me-2"></i>Access all server consoles and logs</li>
                        <li><i class="fas fa-check text-success me-2"></i>Manage backups, worlds, and plugins</li>
                        <li><i class="fas fa-check text-success me-2"></i>User and group management</li>
                        <li><i class="fas fa-check text-success me-2"></i>Full system configuration access</li>
                    </ul>
                `;
            } else {
                permissionsContent.innerHTML = `
                    <div class="alert alert-info">
                        <i class="fas fa-user me-2"></i>
                        <strong>Standard User Account</strong>
                        <p class="mb-0 mt-2">Your OAuth2 clients will inherit your server-specific permissions. Contact an administrator to modify your permissions.</p>
                    </div>
                    <p class="text-body-secondary">Your permissions vary by server. Check individual server settings for details.</p>
                `;
            }
            
            const permissionsModal = new bootstrap.Modal(document.getElementById('userPermissionsModal'));
            permissionsModal.show();
        } catch (error) {
            console.error('Error loading permissions:', error);
            Swal.fire('Error', 'Failed to load user permissions', 'error');
        }
    };
    
    // Helper function to escape HTML
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    // OAuth2 Event Listeners
    const createOAuthClientBtn = document.getElementById('create-oauth-client-btn');
    if (createOAuthClientBtn) {
        createOAuthClientBtn.addEventListener('click', () => {
            const createModal = new bootstrap.Modal(document.getElementById('createOAuthClientModal'));
            createModal.show();
        });
    }
    
    const confirmCreateOAuthClient = document.getElementById('confirm-create-oauth-client');
    if (confirmCreateOAuthClient) {
        confirmCreateOAuthClient.addEventListener('click', async () => {
            const clientNameInput = document.getElementById('new-oauth-client-name');
            const clientName = clientNameInput.value.trim();
            
            if (!clientName || clientName.length < 3) {
                Swal.fire('Error', 'Client name must be at least 3 characters long', 'error');
                return;
            }
            
            const createModal = bootstrap.Modal.getInstance(document.getElementById('createOAuthClientModal'));
            createModal.hide();
            
            await createOAuthClient(clientName);
            clientNameInput.value = '';
        });
    }
    
    const viewPermissionsBtn = document.getElementById('view-permissions-btn');
    if (viewPermissionsBtn) {
        viewPermissionsBtn.addEventListener('click', viewUserPermissions);
    }
    
    // Copy buttons for OAuth credentials
    const copyClientIdBtn = document.getElementById('copy-client-id-btn');
    if (copyClientIdBtn) {
        copyClientIdBtn.addEventListener('click', () => {
            const clientId = document.getElementById('oauth-client-id-display').value;
            navigator.clipboard.writeText(clientId).then(() => {
                const icon = copyClientIdBtn.querySelector('i');
                icon.className = 'fas fa-check';
                setTimeout(() => { icon.className = 'fas fa-copy'; }, 2000);
            });
        });
    }
    
    const copyClientSecretBtn = document.getElementById('copy-client-secret-btn');
    if (copyClientSecretBtn) {
        copyClientSecretBtn.addEventListener('click', () => {
            const clientSecret = document.getElementById('oauth-client-secret-display').value;
            navigator.clipboard.writeText(clientSecret).then(() => {
                const icon = copyClientSecretBtn.querySelector('i');
                icon.className = 'fas fa-check';
                setTimeout(() => { icon.className = 'fas fa-copy'; }, 2000);
            });
        });
    }
    
    const copyOAuthCredentials = document.getElementById('copy-oauth-credentials');
    if (copyOAuthCredentials) {
        copyOAuthCredentials.addEventListener('click', () => {
            const clientId = document.getElementById('oauth-client-id-display').value;
            const clientSecret = document.getElementById('oauth-client-secret-display').value;
            const credentials = `Client ID: ${clientId}\nClient Secret: ${clientSecret}`;
            
            navigator.clipboard.writeText(credentials).then(() => {
                copyOAuthCredentials.innerHTML = '<i class="fas fa-check me-2"></i>Copied!';
                setTimeout(() => {
                    copyOAuthCredentials.innerHTML = '<i class="fas fa-clipboard me-2"></i>Copy Both to Clipboard';
                }, 2000);
            });
        });
    }
    
    // Load OAuth clients when settings tab is shown
    const oauthSettingsTab = document.getElementById('oauth-settings-tab');
    if (oauthSettingsTab) {
        oauthSettingsTab.addEventListener('shown.bs.tab', loadOAuthClients);
    }

    // Event Listeners
    if (settingsModal) {
        settingsModal.addEventListener('show.bs.modal', () => {
            fetchConfig();
            fetchScreens();
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveConfig);
    }
    
    if (terminateAllScreensBtn) {
        terminateAllScreensBtn.addEventListener('click', terminateAllScreens);
    }
}); 
