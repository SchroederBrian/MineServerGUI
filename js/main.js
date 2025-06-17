document.addEventListener('DOMContentLoaded', () => {
    const serverListElement = document.getElementById('serverList');
    const createServerForm = document.getElementById('createServerForm');
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

    // Handle server creation
    createServerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const createButton = e.target.querySelector('button[type="submit"]');
        const originalButtonText = createButton.innerHTML;
        createButton.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Creating...`;
        createButton.disabled = true;

        const serverData = {
            server_name: document.getElementById('serverName').value,
            server_type: document.getElementById('serverType').value.toLowerCase(),
            version: document.getElementById('minecraftVersion').value,
            port: document.getElementById('port').value,
            eula_accepted: document.getElementById('eula-accept').checked,
        };
        
        try {
            const response = await fetch(`${API_URL}/api/servers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverData)
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Server creation failed');
            }
            await fetchServers();
            createServerForm.reset();
        } catch (error) {
            console.error('Error creating server:', error);
            alert(`Error: ${error.message}`);
        } finally {
            createButton.innerHTML = originalButtonText;
            createButton.disabled = false;
        }
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
            if (confirm(`Are you sure you want to permanently delete the server "${serverId}"? This cannot be undone.`)) {
                try {
                    const response = await fetch(`${API_URL}/api/servers/${serverId}`, { method: 'DELETE' });
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to delete server');
                    }
                    await fetchServers(); // Refresh the list
                } catch (error) {
                    console.error('Error deleting server:', error);
                    alert(`Error: ${error.message}`);
                }
            }
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