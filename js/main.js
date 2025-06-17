document.addEventListener('DOMContentLoaded', () => {
    const serverListElement = document.getElementById('serverList');
    const createServerBtn = document.getElementById('createServerBtn');
    const API_URL = 'http://127.0.0.1:5000';

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
            const response = await fetch(`${API_URL}/api/servers`);
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
                        const response = await fetch(`${API_URL}/api/servers/${serverId}`, { method: 'DELETE' });
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/${action}`, { method: 'POST' });
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
}); 