const API_URL = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', () => {
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

    const openFileExplorer = async (path = '') => {
        try {
            const response = await fetch(`${API_URL}/api/browse?path=${encodeURIComponent(path)}`);
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