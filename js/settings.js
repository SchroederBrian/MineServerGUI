const API_URL = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', () => {
    const settingsModal = document.getElementById('settingsModal');
    const serversDirInput = document.getElementById('servers-dir-input');
    const configsDirInput = document.getElementById('configs-dir-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const screenList = document.getElementById('screen-list');
    const terminateAllScreensBtn = document.getElementById('terminate-all-screens-btn');

    const fetchConfig = async () => {
        try {
            const response = await fetch(`${API_URL}/api/config`);
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

    const saveConfig = async () => {
        try {
            const response = await fetch(`${API_URL}/api/config`, {
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
        }
    };

    const fetchScreens = async () => {
        try {
            const response = await fetch(`${API_URL}/api/screens`);
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
                const response = await fetch(`${API_URL}/api/screens/terminate-all`, { method: 'POST' });
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