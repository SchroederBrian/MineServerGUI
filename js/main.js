document.addEventListener('DOMContentLoaded', async () => {
    const serverListElement = document.getElementById('serverList');
    const createServerBtn = document.getElementById('createServerBtn');
    const API_URL = 'http://127.0.0.1:5000';

    // --- Authentication Check ---
    async function checkAuthentication() {
        try {
            const response = await fetch(`${API_URL}/api/auth/status`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (!data.authenticated) {
                window.location.href = 'login.html';
                return false;
            }
            return true;
        } catch (error) {
            console.error('Authentication check failed:', error);
            window.location.href = 'login.html';
            return false;
        }
    }
    
    // Check authentication before initializing the page
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) return;

    // --- Panorama Effect ---
    const setupPanoramaEffect = async () => {
        const panorama = document.querySelector('.panorama-background');
        if (!panorama) return;

        try {
            const response = await fetch(`${API_URL}/api/config`, {
                credentials: 'include'
            });
            const config = await response.json();
            const intensity = config.panorama_intensity || 1.5;
            
            panorama.style.setProperty('--panorama-width', `${intensity * 100}vw`);

            document.addEventListener('mousemove', (e) => {
                const { clientX } = e;
                const screenWidth = window.innerWidth;
                const maxPan = panorama.offsetWidth - screenWidth;
                const panX = (clientX / screenWidth) * maxPan;
                panorama.style.left = `-${panX}px`;
            });
        } catch (error) {
            console.error("Failed to load panorama config:", error);
            // Fallback to default behavior if config fails
            document.addEventListener('mousemove', (e) => {
                const { clientX } = e;
                const screenWidth = window.innerWidth;
                const maxPan = panorama.offsetWidth - screenWidth;
                const panX = (clientX / screenWidth) * maxPan;
                panorama.style.left = `-${panX}px`;
            });
        }
    };
    
    setupPanoramaEffect();

    let servers = [];

    const renderServers = () => {
        serverListElement.innerHTML = '';
        if (servers.length === 0) {
            serverListElement.innerHTML = `<p class="text-secondary col-12 text-center">No servers found. Create one to get started!</p>`;
            return;
        }
        servers.forEach(server => {
            const status_color = server.status === 'Running' ? 'success' : (server.status === 'Stopped' ? 'danger' : 'warning');
            const serverCard = document.createElement('div');
            serverCard.className = 'col';
            serverCard.innerHTML = `
                <div class="card h-100 bg-dark text-white shadow server-card" data-server-id="${server.id}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title mb-0">${server.name}</h5>
                            <span class="badge bg-${status_color}-subtle text-${status_color}-emphasis rounded-pill">${server.status}</span>
                        </div>
                        <p class="card-text text-body-secondary mb-1">
                            <span class="text-capitalize">${server.server_type || 'N/A'}</span> v${server.version}
                        </p>
                        <p class="card-text text-body-secondary">
                            Port: ${server.port}
                        </p>
                    </div>
                    <div class="card-footer bg-dark-tertiary d-grid gap-2">
                         <div class="btn-group">
                            <button class="btn btn-outline-primary start-server-btn" ${server.status !== 'Stopped' ? 'disabled' : ''}>
                                <i class="fas fa-play me-2"></i>Start
                            </button>
                            <button class="btn btn-outline-danger stop-server-btn" ${server.status !== 'Running' ? 'disabled' : ''}>
                                <i class="fas fa-stop me-2"></i>Stop
                            </button>
                        </div>
                        <button class="btn btn-sm btn-outline-danger delete-server-btn"><i class="fas fa-trash-alt me-1"></i>Delete Server</button>
                    </div>
                </div>
            `;
            serverListElement.appendChild(serverCard);
        });
    };

    const fetchServers = async () => {
        try {
            const response = await fetch(`${API_URL}/api/servers`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Network response was not ok');
            servers = await response.json();
            renderServers();
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            serverListElement.innerHTML = `<p class="text-danger col-12 text-center">Failed to load servers. Is the backend running?</p>`;
        }
    };

    // Handle server creation with SweetAlert2
    createServerBtn.addEventListener('click', () => {
        Swal.fire({
            title: 'Create a New Minecraft Server',
            html: `
                <form id="swal-createServerForm" class="text-start">
                    <div class="mb-3">
                        <label for="swal-serverName" class="form-label">Server Name</label>
                        <input type="text" id="swal-serverName" class="form-control" placeholder="My Awesome Server" required>
                    </div>
                    <div class="row g-3 mb-3">
                        <div class="col-md-6">
                            <label for="swal-serverType" class="form-label">Server Type</label>
                            <select id="swal-serverType" class="form-select">
                                <option selected>Paper</option>
                                <option>Purpur</option>
                                <option>Fabric</option>
                                <option>Vanilla</option>
                                <option>Forge</option>
                                <option>NeoForge</option>
                                <option>Quilt</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label for="swal-minecraftVersion" class="form-label">Version</label>
                            <input type="text" id="swal-minecraftVersion" class="form-control" placeholder="e.g., 1.21" required>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="swal-port" class="form-label">Port Number</label>
                        <input type="number" id="swal-port" class="form-control" value="25565" required>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="swal-eula-accept" required>
                        <label class="form-check-label" for="swal-eula-accept">
                            I accept the <a href="https://account.mojang.com/documents/minecraft_eula" target="_blank">Minecraft EULA</a>
                        </label>
                    </div>
                </form>
            `,
            showCancelButton: true,
            confirmButtonText: 'Create Server',
            confirmButtonColor: '#198754',
            customClass: {
                popup: 'bg-dark text-white',
                htmlContainer: 'text-body-secondary',
                input: 'bg-dark-subtle',
                
            },
            preConfirm: () => {
                const serverName = document.getElementById('swal-serverName').value;
                const eulaAccepted = document.getElementById('swal-eula-accept').checked;
                if (!serverName) {
                    Swal.showValidationMessage(`Server name is required.`);
                    return false;
                }
                if (!eulaAccepted) {
                    Swal.showValidationMessage(`You must accept the EULA.`);
                    return false;
                }
                return {
                    server_name: serverName,
                    server_type: document.getElementById('swal-serverType').value.toLowerCase(),
                    version: document.getElementById('swal-minecraftVersion').value,
                    port: document.getElementById('swal-port').value,
                    eula_accepted: eulaAccepted,
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const serverData = result.value;
                
                Swal.fire({
                    title: 'Creating Server...',
                    text: `Server "${serverData.server_name}" is being created. Please wait.`,
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
        
        try {
            const response = await fetch(`${API_URL}/api/servers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(serverData)
            });
                    const res = await response.json();
            if (!response.ok) {
                        throw new Error(res.error || 'Server creation failed');
            }
            await fetchServers();
                     Swal.fire('Success!', 'Server created successfully!', 'success');
        } catch (error) {
            console.error('Error creating server:', error);
                    Swal.fire('Error!', `Error creating server: ${error.message}`, 'error');
        }
            }
        });
    });
    
    // Use event delegation for start/stop buttons and card clicks
    serverListElement.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) {
            // Handle card click for navigation
            const card = e.target.closest('.server-card');
            if (card) {
                window.location.href = `server-details.html?id=${card.dataset.serverId}`;
            }
            return;
        }

        e.stopPropagation(); // Prevent card click when a button is clicked

        const serverId = button.closest('.server-card').dataset.serverId;
        const action = button.classList.contains('start-server-btn') ? 'start' : 
                       button.classList.contains('stop-server-btn') ? 'stop' :
                       button.classList.contains('delete-server-btn') ? 'delete' : null;

        if (!action) return;

        if (action === 'delete') {
            Swal.fire({
                title: 'Are you sure?',
                text: `You are about to permanently delete "${serverId}". This action cannot be undone.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Yes, delete it!',
                customClass: {
                    popup: 'bg-dark text-white',
                }
            }).then(async (result) => {
                if (result.isConfirmed) {
                try {
                    const response = await fetch(`${API_URL}/api/servers/${serverId}`, { 
                        method: 'DELETE',
                        credentials: 'include'
                    });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to delete server');
                    }
                    await fetchServers(); // Refresh the list
                        Swal.fire({
                           title: 'Deleted!',
                           text: `Server "${serverId}" has been deleted.`,
                           icon: 'success',
                           customClass: { popup: 'bg-dark text-white' }
                        });
                } catch (error) {
                    console.error('Error deleting server:', error);
                        Swal.fire({
                           title: 'Error!',
                           text: `Failed to delete server: ${error.message}`,
                           icon: 'error',
                           customClass: { popup: 'bg-dark text-white' }
                        });
                }
            }
            });
            return;
        }
        
        const originalButtonContent = button.innerHTML;
        
        button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
        button.disabled = true;

        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/${action}`, { 
                method: 'POST',
                credentials: 'include'
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Failed to ${action} server`);
            }
            setTimeout(fetchServers, 2000);
        } catch (error) {
             console.error(`Error ${action}ing server:`, error);
             alert(`Error: ${error.message}`);
             button.innerHTML = originalButtonContent;
             button.disabled = false;
        }
    });

    // Initial fetch
    fetchServers();
    
    // --- Logout Functionality ---
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const response = await authenticatedFetch(`${API_URL}/api/auth/logout`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    window.location.href = 'login.html';
                } else {
                    console.error('Logout failed');
                }
            } catch (error) {
                console.error('Logout error:', error);
                // Redirect anyway as the session might be invalid
                window.location.href = 'login.html';
            }
        });
    }
    
    // ===========================
    // Server Templates Management
    // ===========================
    
    const templatesList = document.getElementById('templatesList');
    const createFromTemplateBtn = document.getElementById('createFromTemplateBtn');
    const importTemplateBtn = document.getElementById('importTemplateBtn');
    const createFromTemplateModal = new bootstrap.Modal(document.getElementById('createFromTemplateModal'));
    const importTemplateModal = new bootstrap.Modal(document.getElementById('importTemplateModal'));
    const templateSelect = document.getElementById('template-select');
    const newServerName = document.getElementById('new-server-name');
    const newServerPort = document.getElementById('new-server-port');
    const confirmCreateFromTemplate = document.getElementById('confirm-create-from-template');
    const templateFileInput = document.getElementById('template-file-input');
    const confirmImportTemplate = document.getElementById('confirm-import-template');
    
    let templates = [];
    
    // Fetch templates
    const fetchTemplates = async () => {
        try {
            const response = await fetch(`${API_URL}/api/templates`, {
                credentials: 'include'
            });
            if (!response.ok) throw new Error('Failed to fetch templates');
            
            templates = await response.json();
            renderTemplates();
            updateTemplateSelect();
        } catch (error) {
            console.error('Error fetching templates:', error);
            if (templatesList) {
                templatesList.innerHTML = '<div class="text-danger text-center p-3">Failed to load templates</div>';
            }
        }
    };
    
    // Render templates list
    const renderTemplates = () => {
        if (!templatesList) return;
        
        templatesList.innerHTML = '';
        
        if (!templates || templates.length === 0) {
            templatesList.innerHTML = '<div class="text-body-secondary text-center p-3">No templates yet</div>';
            return;
        }
        
        templates.forEach(template => {
            const templateItem = document.createElement('div');
            templateItem.className = 'list-group-item list-group-item-dark';
            
            // Build inclusion badges
            const includes = template.includes || {};
            const inclusionBadges = [];
            
            if (includes.server_configs) {
                inclusionBadges.push('<span class="badge bg-primary" title="Server configs included"><i class="fas fa-cog"></i></span>');
            }
            if (includes.world) {
                inclusionBadges.push('<span class="badge bg-success" title="World files included"><i class="fas fa-globe"></i></span>');
            }
            if (includes.plugins) {
                inclusionBadges.push('<span class="badge bg-info" title="Plugins/mods included"><i class="fas fa-puzzle-piece"></i></span>');
            }
            if (includes.whitelist) {
                inclusionBadges.push('<span class="badge bg-warning" title="Whitelist included"><i class="fas fa-list"></i></span>');
            }
            if (includes.ops) {
                inclusionBadges.push('<span class="badge bg-danger" title="Operators included"><i class="fas fa-user-shield"></i></span>');
            }
            
            const inclusionHtml = inclusionBadges.length > 0 
                ? `<div class="mt-1">${inclusionBadges.join(' ')}</div>` 
                : '';
            
            templateItem.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1"><i class="fas fa-file-code me-2"></i>${escapeHtml(template.name)}</h6>
                        <p class="mb-1 small text-body-secondary">${escapeHtml(template.description || 'No description')}</p>
                        <small class="text-body-secondary">
                            <span class="badge bg-secondary">${escapeHtml(template.server_type)}</span>
                            <span class="badge bg-secondary">${escapeHtml(template.version)}</span>
                        </small>
                        ${inclusionHtml}
                    </div>
                    <div class="btn-group-vertical btn-group-sm">
                        <button class="btn btn-outline-success use-template-btn" data-template-id="${escapeHtml(template.id)}" title="Use Template">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn btn-outline-primary export-template-btn" data-template-id="${escapeHtml(template.id)}" title="Export">
                            <i class="fas fa-file-export"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-template-btn" data-template-id="${escapeHtml(template.id)}" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            templatesList.appendChild(templateItem);
        });
        
        // Add event listeners
        document.querySelectorAll('.use-template-btn').forEach(btn => {
            btn.addEventListener('click', () => openCreateFromTemplate(btn.dataset.templateId));
        });
        
        document.querySelectorAll('.export-template-btn').forEach(btn => {
            btn.addEventListener('click', () => exportTemplate(btn.dataset.templateId));
        });
        
        document.querySelectorAll('.delete-template-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteTemplate(btn.dataset.templateId));
        });
    };
    
    // Update template select dropdown
    const updateTemplateSelect = () => {
        if (!templateSelect) return;
        
        templateSelect.innerHTML = '';
        
        if (!templates || templates.length === 0) {
            templateSelect.innerHTML = '<option value="">No templates available</option>';
            return;
        }
        
        templateSelect.innerHTML = '<option value="">Select a template...</option>';
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} (${template.server_type} ${template.version})`;
            templateSelect.appendChild(option);
        });
    };
    
    // Open create from template modal
    const openCreateFromTemplate = (templateId = null) => {
        if (templateId) {
            templateSelect.value = templateId;
        }
        createFromTemplateModal.show();
    };
    
    // Create server from template
    const createFromTemplate = async () => {
        const templateId = templateSelect.value;
        const serverName = newServerName.value.trim();
        const port = parseInt(newServerPort.value);
        
        if (!templateId) {
            Swal.fire('Error', 'Please select a template', 'error');
            return;
        }
        
        if (!serverName) {
            Swal.fire('Error', 'Please enter a server name', 'error');
            return;
        }
        
        if (!port || port < 1024 || port > 65535) {
            Swal.fire('Error', 'Port must be between 1024 and 65535', 'error');
            return;
        }
        
        createFromTemplateModal.hide();
        
        Swal.fire({
            title: 'Creating Server...',
            text: `Creating server from template...`,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const response = await fetch(`${API_URL}/api/servers/create-from-template`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    template_id: templateId,
                    server_name: serverName,
                    port: port
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create server');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            newServerName.value = '';
            newServerPort.value = '25565';
            fetchServers();
            
        } catch (error) {
            console.error('Error creating server from template:', error);
            Swal.fire('Error', error.message || 'Failed to create server', 'error');
        }
    };
    
    // Export template
    const exportTemplate = (templateId) => {
        const downloadUrl = `${API_URL}/api/templates/${encodeURIComponent(templateId)}/export`;
        window.location.href = downloadUrl;
    };
    
    // Delete template
    const deleteTemplate = async (templateId) => {
        const template = templates.find(t => t.id === templateId);
        
        const result = await Swal.fire({
            title: 'Delete Template?',
            text: `Are you sure you want to delete "${template?.name || templateId}"?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Delete',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc3545'
        });
        
        if (!result.isConfirmed) return;
        
        try {
            const response = await fetch(`${API_URL}/api/templates/${encodeURIComponent(templateId)}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Deletion failed');
            }
            
            await Swal.fire('Deleted!', data.message, 'success');
            fetchTemplates();
            
        } catch (error) {
            console.error('Error deleting template:', error);
            Swal.fire('Error', error.message || 'Failed to delete template', 'error');
        }
    };
    
    // Import template
    const importTemplate = async () => {
        const file = templateFileInput.files[0];
        
        if (!file) {
            Swal.fire('Error', 'Please select a JSON file', 'error');
            return;
        }
        
        importTemplateModal.hide();
        
        Swal.fire({
            title: 'Importing...',
            text: 'Importing template...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${API_URL}/api/templates/import`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Import failed');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            templateFileInput.value = '';
            fetchTemplates();
            
        } catch (error) {
            console.error('Error importing template:', error);
            Swal.fire('Error', error.message || 'Failed to import template', 'error');
        }
    };
    
    // Event listeners
    if (createFromTemplateBtn) {
        createFromTemplateBtn.addEventListener('click', () => openCreateFromTemplate());
    }
    
    if (importTemplateBtn) {
        importTemplateBtn.addEventListener('click', () => importTemplateModal.show());
    }
    
    if (confirmCreateFromTemplate) {
        confirmCreateFromTemplate.addEventListener('click', createFromTemplate);
    }
    
    if (confirmImportTemplate) {
        confirmImportTemplate.addEventListener('click', importTemplate);
    }
    
    // Fetch templates on page load
    fetchTemplates();
    
    // Utility function for escaping HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}); 