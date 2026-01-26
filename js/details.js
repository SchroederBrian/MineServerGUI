document.addEventListener('DOMContentLoaded', async function () {
    const API_URL = 'http://127.0.0.1:5000';
    const params = new URLSearchParams(window.location.search);
    const serverId = params.get('id');

    // --- Fetch Wrapper with Credentials ---
    const authenticatedFetch = (url, options = {}) => {
        return fetch(url, {
            ...options,
            credentials: 'include'
        });
    };

    // --- Authentication Check ---
    let currentUser = null;
    let userPermissions = null;
    
    async function checkAuthentication() {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/auth/status`);
            const data = await response.json();
            
            if (!data.authenticated) {
                window.location.href = 'login.html';
                return false;
            }
            
            // Store user info
            currentUser = {
                username: data.username,
                role: data.role,
                is_admin: data.is_admin
            };
            
            return true;
        } catch (error) {
            console.error('Authentication check failed:', error);
            window.location.href = 'login.html';
            return false;
        }
    }
    
    async function loadUserPermissions() {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/user/permissions/${serverId}`);
            userPermissions = await response.json();
        } catch (error) {
            console.error('Error loading permissions:', error);
        }
    }
    
    function activateFirstAllowedTab() {
        // Find the first visible tab and activate it
        const tabButtons = document.querySelectorAll('#myTab .nav-link');
        const tabPanes = document.querySelectorAll('#myTabContent .tab-pane');
        
        // First, deactivate all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('show', 'active'));
        
        // Find and activate the first visible tab
        for (let i = 0; i < tabButtons.length; i++) {
            const button = tabButtons[i];
            const parentLi = button.parentElement;
            
            // Check if tab is visible (not hidden by permissions)
            if (parentLi && parentLi.style.display !== 'none' && button.style.display !== 'none') {
                // Activate this tab
                button.classList.add('active');
                
                // Find and activate corresponding pane
                const targetPaneId = button.getAttribute('data-bs-target');
                if (targetPaneId) {
                    const targetPane = document.querySelector(targetPaneId);
                    if (targetPane) {
                        targetPane.classList.add('show', 'active');
                    }
                }
                
                console.log(`[TAB] Auto-selected first allowed tab: ${button.textContent.trim()}`);
                break;
            }
        }
    }
    
    function applyPermissionRestrictions() {
        if (!userPermissions) {
            console.error('Cannot apply restrictions: permissions not loaded');
            return;
        }
        
        if (currentUser.is_admin) {
            // Admins have full access - show everything
            return;
        }
        
        // ===== GRANULAR PERMISSION ENFORCEMENT =====
        
        // --- Viewing Permissions ---
        if (!userPermissions.can_view_logs) {
            const logsTabNav = document.querySelector('#logs-tab').parentElement;
            if (logsTabNav) logsTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_view_analytics) {
            const analyticsTabNav = document.querySelector('#analytics-tab').parentElement;
            if (analyticsTabNav) analyticsTabNav.style.display = 'none';
        }
        
        // --- Server Control Permissions ---
        if (!userPermissions.can_start_server) {
            if (startBtn) startBtn.style.display = 'none';
        }
        
        if (!userPermissions.can_stop_server) {
            if (stopBtn) stopBtn.style.display = 'none';
        }
        
        if (!userPermissions.can_restart_server) {
            if (restartBtn) restartBtn.style.display = 'none';
        }
        
        // Hide entire control footer if user has no server control permissions
        if (!userPermissions.can_start_server && !userPermissions.can_stop_server && !userPermissions.can_restart_server) {
            const controlFooter = document.querySelector('.card-footer.bg-dark-tertiary');
            if (controlFooter) controlFooter.style.display = 'none';
        }
        
        // --- Configuration & Management Permissions ---
        if (!userPermissions.can_edit_properties) {
            const propertiesTabNav = document.querySelector('#properties-tab').parentElement;
            if (propertiesTabNav) propertiesTabNav.style.display = 'none';
            
            const savePropertiesBtn = document.getElementById('save-properties-btn');
            if (savePropertiesBtn) savePropertiesBtn.style.display = 'none';
        }
        
        if (!userPermissions.can_edit_files) {
            const filesTabNav = document.querySelector('#files-tab').parentElement;
            if (filesTabNav) filesTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_manage_backups) {
            const backupsTabNav = document.querySelector('#backups-tab').parentElement;
            if (backupsTabNav) backupsTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_manage_worlds) {
            const worldsTabNav = document.querySelector('#worlds-tab').parentElement;
            if (worldsTabNav) worldsTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_manage_scheduler) {
            const schedulerTabNav = document.querySelector('#scheduler-tab').parentElement;
            if (schedulerTabNav) schedulerTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_manage_plugins) {
            const pluginsTabNav = document.getElementById('plugins-tab-nav');
            if (pluginsTabNav) pluginsTabNav.style.display = 'none';
        }
        
        if (!userPermissions.can_change_settings) {
            const settingsTabNav = document.querySelector('#settings-tab').parentElement;
            if (settingsTabNav) settingsTabNav.style.display = 'none';
            
            // Hide port edit button
            if (editPortBtn) editPortBtn.style.display = 'none';
            
            // Hide clear logs button
            if (clearLogsBtn) clearLogsBtn.style.display = 'none';
        }
        
        // --- Console Permission ---
        if (!userPermissions.can_access_console) {
            const consoleTabNav = document.querySelector('#console-tab').parentElement;
            if (consoleTabNav) consoleTabNav.style.display = 'none';
            
            if (consoleInputEl) consoleInputEl.style.display = 'none';
            
            const saveCommandBtn = document.getElementById('save-command-btn');
            if (saveCommandBtn) saveCommandBtn.style.display = 'none';
        }
        
        // --- Danger Zone Permission ---
        if (!userPermissions.can_delete_server) {
            const deleteServerBtn = document.getElementById('delete-server-btn');
            if (deleteServerBtn) deleteServerBtn.style.display = 'none';
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
            const response = await authenticatedFetch(`${API_URL}/api/config`);
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

    if (!serverId) {
        window.location.href = 'index.html';
        return;
    }

    // --- DOM Elements ---
    const serverNameEl = document.getElementById('serverName');
    const minecraftVersionEl = document.getElementById('minecraftVersion');
    const portInput = document.getElementById('port-input');
    const editPortBtn = document.getElementById('edit-port-btn');
    const savePortBtn = document.getElementById('save-port-btn');
    const cancelPortBtn = document.getElementById('cancel-port-btn');
    const eulaCheckbox = document.getElementById('eula');
    const statusTextEl = document.getElementById('statusText');

    const startBtn = document.getElementById('startServerBtn');
    const stopBtn = document.getElementById('stopServerBtn');
    const restartBtn = document.getElementById('restartServerBtn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    
    const playerCountEl = document.getElementById('playerCount');
    const pingEl = document.getElementById('ping');
    const cpuUsageBar = document.getElementById('cpuUsageBar');
    const memoryUsageBar = document.getElementById('memoryUsageBar');
    const memoryUsageText = document.getElementById('memoryUsageText');
    
    // Logs & Console
    const logOutputEl = document.getElementById('log-output');
    const logAutoscrollSwitch = document.getElementById('log-autoscroll-switch');
    const reloadLogsBtn = document.getElementById('reload-logs-btn');
    const consoleInputEl = document.getElementById('console-input');
    const saveCommandBtn = document.getElementById('save-command-btn');
    const savedCommandsContainer = document.getElementById('saved-commands-container');
    const noSavedCommandsMsg = document.getElementById('no-saved-commands-msg');
    
    // File Explorer
    const fileExplorerView = document.getElementById('file-explorer-view');
    const fileEditorView = document.getElementById('file-editor');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const fileListContainer = document.getElementById('file-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    const reloadFilesBtn = document.getElementById('reload-files-btn');
    const selectionActionBar = document.getElementById('selection-action-bar');
    const selectionCountEl = document.getElementById('selection-count');
    const renameBtn = document.getElementById('rename-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const fileUploadInput = document.getElementById('file-upload-input');
    
    // File Editor
    const editingFilenameEl = document.getElementById('editing-filename');
    const fileContentEditor = document.getElementById('file-content-editor');
    const saveFileBtn = document.getElementById('save-file-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    
    // Server Properties
    const propertiesTab = document.getElementById('properties-tab');
    const propertiesFormContainer = document.getElementById('properties-form-container');
    const savePropertiesBtn = document.getElementById('save-properties-btn');

    // Backup Settings
    const backupsTab = document.getElementById('backups-tab');
    const backupLocationInput = document.getElementById('backup-location-input');
    const backupFrequencySelect = document.getElementById('backup-frequency-select');
    const backupRetentionInput = document.getElementById('backup-retention-input');
    const saveBackupSettingsBtn = document.getElementById('save-backup-settings-btn');
    const browseBackupsBtn = document.querySelector('.browse-backups-btn');
    const backupNowBtn = document.getElementById('backup-now-btn');

    // File Explorer Modal (for backups)
    const fileExplorerModal = new bootstrap.Modal(document.getElementById('fileExplorerModal'));
    const fileExplorerList = document.getElementById('fileExplorerList');
    const currentPathDisplay = document.getElementById('currentPathDisplay');
    const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');
    let activeInputId = null;

    // Settings/Installation
    const commandListEl = document.getElementById('command-list');
    const newCommandInput = document.getElementById('new-command-input');
    const addCommandBtn = document.getElementById('add-command-btn');
    const saveScriptBtn = document.getElementById('save-script-btn');
    const runInstallBtn = document.getElementById('run-install-btn');

    // Start Commands
    const startCommandListEl = document.getElementById('start-command-list');
    const newStartCommandInput = document.getElementById('new-start-command-input');
    const addStartCommandBtn = document.getElementById('add-start-command-btn');
    const saveStartScriptBtn = document.getElementById('save-start-script-btn');

    // RAM Editor
    const ramEditorControls = document.getElementById('ram-editor-controls');
    const ramSlider = document.getElementById('ram-slider');
    const ramSliderValue = document.getElementById('ram-slider-value');
    const saveRamBtn = document.getElementById('save-ram-btn');
    const ramHelperText = document.getElementById('ram-helper-text');
    const ramAllo = document.getElementById('ram-allocation');
    const reapplyEulaBtn = document.getElementById('reapply-eula-btn');

    // Software Changer
    const loaderSelect = document.getElementById('loader-select');
    const versionSelect = document.getElementById('version-select');
    const changeSoftwareBtn = document.getElementById('change-software-btn');

    // Java Installation
    const javaInstallPanel = document.getElementById('java-install-panel');
    const javaVersionSelect = document.getElementById('java-version-select');
    const installJavaBtn = document.getElementById('install-java-btn');

    // Task Scheduler
    const schedulerTab = document.getElementById('scheduler-tab');
    const taskListContainer = document.getElementById('task-list-container');
    const noTasksMsg = document.getElementById('no-tasks-msg');
    const addTaskBtn = document.getElementById('add-task-btn');

    // Danger Zone
    const deleteServerBtn = document.getElementById('delete-server-btn');

    let currentPath = '.';
    let selectedFiles = new Set();
    let currentLogLine = 0;
    let isLogAutoscrollEnabled = true;
    let currentServerState = {};
    let pollingInterval;

    // Load user permissions and apply restrictions AFTER DOM elements are defined
    await loadUserPermissions();
    if (userPermissions) {
        applyPermissionRestrictions();
        activateFirstAllowedTab();
    }

    // --- Unified Polling & State Management ---

    const stopPolling = () => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('[POLL] Polling stopped.');
        }
    };
    
    const startPolling = () => {
        if (pollingInterval) return; // Already running
        console.log('[POLL] Starting polling loop.');
        
        // Run immediately, then set interval
        poll(); 
        pollingInterval = setInterval(poll, 2000);
    };

    const poll = async () => {
        if (!serverId) {
            stopPolling();
            return;
        }

        try {
            // Fetch the main server details first
            const detailsResponse = await authenticatedFetch(`${API_URL}/api/servers/${serverId}`);
            if (!detailsResponse.ok) {
                if(detailsResponse.status === 404) {
                    console.error('[POLL] Server not found (404). Stopping poll.');
                    updateUIForNotFound();
                    stopPolling();
                }
                return;
            }
            const details = await detailsResponse.json();
            currentServerState = details;
            
            // Now, update the entire UI based on the new state
            updateUIDetails(details);
            
            if (details.status === 'Running') {
                const statusResponse = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/status`);
                // We still fetch status but no longer update UI with it.
                // This could be used for other things in the future.
            } else {
                // If stopped, reset metrics. The log will persist until the next start.
            }
            
            // Fetch logs only if auto-scrolling is enabled.
            if (isLogAutoscrollEnabled) {
                await fetchLogs();
            }
        } catch (error) {
            console.error('[POLL] Error during polling cycle:', error);
            // Don't stop polling on transient network errors, just log it.
        }
    };


    // --- UI Update Functions ---
    const updateUIForNotFound = () => {
        serverNameEl.textContent = 'Server Not Found';
        document.title = 'Error - Server Not Found';
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => btn.disabled = true);
        document.getElementById('danger-zone').innerHTML = '<p class="text-center text-danger">This server no longer exists.</p>';
        logOutputEl.innerHTML = '<p class="text-body-secondary">[Server does not exist]</p>';

    }
    const updateUIDetails = (data) => {
        const isRunning = data.status === 'Running';
        const isStopped = data.status === 'Stopped';

        // Update top section
        document.title = `${data.name} - Details`;
        serverNameEl.textContent = data.name;
        minecraftVersionEl.textContent = data.version || 'N/A';
        if (portInput.disabled) {
            portInput.value = data.port;
        }
        eulaCheckbox.checked = data.eula_accepted;

        // Update status indicator
        let statusClass = 'bg-secondary';
        if (isRunning) statusClass = 'bg-success';
        if (isStopped) statusClass = 'bg-danger';
        if (data.status === 'Starting' || data.status === 'Stopping') statusClass = 'bg-warning';
        statusTextEl.textContent = data.status;
        statusTextEl.className = `badge rounded-pill ${statusClass}`;

        // Update button states
        startBtn.disabled = !isStopped;
        stopBtn.disabled = !isRunning;
        restartBtn.disabled = !isRunning;
        consoleInputEl.disabled = !isRunning;
    };
    
    const updateUIMetrics = (data) => {
        // Handle player count
        playerCountEl.textContent = (data.players_online === 'N/A' || data.max_players === 'N/A')
            ? 'N/A'
            : `${data.players_online || 0} / ${data.max_players || 20}`;

        // Handle ping
        pingEl.textContent = (data.ping === 'N/A') ? 'N/A' : `${data.ping || 0} ms`;

        // Handle CPU usage
        const cpuPercent = data.cpu_usage;
        if (typeof cpuPercent === 'number') {
            cpuUsageBar.style.width = `${cpuPercent}%`;
            cpuUsageBar.textContent = `${cpuPercent.toFixed(1)}%`;
            cpuUsageBar.setAttribute('aria-valuenow', cpuPercent);
            cpuUsageBar.classList.remove('bg-secondary');
        } else {
            cpuUsageBar.style.width = '100%';
            cpuUsageBar.textContent = 'N/A';
            cpuUsageBar.setAttribute('aria-valuenow', 0);
            cpuUsageBar.classList.add('bg-secondary'); // Use a neutral color for N/A
        }

        // Handle Memory usage
        const memUsage = data.memory_usage;
        if (typeof memUsage === 'number') {
            const memTotal = 4096; // Assume 4GB for now
            const memPercent = memTotal > 0 ? (memUsage / memTotal) * 100 : 0;
            memoryUsageBar.style.width = `${memPercent}%`;
            memoryUsageBar.textContent = `${memPercent.toFixed(1)}%`;
            memoryUsageBar.setAttribute('aria-valuenow', memPercent);
            memoryUsageText.textContent = `${memUsage.toFixed(0)} MB / ${memTotal} MB`;
            memoryUsageBar.classList.remove('bg-secondary');
        } else {
            memoryUsageBar.style.width = '100%';
            memoryUsageBar.textContent = 'N/A';
            memoryUsageBar.setAttribute('aria-valuenow', 0);
            memoryUsageText.textContent = '0 MB / 4096 MB';
            memoryUsageBar.classList.add('bg-secondary');
        }
    };

    const resetMetrics = () => {
        playerCountEl.textContent = '0 / 20';
        pingEl.textContent = '0 ms';
        cpuUsageBar.style.width = '0%';
        cpuUsageBar.textContent = '0%';
        memoryUsageBar.style.width = '0%';
        memoryUsageBar.textContent = '0%';
        memoryUsageText.textContent = '0 MB / 4096 MB';
    };

    // --- Server Actions (Start/Stop) ---
    const handleServerAction = async (action) => {
        const btnMap = {
            start: startBtn,
            stop: stopBtn,
            restart: restartBtn
        };
        const btn = btnMap[action];
        if (!btn) return;

        // When starting, clear the old logs from the view for a fresh start.
        if (action === 'start') {
            logOutputEl.innerHTML = '<p class="text-body-secondary">[Starting server...]</p>';
            currentLogLine = 0;
        }

        console.log(`[ACTION] User triggered '${action}' for server '${serverId}'.`);
        const originalContent = btn.innerHTML;
        const actionText = action.charAt(0).toUpperCase() + action.slice(1);
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${actionText}ing...`;
        
        // Disable all action buttons during the operation to prevent conflicts
        Object.values(btnMap).forEach(b => b.disabled = true);

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/${action}`, { method: 'POST' });
            const data = await response.json(); // Always parse json to get the message or error

            if (!response.ok) {
                throw new Error(data.error || `Failed to ${action} server.`);
            }
            
            console.log(`[API SUCCESS] Action '${action}' completed:`, data.message);

        } catch (error) {
            console.error(`[CLIENT ERROR] Error during '${action}' action:`, error);
            Swal.fire({
                icon: 'error',
                title: `Failed to ${action} server`,
                text: error.message,
            });
        } finally {
            // The action is complete (success or failure), so restore the button's original content.
            btn.innerHTML = originalContent;
            // Trigger a poll immediately to get the fresh state, which will set all button disabled states correctly.
            poll();
        }
    };

    startBtn.addEventListener('click', () => handleServerAction('start'));
    stopBtn.addEventListener('click', () => handleServerAction('stop'));
    restartBtn.addEventListener('click', () => handleServerAction('restart'));
    
    // --- File Explorer ---
    reloadFilesBtn.addEventListener('click', () => {
        // Add a little visual feedback
        const icon = reloadFilesBtn.querySelector('i');
        icon.classList.add('fa-spin');
        fetchFiles(currentPath).finally(() => {
            icon.classList.remove('fa-spin');
        });
    });

    uploadBtn.addEventListener('click', () => {
        fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFiles(e.target.files);
        }
    });

    // Drag and drop upload
    fileListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileListContainer.classList.add('dragover');
    });

    fileListContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileListContainer.classList.remove('dragover');
    });

    fileListContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileListContainer.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    const updateSelectionActions = () => {
        const count = selectedFiles.size;
        if (count === 0) {
            selectionActionBar.classList.add('d-none');
            return;
        }
        
        selectionActionBar.classList.remove('d-none');
        selectionCountEl.textContent = `${count} item${count > 1 ? 's' : ''} selected`;
        renameBtn.disabled = count !== 1;
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const fetchFiles = async (path) => {
        // When fetching files, always clear the previous selection
        selectedFiles.clear();
        updateSelectionActions();

        if (loadingSpinner) loadingSpinner.classList.remove('d-none');
        fileListContainer.querySelectorAll('.list-group-item, .text-danger').forEach(el => el.remove());

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            const files = await response.json();
            renderFileList(files, path);
            currentPath = path;
        } catch (error) {
            console.error('File fetch error:', error);
            const errorEl = document.createElement('p');
            errorEl.className = 'text-danger p-3';
            errorEl.textContent = 'Could not load files.';
            fileListContainer.appendChild(errorEl);
        } finally {
            if (loadingSpinner) loadingSpinner.classList.add('d-none');
        }
    };
    
    const renderFileList = (files, path) => {
        renderBreadcrumb(path);
        const items = fileListContainer.querySelectorAll('.list-group-item');
        items.forEach(item => item.remove());

        if (path !== '.') {
            const parentDirItem = document.createElement('a');
            parentDirItem.href = '#';
            parentDirItem.className = 'list-group-item list-group-item-action list-group-item-dark-secondary d-flex align-items-center';
            parentDirItem.innerHTML = `<i class="fas fa-level-up-alt fa-fw me-3"></i> ..`;
            parentDirItem.onclick = (e) => {
                e.preventDefault();
                const parentPath = path.substring(0, path.lastIndexOf('/')) || '.';
                fetchFiles(parentPath);
            };
            fileListContainer.appendChild(parentDirItem);
        }
        
        files.sort((a, b) => {
            if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'list-group-item list-group-item-action list-group-item-dark d-flex align-items-center file-item';
            
            const icon = file.is_directory ? 'fa-folder text-warning' : 'fa-file-alt text-light';
            const isBinary = /\.(jar|zip|exe|dll|dat|png|jpg|jpeg|gif|bmp|so|a|class|lock)$/i.test(file.name);
            
            fileItem.innerHTML = `
                <input type="checkbox" class="form-check-input me-3" data-path="${file.path}">
                <i class="fas ${icon} fa-fw me-3"></i>
                <span class="file-name flex-grow-1">${file.name}</span>
                <small class="text-body-secondary me-2">${file.is_directory ? '' : formatFileSize(file.size)}</small>
            `;
            
            // Handle clicking on the file name to open/navigate
            fileItem.querySelector('.file-name').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent checkbox from toggling
                 if (fileItem.classList.contains('disabled')) return;

                const newPath = `${path}/${file.name}`.replace('./', '');
                if (file.is_directory) {
                    fetchFiles(newPath);
                } else {
                    openFileEditor(newPath);
                }
            });

            const checkbox = fileItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedFiles.add(file.path);
                } else {
                    selectedFiles.delete(file.path);
                }
                updateSelectionActions();
            });

            if (!file.is_directory && isBinary) {
                fileItem.classList.add('disabled');
                fileItem.title = "Binary files cannot be opened in the editor.";
            }

            fileListContainer.appendChild(fileItem);
        });
    };

    const renderBreadcrumb = (path) => {
        // Clear existing breadcrumb items except the root item
        const breadcrumbItems = breadcrumbEl.querySelectorAll('.breadcrumb-item');
        for (let i = 1; i < breadcrumbItems.length; i++) {
            breadcrumbItems[i].remove();
        }

        const parts = path.split('/').filter(p => p);

        let currentCrumbPath = '';
        parts.forEach((part, index) => {
            currentCrumbPath += (currentCrumbPath ? '/' : '') + part;
            const crumbItem = document.createElement('li');
            crumbItem.className = `breadcrumb-item ${index === parts.length - 1 ? 'active' : ''}`;
            if (index === parts.length - 1) {
                crumbItem.textContent = part;
            } else {
                const pathCopy = currentCrumbPath;
                crumbItem.innerHTML = `<a href="#">${part}</a>`;
                crumbItem.querySelector('a').onclick = (e) => { e.preventDefault(); fetchFiles(pathCopy); };
            }
            breadcrumbEl.appendChild(crumbItem);
        });
    };

    // --- File Editor ---
    const openFileEditor = async (filePath) => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`);
            if (!response.ok) throw new Error('Could not read file.');
            const data = await response.json();
            
            editingFilenameEl.textContent = filePath;
            fileContentEditor.value = data.content;
            saveFileBtn.dataset.path = filePath;

            fileExplorerView.classList.add('d-none');
            fileEditorView.classList.remove('d-none');
        } catch (error) {
            console.error('File open error:', error);
            Swal.fire('Error', `Error opening file: ${error.message}`, 'error');
        }
    };

    const closeFileEditor = () => {
        fileExplorerView.classList.remove('d-none');
        fileEditorView.classList.add('d-none');
        editingFilenameEl.textContent = '';
        fileContentEditor.value = '';
        delete saveFileBtn.dataset.path;
    };

    const saveFile = async () => {
        saveFileBtn.disabled = true;
        saveFileBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        const path = saveFileBtn.dataset.path;

        try {
            if (!path) {
                throw new Error("No file path specified for saving.");
            }
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files/content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: path,
                    content: fileContentEditor.value
                }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Failed to save file.");
            }
            Swal.fire({
                title: 'Success!',
                text: 'File saved successfully!',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
            });
            closeFileEditor();
        } catch (error) {
            console.error('Save error:', error);
            Swal.fire('Error', `Error saving file: ${error.message}`, 'error');
        } finally {
            saveFileBtn.disabled = false;
            saveFileBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save';
        }
    };
    
    saveFileBtn.addEventListener('click', saveFile);
    cancelEditBtn.addEventListener('click', closeFileEditor);

    // --- Logs & Console ---

    const cleanLogLine = (line) => {
        // This regex strips ANSI escape codes (e.g., color codes, cursor movement)
        const ansiRegex = /[\u001B\u009B][[()#;?]*.{0,6}(?:(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;
        let cleanedLine = line.replace(ansiRegex, '');
        
        // Handle carriage returns by taking only the last part of a line,
        // which is useful for overwriting lines like progress bars.
        if (cleanedLine.includes('\r')) {
            cleanedLine = cleanedLine.split('\r').pop();
        }

        return cleanedLine;
    };

    const fetchLogs = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/log?since=${currentLogLine}`);
            if (!response.ok) throw new Error(`Server returned status ${response.status}`);
            
            const data = await response.json();

            if (data.error) throw new Error(data.error);

            if (data.lines && data.lines.length > 0) {
                // If this is the first fetch, clear the "loading" message.
                if (currentLogLine === 0) {
                    logOutputEl.innerHTML = '';
                }
                data.lines.forEach(line => {
                    const cleanedLine = cleanLogLine(line);
                    // Don't render empty lines or standalone console prompts
                    if (cleanedLine.trim() === '' || cleanedLine.trim() === '>') {
                        return;
                    }
                    const p = document.createElement('p');
                    p.textContent = cleanedLine;
                    logOutputEl.appendChild(p);
                });
                // Auto-scroll to the bottom
                logOutputEl.scrollTop = logOutputEl.scrollHeight;
            }
            
            currentLogLine = data.line_count;

        } catch (error) {
            console.warn('Failed to fetch logs:', error);
        }
    };
    
    const clearLogs = async () => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You are about to clear all logs. This cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, clear them!'
        });

        if (!result.isConfirmed) {
            return;
        }
        
        const originalContent = clearLogsBtn.innerHTML;
        clearLogsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Clearing...';
        clearLogsBtn.disabled = true;
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/clear-logs`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to clear logs.');
            }
            
            // Clear the log display in the UI
            logOutputEl.innerHTML = '<p class="text-success m-0">[Logs cleared]</p>';
            currentLogLine = 0; // Reset the line counter
            
        } catch (error) {
            console.error('Error clearing logs:', error);
            Swal.fire('Error', `Error: ${error.message}`, 'error');
        } finally {
            clearLogsBtn.innerHTML = originalContent;
            clearLogsBtn.disabled = false;
        }
    };
    
    clearLogsBtn.addEventListener('click', clearLogs);
    
    // --- Saved Commands Functionality ---
    let savedCommands = [];
    
    // Load saved commands from localStorage
    const loadSavedCommands = () => {
        const savedData = localStorage.getItem(`mc_saved_commands_${serverId}`);
        if (savedData) {
            try {
                savedCommands = JSON.parse(savedData);
                renderSavedCommands();
            } catch (e) {
                console.error('Failed to parse saved commands:', e);
                savedCommands = [];
            }
        }
    };
    
    // Save commands to localStorage
    const saveSavedCommands = () => {
        localStorage.setItem(`mc_saved_commands_${serverId}`, JSON.stringify(savedCommands));
    };
    
    // Render the saved commands UI
    const renderSavedCommands = () => {
        if (savedCommands.length === 0) {
            noSavedCommandsMsg.style.display = 'block';
            savedCommandsContainer.querySelectorAll('.saved-command-item').forEach(el => el.remove());
            return;
        }
        
        noSavedCommandsMsg.style.display = 'none';
        savedCommandsContainer.querySelectorAll('.saved-command-item').forEach(el => el.remove());
        
        savedCommands.forEach((cmd, index) => {
            const commandItem = document.createElement('div');
            commandItem.className = 'list-group-item list-group-item-action list-group-item-dark d-flex justify-content-between align-items-center saved-command-item';
            
            commandItem.innerHTML = `
                <div class="d-flex align-items-center flex-grow-1">
                    <span class="font-monospace text-truncate">${escapeHtml(cmd)}</span>
                </div>
                <div class="d-flex">
                    <button class="btn btn-sm btn-primary me-2 run-saved-cmd-btn" data-index="${index}" title="Run command">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-saved-cmd-btn" data-index="${index}" title="Delete command">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
            
            // Add event listeners
            commandItem.querySelector('.run-saved-cmd-btn').addEventListener('click', () => {
                consoleInputEl.value = cmd;
                sendConsoleCommand();
            });
            
            commandItem.querySelector('.delete-saved-cmd-btn').addEventListener('click', () => {
                savedCommands.splice(index, 1);
                saveSavedCommands();
                renderSavedCommands();
            });
            
            savedCommandsContainer.appendChild(commandItem);
        });
    };
    
    // Save current command
    const saveCommand = () => {
        const command = consoleInputEl.value.trim();
        if (!command) {
            Swal.fire('Hold up!', 'Please enter a command to save.', 'info');
            return;
        }
        
        if (savedCommands.includes(command)) {
            Swal.fire('Heads up!', 'This command is already saved.', 'info');
            return;
        }
        
        savedCommands.push(command);
        saveSavedCommands();
        renderSavedCommands();
        
        // Optional: show feedback
        saveCommandBtn.classList.remove('btn-outline-success');
        saveCommandBtn.classList.add('btn-success');
        setTimeout(() => {
            saveCommandBtn.classList.remove('btn-success');
            saveCommandBtn.classList.add('btn-outline-success');
        }, 1000);
    };
    
    saveCommandBtn.addEventListener('click', saveCommand);
    
    const sendConsoleCommand = async () => {
        const command = consoleInputEl.value;
        if (!command) return;

        consoleInputEl.disabled = true;
        try {
            await authenticatedFetch(`${API_URL}/api/servers/${serverId}/console`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command }),
            });
            consoleInputEl.value = '';

        } catch (error) {
            console.error('Command send error:', error);
        } finally {
            consoleInputEl.disabled = false;
            consoleInputEl.focus();
        }
    };
    
    consoleInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendConsoleCommand();
    });

    // Add keyboard shortcut to save command with Ctrl+Enter
    consoleInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            saveCommand();
        }
    });

    // --- Installation Script ---
    let installCommands = [];

    const renderInstallScript = () => {
        renderCommands(commandListEl, installCommands, addCommandBtn, saveScriptBtn, newCommandInput, {
            onMove: (oldIndex, newIndex) => {
                if (newIndex < 0 || newIndex >= installCommands.length) return;
                [installCommands[oldIndex], installCommands[newIndex]] = [installCommands[newIndex], installCommands[oldIndex]];
                renderInstallScript();
            },
            onEdit: (index) => {
                Swal.fire({
                    title: 'Edit Command',
                    input: 'text',
                    inputValue: installCommands[index],
                    showCancelButton: true,
                    confirmButtonText: 'Save',
                    customClass: { popup: 'bg-dark text-white' }
                }).then((result) => {
                    if (result.isConfirmed && result.value) {
                        installCommands[index] = result.value;
                        renderInstallScript();
                    }
                });
            },
            onDelete: (index) => {
                installCommands.splice(index, 1);
                renderInstallScript();
            }
        });
    };

    const fetchInstallScript = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/install-script`);
            const data = await response.json();
            installCommands = data.commands || [];
            renderInstallScript();
        } catch (error) {
            console.error('Failed to fetch install script:', error);
            commandListEl.innerHTML = '<li class="list-group-item list-group-item-danger">Failed to load script</li>';
        }
    };

    const saveInstallScript = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/install-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: installCommands })
            });
            const result = await response.json();
            if (response.ok) {
                Swal.fire('Success', 'Install script saved!', 'success');
            } else {
                Swal.fire('Error', `Failed to save: ${result.error}`, 'error');
            }
        } catch (error) {
            Swal.fire('Error', `Error saving install script: ${error}`, 'error');
        }
    };
    
    addCommandBtn.addEventListener('click', () => {
        const newCommand = newCommandInput.value.trim();
        if (newCommand) {
            installCommands.push(newCommand);
            newCommandInput.value = '';
            renderInstallScript();
        }
    });
    
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return '';
        }
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    const runInstallation = async () => {
        const {
            value: confirmed
        } = await Swal.fire({
            title: 'Are you sure?',
            text: "This will run the installation script and may modify server files.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, run it!',
            cancelButtonText: 'Cancel'
        });

        if (confirmed) {
            Swal.fire({
                title: 'Installation Running',
                text: 'The installation is running in the background. You can monitor its progress in the Logs tab.',
                icon: 'info',
                showConfirmButton: false,
                timer: 3000,
                customClass: {
                    popup: 'bg-dark text-white'
                }
            });

        try {
                const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/install`, {
                    method: 'POST'
                });
            const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error);
                }
                // Optional: switch to the logs tab automatically
                const logsTab = new bootstrap.Tab(document.getElementById('logs-tab'));
                logsTab.show();
        } catch (error) {
                Swal.fire('Error', `Failed to start installation: ${error.message}`, 'error');
            }
        }
    };

    const installJava = async () => {
        const javaVersion = javaVersionSelect.value;
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: `This will install Java version ${javaVersion} and may take some time.`,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Yes, install it!',
            cancelButtonText: 'Cancel'
        });

        if (!result.isConfirmed) {
            return;
        }

        // Switch to the logs tab to show the output
        const logsTab = new bootstrap.Tab(document.getElementById('logs-tab'));
        logsTab.show();

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/java/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: javaVersion })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to start Java installation.');
            
            // The output will now appear in the logs tab automatically.
            Swal.fire('Success', data.message, 'success');

        } catch (error) {
             Swal.fire('Error', `[JAVA INSTALLATION FAILED TO START] ${error.message}`, 'error');
        }
    };
    
    saveScriptBtn.addEventListener('click', saveInstallScript);
    runInstallBtn.addEventListener('click', runInstallation);
    installJavaBtn.addEventListener('click', installJava);

    // --- Start Commands ---
    let startCommands = [];

    const renderStartScript = () => {
        renderCommands(startCommandListEl, startCommands, addStartCommandBtn, saveStartScriptBtn, newStartCommandInput, {
            onMove: (oldIndex, newIndex) => {
                if (newIndex < 0 || newIndex >= startCommands.length) return;
                [startCommands[oldIndex], startCommands[newIndex]] = [startCommands[newIndex], startCommands[oldIndex]];
                renderStartScript();
            },
            onEdit: (index) => {
                Swal.fire({
                    title: 'Edit Command',
                    input: 'text',
                    inputValue: startCommands[index],
                    showCancelButton: true,
                    confirmButtonText: 'Save',
                    customClass: { popup: 'bg-dark text-white' }
                }).then((result) => {
                    if (result.isConfirmed && result.value) {
                        startCommands[index] = result.value;
                        renderStartScript();
                    }
                });
            },
            onDelete: (index) => {
                startCommands.splice(index, 1);
                renderStartScript();
            }
        });
    };

    const fetchStartScript = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/start-script`);
            const data = await response.json();
            startCommands = data.commands || [];
            renderStartScript();
        } catch (error) {
            console.error('Failed to fetch start script:', error);
            startCommandListEl.innerHTML = '<li class="list-group-item list-group-item-danger">Failed to load script</li>';
        }
    };

    const saveStartScript = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/start-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: startCommands })
            });
            const result = await response.json();
            if (response.ok) {
                Swal.fire('Success', 'Start script saved!', 'success');
            } else {
                Swal.fire('Error', `Failed to save: ${result.error}`, 'error');
            }
        } catch (error) {
            Swal.fire('Error', `Error saving start script: ${error}`, 'error');
        }
    };

    addStartCommandBtn.addEventListener('click', () => {
        const newCommand = newStartCommandInput.value.trim();
        if (newCommand) {
            startCommands.push(newCommand);
            newStartCommandInput.value = '';
            renderStartScript();
        }
    });

    // --- RAM Editor ---
    const initializeRamEditor = () => {
        const javaCommandIndex = startCommands.findIndex(cmd => cmd.includes('java') && cmd.includes('.jar'));

        if (javaCommandIndex === -1) {
            ramHelperText.textContent = 'No compatible Java start command found. Add one with e.g., "java -jar server.jar" to manage RAM.';
            ramEditorControls.style.display = 'none';
            return;
        }
        
        ramEditorControls.style.display = 'block';
        const command = startCommands[javaCommandIndex];
        const ramMatch = command.match(/-Xmx(\d+)([GgMm])?/i);

        if (ramMatch && ramMatch[1]) {
            let ramValue = parseInt(ramMatch[1], 10);
            const unit = ramMatch[2] ? ramMatch[2].toUpperCase() : 'G';
            if (unit === 'M') {
                ramValue = Math.round(ramValue / 1024);
            }
            ramSlider.value = ramValue;
            ramSliderValue.textContent = `${ramValue} GB`;
            ramHelperText.textContent = 'Adjust the memory allocated to the server. Your start command will be updated.';
        } else {
            ramHelperText.textContent = 'Could not read current RAM value. Set a new one below.';
            ramSlider.value = 2; // Default to 2GB
            ramSliderValue.textContent = '2 GB';
        }
    };

    ramSlider.addEventListener('input', () => {
        ramSliderValue.textContent = `${ramSlider.value} GB`;
    });

    saveRamBtn.addEventListener('click', () => {
        const newRam = `${ramSlider.value}G`;
        const javaCommandIndex = startCommands.findIndex(cmd => cmd.includes('java') && cmd.includes('.jar'));

        if (javaCommandIndex === -1) {
            Swal.fire({
                title: 'Command Not Found',
                text: 'Could not find a Java start command to modify.',
                icon: 'error',
                customClass: { popup: 'bg-dark text-white' }
            });
            return;
        }
        
        let command = startCommands[javaCommandIndex];
        const hasXmx = /-Xmx\w+/.test(command);
        const hasXms = /-Xms\w+/.test(command);
        
        if (hasXmx) {
        command = command.replace(/-Xmx\w+/, `-Xmx${newRam}`);
        } else {
            command = command.replace(/java(?=\s)/, `java -Xmx${newRam}`);
        }

        if (hasXms) {
        command = command.replace(/-Xms\w+/, `-Xms${newRam}`);
        } else {
            command = command.replace(/(-Xmx\w+)/, `-Xms${newRam} $1`);
        }

        startCommands[javaCommandIndex] = command;
        saveStartScript();
        renderStartScript();
        Swal.fire({
            title: 'Success!',
            text: 'RAM settings have been updated in your start script.',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
            customClass: { popup: 'bg-dark text-white' }
        });
    });

    const settingsTab = document.getElementById('settings-tab');

    settingsTab.addEventListener('shown.bs.tab', function () {
        fetchInstallScript();
        fetchStartScript().then(() => {
            initializeRamEditor();
        });
        populateLoaders();
    });

    const deleteServer = async () => {
        const result = await Swal.fire({
            title: 'Are you absolutely sure?',
            text: "This action cannot be undone. All server data will be permanently deleted.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it!'
        });

        if (!result.isConfirmed) {
            return;
        }

        const originalContent = deleteServerBtn.innerHTML;
        deleteServerBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Deleting...`;
        deleteServerBtn.disabled = true;

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete server.');
            }

            // Remove server-specific data from localStorage
            localStorage.removeItem(`mc_saved_commands_${serverId}`);
            localStorage.removeItem(`mc_log_autoscroll_${serverId}`);
            console.log(`[CLEANUP] Removed saved commands and settings for server: ${serverId}`);

            await Swal.fire(
                'Deleted!',
                'Server has been deleted.',
                'success'
            );
            window.location.href = 'index.html';

        } catch (error) {
            Swal.fire('Error', `Error: ${error.message}`, 'error');
            deleteServerBtn.innerHTML = originalContent;
            deleteServerBtn.disabled = false;
        }
    };

    deleteServerBtn.addEventListener('click', deleteServer);

    // --- Log Controls ---
    const loadLogSettings = () => {
        const savedState = localStorage.getItem(`mc_log_autoscroll_${serverId}`);
        // Default to true if nothing is saved
        isLogAutoscrollEnabled = savedState === null ? true : savedState === 'true';
        logAutoscrollSwitch.checked = isLogAutoscrollEnabled;
    };

    logAutoscrollSwitch.addEventListener('change', () => {
        isLogAutoscrollEnabled = logAutoscrollSwitch.checked;
        localStorage.setItem(`mc_log_autoscroll_${serverId}`, isLogAutoscrollEnabled);
        // If we just re-enabled it, fetch the latest logs immediately.
        if (isLogAutoscrollEnabled) {
            fetchLogs();
        }
    });

    reloadLogsBtn.addEventListener('click', () => {
        const icon = reloadLogsBtn.querySelector('i');
        icon.classList.add('fa-spin');
        fetchLogs().finally(() => {
            icon.classList.remove('fa-spin');
        });
    });

    // --- Port Editing ---
    const togglePortEditMode = (isEditing) => {
        portInput.disabled = !isEditing;
        editPortBtn.classList.toggle('d-none', isEditing);
        savePortBtn.classList.toggle('d-none', !isEditing);
        cancelPortBtn.classList.toggle('d-none', !isEditing);
    };

    editPortBtn.addEventListener('click', () => togglePortEditMode(true));

    cancelPortBtn.addEventListener('click', () => {
        portInput.value = currentServerState.port; // Restore original value
        togglePortEditMode(false);
    });

    savePortBtn.addEventListener('click', async () => {
        const newPort = parseInt(portInput.value, 10);
        if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
            Swal.fire('Invalid Port', 'Please enter a valid port number (1024-65535).', 'warning');
            return;
        }

        savePortBtn.disabled = true;
        savePortBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/port`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port: newPort })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to save port.');
            }
            
            // Success, update state and UI
            currentServerState.port = newPort;
            togglePortEditMode(false);
            poll(); // Re-poll to get fresh server data confirmed from backend

        } catch (error) {
            Swal.fire('Error', `Error: ${error.message}`, 'error');
            portInput.value = currentServerState.port; // Revert on failure
        } finally {
            savePortBtn.disabled = false;
            savePortBtn.innerHTML = '<i class="fas fa-check"></i>';
        }
    });

    // --- Software Changer ---
    const populateLoaders = () => {
        const loaders = ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge', 'quilt'];
        loaderSelect.innerHTML = '';
        loaders.forEach(loader => {
            const option = document.createElement('option');
            option.value = loader;
            option.textContent = loader.charAt(0).toUpperCase() + loader.slice(1);
            loaderSelect.appendChild(option);
        });
        // Set the initial loader from the server state and fetch versions for it.
        loaderSelect.value = currentServerState.loader || 'vanilla';
        fetchVersionsForLoader(loaderSelect.value);
    };

    const fetchVersionsForLoader = async (loader) => {
        versionSelect.disabled = true;
        versionSelect.innerHTML = '<option>Loading versions...</option>';
        try {
            const response = await authenticatedFetch(`${API_URL}/api/loaders/${loader}/versions`);
            const versions = await response.json();
            if (response.ok) {
                versionSelect.innerHTML = '';
                versions.forEach(version => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    versionSelect.appendChild(option);
                });
            } else {
                versionSelect.innerHTML = '<option>Error loading versions</option>';
                console.error('Failed to fetch versions:', versions.error);
            }
        } catch (error) {
            versionSelect.innerHTML = '<option>Error loading versions</option>';
            console.error(`Error fetching versions for ${loader}:`, error);
        } finally {
            versionSelect.disabled = false;
        }
    };
    
    loaderSelect.addEventListener('change', () => {
        const selectedLoader = loaderSelect.value;
        fetchVersionsForLoader(selectedLoader);
    });

    const changeSoftware = async () => {
        const selectedLoader = loaderSelect.value;
        const selectedVersion = versionSelect.value;

        if (!selectedVersion || selectedVersion === 'Error loading versions' || selectedVersion === 'Loading versions...') {
            Swal.fire('Wait!', 'Please select a valid version.', 'info');
            return;
        }

        const result = await Swal.fire({
            title: 'Are you sure?',
            text: `This will replace your server.jar with ${selectedLoader} ${selectedVersion}. Make sure you have backups!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Yes, change it!'
        });

        if (result.isConfirmed) {
            const originalContent = changeSoftwareBtn.innerHTML;
            changeSoftwareBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Changing...`;
            changeSoftwareBtn.disabled = true;
            loaderSelect.disabled = true;
            versionSelect.disabled = true;

            try {
                const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/change-software`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        loader: selectedLoader,
                        version: selectedVersion 
                    })
                });
                const res = await response.json();
                if (response.ok) {
                    Swal.fire('Success!', res.message, 'success');
                    poll(); // Re-poll to get updated server details
                } else {
                    Swal.fire('Error', res.error, 'error');
                }
            } catch (error) {
                Swal.fire('Error', `An error occurred: ${error.message}`, 'error');
            } finally {
                changeSoftwareBtn.innerHTML = originalContent;
                changeSoftwareBtn.disabled = false;
                loaderSelect.disabled = false;
                versionSelect.disabled = false;
            }
        }
    };

    changeSoftwareBtn.addEventListener('click', changeSoftware);

    // --- Server Properties ---
    const fetchServerProperties = async () => {
        propertiesFormContainer.innerHTML = '<p class="text-center text-body-secondary">Loading properties...</p>';
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/properties`);
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to load server properties.');
            }
            const properties = await response.json();
            renderServerProperties(properties);
        } catch (error) {
            console.error(error);
            propertiesFormContainer.innerHTML = `<p class="text-danger text-center">${error.message}</p>`;
        }
    };

    const renderServerProperties = (properties) => {
        if (Object.keys(properties).length === 0) {
            propertiesFormContainer.innerHTML = '<p class="text-center text-body-secondary">No <code>server.properties</code> file found. It will be created on save.</p>';
            return;
        }

        let formHtml = '<form id="server-properties-form" class="row g-2">';
        const sortedKeys = Object.keys(properties).sort();

        for (const key of sortedKeys) {
            const value = properties[key];
            const id = `prop-${key.replace('.', '-')}`;
            
            let inputHtml = '';
            const commonClasses = "form-control form-control-sm bg-dark-subtle text-white";

            if (value === 'true' || value === 'false') {
                inputHtml = `
                    <select id="${id}" name="${key}" class="form-select form-select-sm bg-dark-subtle text-white">
                        <option value="true" ${value === 'true' ? 'selected' : ''}>true</option>
                        <option value="false" ${value === 'false' ? 'selected' : ''}>false</option>
                    </select>
                `;
            } else if (!isNaN(value) && value.trim() !== '' && !key.toLowerCase().includes('name') && !key.toLowerCase().includes('id') && !key.toLowerCase().includes('motd') && !key.includes('.')) {
                inputHtml = `<input type="number" id="${id}" name="${key}" value="${escapeHtml(value)}" class="${commonClasses}">`;
            } else {
                inputHtml = `<input type="text" id="${id}" name="${key}" value="${escapeHtml(value)}" class="${commonClasses}">`;
            }

            formHtml += `
                <div class="col-md-6 d-flex align-items-center">
                    <label for="${id}" class="form-label text-body-secondary font-monospace small mb-0 me-2 text-nowrap" title="${key}">${key}</label>
                    ${inputHtml}
                </div>
            `;
        }

        formHtml += '</form>';
        propertiesFormContainer.innerHTML = formHtml;
    };

    const saveServerProperties = async () => {
        const form = document.getElementById('server-properties-form');
        let properties = {};
        
        if (form) {
            const formData = new FormData(form);
            for (const [key, value] of formData.entries()) {
                properties[key] = value;
            }
        } else {
            // Handle case where form doesn't exist (e.g., no properties file yet)
            // In this case, there's nothing to save yet, but could be extended
            // to allow adding properties from scratch. For now, we just prevent errors.
            return;
        }

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/properties`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(properties),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to save properties.');
            }

            Swal.fire({
                title: 'Success!',
                text: 'Server properties saved. A restart is required for changes to take effect.',
                icon: 'success',
                customClass: { popup: 'bg-dark text-white' }
            });

        } catch (error) {
            Swal.fire({
                title: 'Error!',
                text: error.message,
                icon: 'error',
                customClass: { popup: 'bg-dark text-white' }
            });
        }
    };

    // --- Backup Settings ---
    const fetchBackupSettings = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/backups/settings`);
            if (!response.ok) throw new Error('Failed to load backup settings.');
            const settings = await response.json();
            
            backupLocationInput.value = settings.location;
            backupFrequencySelect.value = settings.frequency;
            backupRetentionInput.value = settings.retention;
        } catch (error) {
            console.error(error);
            // Optionally show an error to the user
        }
    };

    const saveBackupSettings = async () => {
        const settings = {
            location: backupLocationInput.value,
            frequency: backupFrequencySelect.value,
            retention: backupRetentionInput.value
        };

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/backups/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            Swal.fire('Success', 'Backup settings saved!', 'success');
        } catch (error) {
            Swal.fire('Error', `Failed to save backup settings: ${error.message}`, 'error');
        }
    };

    const triggerBackupNow = async () => {
        Swal.fire({
            title: 'Start Backup?',
            text: "This will start a new backup process immediately. This may take a while.",
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Yes, start it!',
            customClass: { popup: 'bg-dark text-white' }
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/backups/now`, { method: 'POST' });
                    const resData = await response.json();
                    if (!response.ok) throw new Error(resData.error);
                    
                    Swal.fire({
                        title: 'In Progress',
                        text: 'Backup started in the background. Check the backend console for progress.',
                        icon: 'success',
                        customClass: { popup: 'bg-dark text-white' }
                    });
                } catch (error) {
                    Swal.fire({
                        title: 'Error',
                        text: `Failed to start backup: ${error.message}`,
                        icon: 'error',
                        customClass: { popup: 'bg-dark text-white' }
                    });
                }
            }
        });
    };

    // --- Event Listeners ---
    if (deleteServerBtn) {
        deleteServerBtn.addEventListener('click', deleteServer);
    }
    if (propertiesTab) {
        propertiesTab.addEventListener('shown.bs.tab', fetchServerProperties);
    }
    if (savePropertiesBtn) {
        savePropertiesBtn.addEventListener('click', saveServerProperties);
    }
    if (backupsTab) {
        backupsTab.addEventListener('shown.bs.tab', fetchBackupSettings);
    }
    if (saveBackupSettingsBtn) {
        saveBackupSettingsBtn.addEventListener('click', saveBackupSettings);
    }
    if (backupNowBtn) {
        backupNowBtn.addEventListener('click', triggerBackupNow);
    }
    if (browseBackupsBtn) {
        browseBackupsBtn.addEventListener('click', () => {
            activeInputId = browseBackupsBtn.getAttribute('data-input-target');
            const currentPath = document.getElementById(activeInputId).value;
            openFileExplorer(currentPath);
            fileExplorerModal.show();
        });
    }

    // --- Task Scheduler ---

    const renderTasks = (tasks) => {
        taskListContainer.innerHTML = '';
        if (!tasks || tasks.length === 0) {
            taskListContainer.appendChild(noTasksMsg);
            noTasksMsg.style.display = 'block';
            return;
        }

        noTasksMsg.style.display = 'none';

        tasks.forEach(task => {
            const cronDescription = cronstrue.toString(task.cron, {
                verbose: true,
                use24HourTimeFormat: true
            });
            const actionIcon = {
                'start': 'fa-play text-success',
                'stop': 'fa-stop text-danger',
                'restart': 'fa-sync-alt text-warning',
                'command': 'fa-terminal text-info'
            }[task.action];

            const taskEl = document.createElement('div');
            taskEl.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            taskEl.innerHTML = `
                <div class="flex-grow-1">
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1 fw-bold">${escapeHtml(task.name)}</h5>
                        <small class="text-body-secondary">${task.enabled ? 'Enabled' : 'Disabled'}</small>
                    </div>
                    <p class="mb-1 text-body-secondary"><i class="far fa-calendar-alt me-2"></i><code>${task.cron}</code> &mdash; ${cronDescription}</p>
                    <small class="d-flex align-items-center"><i class="fas ${actionIcon} me-2"></i>
                        Action: <strong class="ms-1">${task.action}</strong>
                        ${task.action === 'command' ? `<code class="ms-2 font-monospace text-truncate" style="max-width: 300px;">${escapeHtml(task.command)}</code>` : ''}
                    </small>
                </div>
                <div class="ms-3">
                    <button class="btn btn-sm btn-outline-primary edit-task-btn" title="Edit Task"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-task-btn" title="Delete Task"><i class="fas fa-trash"></i></button>
                </div>
            `;
            
            taskEl.querySelector('.edit-task-btn').addEventListener('click', () => openTaskModal(task));
            taskEl.querySelector('.delete-task-btn').addEventListener('click', () => deleteTask(task.id));

            taskListContainer.appendChild(taskEl);
        });
    };

    const fetchTasks = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/tasks`);
            if (!response.ok) throw new Error('Failed to fetch tasks');
            const tasks = await response.json();
            renderTasks(tasks);
        } catch (error) {
            console.error(error);
            taskListContainer.innerHTML = '<p class="text-danger">Could not load scheduled tasks.</p>';
        }
    };

    const deleteTask = async (taskId) => {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "You are about to delete this scheduled task.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            customClass: { popup: 'bg-dark text-white' }
        });

        if (result.isConfirmed) {
            try {
                const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/tasks/${taskId}`, {
                    method: 'DELETE'
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to delete task.');
                }
                Swal.fire('Deleted!', 'The task has been deleted.', 'success');
                fetchTasks(); // Refresh list
            } catch (error) {
                Swal.fire('Error', error.message, 'error');
            }
        }
    };

    const openTaskModal = (task = {}) => {
        const isEditing = !!task.id;

        Swal.fire({
            title: isEditing ? 'Edit Scheduled Task' : 'Create a New Task',
            html: `
                <form id="swal-taskForm" class="text-start">
                    <div class="mb-3">
                        <label for="swal-taskName" class="form-label">Task Name</label>
                        <input type="text" id="swal-taskName" class="form-control bg-dark-subtle" placeholder="e.g., Daily Restart" value="${escapeHtml(task.name || '')}" required>
                    </div>
                    <div class="mb-3">
                        <label for="swal-taskCron" class="form-label">Cron Schedule (Minute Hour Day-of-Month Month Day-of-Week)</label>
                        <input type="text" id="swal-taskCron" class="form-control bg-dark-subtle" placeholder="e.g., 0 4 * * *" value="${escapeHtml(task.cron || '0 4 * * *')}" required>
                        <div id="cron-helper" class="form-text mt-1 text-info-emphasis"></div>
                    </div>
                    <div class="row g-2">
                        <div class="col-md-6 mb-3">
                            <label for="swal-taskAction" class="form-label">Action</label>
                            <select id="swal-taskAction" class="form-select bg-dark-subtle">
                                <option value="restart" ${task.action === 'restart' ? 'selected' : ''}>Restart</option>
                                <option value="start" ${task.action === 'start' ? 'selected' : ''}>Start</option>
                                <option value="stop" ${task.action === 'stop' ? 'selected' : ''}>Stop</option>
                                <option value="command" ${task.action === 'command' ? 'selected' : ''}>Run Command</option>
                            </select>
                        </div>
                        <div class="col-md-6 mb-3" id="swal-taskCommand-container">
                            <label for="swal-taskCommand" class="form-label">Command</label>
                            <input type="text" id="swal-taskCommand" class="form-control bg-dark-subtle" placeholder="e.g., say Server restarting soon!" value="${escapeHtml(task.command || '')}">
                        </div>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" role="switch" id="swal-taskEnabled" ${task.enabled !== false ? 'checked' : ''}>
                        <label class="form-check-label" for="swal-taskEnabled">Enabled</label>
                    </div>
                </form>
            `,
            showCancelButton: true,
            confirmButtonText: isEditing ? 'Save Changes' : 'Create Task',
            customClass: { popup: 'bg-dark text-white' },
            didOpen: () => {
                const cronInput = document.getElementById('swal-taskCron');
                const cronHelper = document.getElementById('cron-helper');
                const actionSelect = document.getElementById('swal-taskAction');
                const commandContainer = document.getElementById('swal-taskCommand-container');

                const updateCronHelper = () => {
                    try {
                        cronHelper.textContent = cronstrue.toString(cronInput.value);
                        cronHelper.classList.remove('text-danger');
                        cronHelper.classList.add('text-info-emphasis');
                        Swal.getConfirmButton().disabled = false;
                    } catch (e) {
                        cronHelper.textContent = e.toString();
                        cronHelper.classList.add('text-danger');
                        cronHelper.classList.remove('text-info-emphasis');
                        Swal.getConfirmButton().disabled = true;
                    }
                };

                const toggleCommandInput = () => {
                    commandContainer.style.display = actionSelect.value === 'command' ? 'block' : 'none';
                };

                cronInput.addEventListener('input', updateCronHelper);
                actionSelect.addEventListener('change', toggleCommandInput);
                
                // Initial state
                updateCronHelper();
                toggleCommandInput();
            },
            preConfirm: () => {
                const name = document.getElementById('swal-taskName').value;
                if (!name) {
                    Swal.showValidationMessage('Task Name is required');
                    return false;
                }
                return {
                    id: task.id,
                    name: name,
                    cron: document.getElementById('swal-taskCron').value,
                    action: document.getElementById('swal-taskAction').value,
                    command: document.getElementById('swal-taskCommand').value,
                    enabled: document.getElementById('swal-taskEnabled').checked
                };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                const taskData = result.value;
                const url = isEditing ? `${API_URL}/api/servers/${serverId}/tasks/${task.id}` : `${API_URL}/api/servers/${serverId}/tasks`;
                const method = isEditing ? 'PUT' : 'POST';

                try {
                    const response = await authenticatedFetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(taskData)
                    });
                    const res = await response.json();
                    if (!response.ok) {
                        throw new Error(res.error || 'Failed to save task.');
                    }
                    Swal.fire('Success!', `Task ${isEditing ? 'updated' : 'created'} successfully.`, 'success');
                    fetchTasks(); // Refresh the list
                } catch (error) {
                    Swal.fire('Error!', error.message, 'error');
                }
            }
        });
    };

    // --- Initial Load ---
    console.log(`[INIT] Initializing detail view for server: ${serverId}`);
    startPolling();
    fetchFiles(currentPath);
    fetchInstallScript();
    fetchStartScript();
    loadSavedCommands();
    loadLogSettings();

    deleteBtn.addEventListener('click', async () => {
        const count = selectedFiles.size;
        if (count === 0) return;

        const result = await Swal.fire({
            title: 'Are you sure?',
            text: `You are about to delete ${count} item${count > 1 ? 's' : ''}. This cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete them!'
        });

        if (!result.isConfirmed) {
            return;
        }

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths: Array.from(selectedFiles) })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete items.');

            Swal.fire('Deleted!', data.message, 'success');
        } catch (error) {
            Swal.fire('Error', `Error deleting files: ${error.message}`, 'error');
        } finally {
            fetchFiles(currentPath); // Refresh file list
        }
    });

    renameBtn.addEventListener('click', async () => {
        if (selectedFiles.size !== 1) return;
        
        const oldPath = Array.from(selectedFiles)[0];
        const oldName = oldPath.split('/').pop();
        
        const { value: newName } = await Swal.fire({
            title: 'Rename Item',
            input: 'text',
            inputValue: oldName,
            showCancelButton: true,
            inputValidator: (value) => {
                if (!value || value.trim() === '') {
                    return 'Name cannot be empty!';
                }
            }
        });

        if (!newName || newName.trim() === '' || newName.trim() === oldName) {
            return; // User cancelled or entered the same name
        }

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: oldPath, new_name: newName.trim() })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to rename item.');

        } catch (error) {
            Swal.fire('Error', `Error renaming file: ${error.message}`, 'error');
        } finally {
            fetchFiles(currentPath); // Refresh file list
        }
    });

    reapplyEulaBtn.addEventListener('click', async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/reapply-eula`, {
                method: 'POST',
            });
            const result = await response.json();
            if (response.ok) {
                Swal.fire({
                    title: 'Success!',
                    text: result.message,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false,
                });
                poll(); // Refresh details by polling
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            Swal.fire('Error', `Failed to re-apply EULA: ${error.message}`, 'error');
        }
    });

    const uploadFiles = async (files) => {
        const formData = new FormData();
        formData.append('path', currentPath);
        for (const file of files) {
            formData.append('files[]', file);
        }

        const originalBtnContent = uploadBtn.innerHTML;
        uploadBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Uploading...`;
        uploadBtn.disabled = true;

        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/files/upload`, {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (response.ok) {
                Swal.fire('Success', result.message, 'success');
                fetchFiles(currentPath); // Refresh the file list
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            Swal.fire('Upload Failed', error.message, 'error');
        } finally {
            uploadBtn.innerHTML = originalBtnContent;
            uploadBtn.disabled = false;
            // Clear the file input so the 'change' event fires again for the same file
            fileUploadInput.value = '';
        }
    };

    // --- Generic Command Rendering ---
    const renderCommands = (container, commands, addBtn, saveBtn, inputEl, callbacks) => {
        container.innerHTML = '';
        if (commands.length === 0) {
            container.innerHTML = '<div class="list-group-item list-group-item-dark text-body-secondary text-center">No commands defined.</div>';
        }

        commands.forEach((command, index) => {
            const commandEl = document.createElement('div');
            commandEl.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            commandEl.innerHTML = `
                <span class="command-text font-monospace">${escapeHtml(command)}</span>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-secondary move-up-btn" title="Move Up" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline-secondary move-down-btn" title="Move Down" ${index === commands.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
                    <button class="btn btn-sm btn-outline-primary edit-cmd-btn" title="Edit Command"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-cmd-btn" title="Delete Command"><i class="fas fa-trash"></i></button>
                </div>
            `;

            // Event Listeners for command actions
            commandEl.querySelector('.move-up-btn').addEventListener('click', () => callbacks.onMove(index, index - 1));
            commandEl.querySelector('.move-down-btn').addEventListener('click', () => callbacks.onMove(index, index + 1));
            commandEl.querySelector('.edit-cmd-btn').addEventListener('click', () => callbacks.onEdit(index));
            commandEl.querySelector('.delete-cmd-btn').addEventListener('click', () => callbacks.onDelete(index));

            container.appendChild(commandEl);
        });
    };

    // --- Shared File Explorer (for Backups, etc.) ---
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
            Swal.fire('Error', `Error opening file explorer: ${error.message}`, 'error');
        }
    };
    
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

    if (schedulerTab) {
        schedulerTab.addEventListener('shown.bs.tab', fetchTasks);
    }
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', () => openTaskModal());
    }

    // --- Player Management (Whitelist & Operators) ---
    
    const whitelistUsernameInput = document.getElementById('whitelist-username-input');
    const addWhitelistBtn = document.getElementById('add-whitelist-btn');
    const whitelistContainer = document.getElementById('whitelist-container');
    const noWhitelistMsg = document.getElementById('no-whitelist-msg');
    
    const opUsernameInput = document.getElementById('op-username-input');
    const opLevelSelect = document.getElementById('op-level-select');
    const addOpBtn = document.getElementById('add-op-btn');
    const operatorsContainer = document.getElementById('operators-container');
    const noOperatorsMsg = document.getElementById('no-operators-msg');
    
    const fetchWhitelist = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/whitelist`);
            if (!response.ok) throw new Error('Failed to fetch whitelist');
            const whitelist = await response.json();
            renderWhitelist(whitelist);
        } catch (error) {
            console.error('Error fetching whitelist:', error);
            whitelistContainer.innerHTML = '<div class="text-danger text-center p-3">Failed to load whitelist</div>';
        }
    };
    
    const renderWhitelist = (whitelist) => {
        whitelistContainer.innerHTML = '';
        
        if (!whitelist || whitelist.length === 0) {
            noWhitelistMsg.style.display = 'block';
            noWhitelistMsg.textContent = 'No players whitelisted yet';
            whitelistContainer.appendChild(noWhitelistMsg);
            return;
        }
        
        noWhitelistMsg.style.display = 'none';
        
        whitelist.forEach(player => {
            const playerItem = document.createElement('div');
            playerItem.className = 'list-group-item list-group-item-action list-group-item-dark d-flex justify-content-between align-items-center';
            
            playerItem.innerHTML = `
                <div class="d-flex align-items-center">
                    <img src="https://crafatar.com/avatars/${player.uuid}?size=32&overlay" 
                         class="rounded me-3" 
                         alt="${escapeHtml(player.name)}"
                         onerror="this.src='https://crafatar.com/avatars/steve?size=32&overlay'">
                    <div>
                        <strong>${escapeHtml(player.name)}</strong><br>
                        <small class="text-body-secondary font-monospace">${escapeHtml(player.uuid)}</small>
                    </div>
                </div>
                <button class="btn btn-sm btn-danger remove-whitelist-btn" data-uuid="${player.uuid}" title="Remove from whitelist">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            playerItem.querySelector('.remove-whitelist-btn').addEventListener('click', () => removeFromWhitelist(player.uuid, player.name));
            whitelistContainer.appendChild(playerItem);
        });
    };
    
    const addToWhitelist = async () => {
        const username = whitelistUsernameInput.value.trim();
        if (!username) {
            Swal.fire('Hold up!', 'Please enter a username', 'warning');
            return;
        }
        
        addWhitelistBtn.disabled = true;
        addWhitelistBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Adding...';
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/whitelist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add player');
            
            Swal.fire('Success!', data.message, 'success');
            whitelistUsernameInput.value = '';
            fetchWhitelist();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            addWhitelistBtn.disabled = false;
            addWhitelistBtn.innerHTML = '<i class="fas fa-plus me-2"></i>Add to Whitelist';
        }
    };
    
    const removeFromWhitelist = async (uuid, playerName) => {
        const result = await Swal.fire({
            title: 'Remove from whitelist?',
            text: `Remove ${playerName} from the whitelist?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, remove',
            confirmButtonColor: '#d33'
        });
        
        if (!result.isConfirmed) return;
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/whitelist/${uuid}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to remove player');
            
            Swal.fire('Removed!', data.message, 'success');
            fetchWhitelist();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    };
    
    const fetchOperators = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/operators`);
            if (!response.ok) throw new Error('Failed to fetch operators');
            const operators = await response.json();
            renderOperators(operators);
        } catch (error) {
            console.error('Error fetching operators:', error);
            operatorsContainer.innerHTML = '<div class="text-danger text-center p-3">Failed to load operators</div>';
        }
    };
    
    const renderOperators = (operators) => {
        operatorsContainer.innerHTML = '';
        
        if (!operators || operators.length === 0) {
            noOperatorsMsg.style.display = 'block';
            noOperatorsMsg.textContent = 'No operators set yet';
            operatorsContainer.appendChild(noOperatorsMsg);
            return;
        }
        
        noOperatorsMsg.style.display = 'none';
        
        operators.forEach(op => {
            const opItem = document.createElement('div');
            opItem.className = 'list-group-item list-group-item-action list-group-item-dark d-flex justify-content-between align-items-center';
            
            opItem.innerHTML = `
                <div class="d-flex align-items-center">
                    <img src="https://crafatar.com/avatars/${op.uuid}?size=32&overlay" 
                         class="rounded me-3" 
                         alt="${escapeHtml(op.name)}"
                         onerror="this.src='https://crafatar.com/avatars/steve?size=32&overlay'">
                    <div>
                        <strong>${escapeHtml(op.name)}</strong>
                        <span class="badge bg-warning text-dark ms-2">Level ${op.level}</span><br>
                        <small class="text-body-secondary font-monospace">${escapeHtml(op.uuid)}</small>
                    </div>
                </div>
                <button class="btn btn-sm btn-danger remove-op-btn" data-uuid="${op.uuid}" title="Remove operator">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            opItem.querySelector('.remove-op-btn').addEventListener('click', () => removeOperator(op.uuid, op.name));
            operatorsContainer.appendChild(opItem);
        });
    };
    
    const addOperator = async () => {
        const username = opUsernameInput.value.trim();
        const level = opLevelSelect.value;
        
        if (!username) {
            Swal.fire('Hold up!', 'Please enter a username', 'warning');
            return;
        }
        
        addOpBtn.disabled = true;
        addOpBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Adding...';
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/operators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, level: parseInt(level) })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to add operator');
            
            Swal.fire('Success!', data.message, 'success');
            opUsernameInput.value = '';
            fetchOperators();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            addOpBtn.disabled = false;
            addOpBtn.innerHTML = '<i class="fas fa-crown me-2"></i>Add Op';
        }
    };
    
    const removeOperator = async (uuid, playerName) => {
        const result = await Swal.fire({
            title: 'Remove operator status?',
            text: `Remove operator permissions from ${playerName}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, remove',
            confirmButtonColor: '#d33'
        });
        
        if (!result.isConfirmed) return;
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/operators/${uuid}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to remove operator');
            
            Swal.fire('Removed!', data.message, 'success');
            fetchOperators();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    };
    
    // Event listeners for player management
    if (addWhitelistBtn) {
        addWhitelistBtn.addEventListener('click', addToWhitelist);
        whitelistUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addToWhitelist();
        });
    }
    
    if (addOpBtn) {
        addOpBtn.addEventListener('click', addOperator);
        opUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addOperator();
        });
    }
    
    // Load player management when Settings tab is shown
    if (settingsTab) {
        settingsTab.addEventListener('shown.bs.tab', () => {
            fetchWhitelist();
            fetchOperators();
        });
    }
    
    // --- Player Analytics ---
    
    const analyticsTab = document.getElementById('analytics-tab');
    const refreshAnalyticsBtn = document.getElementById('refresh-analytics-btn');
    const onlinePlayersList = document.getElementById('online-players-list');
    const playtimeTableBody = document.getElementById('playtime-table-body');
    const peakHoursChart = document.getElementById('peak-hours-chart');
    const recentSessionsContainer = document.getElementById('recent-sessions-container');
    
    const refreshAnalytics = async () => {
        if (!refreshAnalyticsBtn) return;
        
        refreshAnalyticsBtn.disabled = true;
        refreshAnalyticsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Refreshing...';
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/analytics/refresh`, {
                method: 'POST'
            });
            
            if (!response.ok) throw new Error('Failed to refresh analytics');
            
            Swal.fire({
                title: 'Success!',
                text: 'Analytics data refreshed',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            
            // Reload all analytics data
            fetchAllAnalytics();
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            refreshAnalyticsBtn.disabled = false;
            refreshAnalyticsBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Refresh Data';
        }
    };
    
    const fetchOnlinePlayers = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/analytics/online`);
            if (!response.ok) throw new Error('Failed to fetch online players');
            const players = await response.json();
            renderOnlinePlayers(players);
        } catch (error) {
            console.error('Error fetching online players:', error);
        }
    };
    
    const renderOnlinePlayers = (players) => {
        if (!onlinePlayersList) return;
        
        onlinePlayersList.innerHTML = '';
        
        if (!players || players.length === 0) {
            onlinePlayersList.innerHTML = '<span class="text-body-secondary">No players online</span>';
            return;
        }
        
        players.forEach(playerName => {
            const badge = document.createElement('span');
            badge.className = 'badge bg-success';
            badge.innerHTML = `<i class="fas fa-circle me-1"></i>${escapeHtml(playerName)}`;
            onlinePlayersList.appendChild(badge);
        });
    };
    
    const fetchPlaytime = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/analytics/playtime`);
            if (!response.ok) throw new Error('Failed to fetch playtime data');
            const playtime = await response.json();
            renderPlaytime(playtime);
        } catch (error) {
            console.error('Error fetching playtime:', error);
            playtimeTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Failed to load playtime data</td></tr>';
        }
    };
    
    const renderPlaytime = (playtime) => {
        if (!playtimeTableBody) return;
        
        playtimeTableBody.innerHTML = '';
        
        if (!playtime || playtime.length === 0) {
            playtimeTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary">No playtime data available</td></tr>';
            return;
        }
        
        playtime.forEach(player => {
            const row = document.createElement('tr');
            const firstJoinDate = new Date(player.first_join * 1000).toLocaleDateString();
            const lastJoinDate = new Date(player.last_join * 1000).toLocaleString();
            const isNew = player.join_count === 1;
            
            row.innerHTML = `
                <td>
                    <strong>${escapeHtml(player.player)}</strong>
                    ${isNew ? '<span class="badge bg-info ms-2">New!</span>' : ''}
                </td>
                <td>${player.total_playtime_hours}h</td>
                <td>${player.join_count}</td>
                <td>${firstJoinDate}</td>
                <td>${lastJoinDate}</td>
            `;
            playtimeTableBody.appendChild(row);
        });
    };
    
    const fetchPeakHours = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/analytics/peak-hours`);
            if (!response.ok) throw new Error('Failed to fetch peak hours');
            const peakHours = await response.json();
            renderPeakHours(peakHours);
        } catch (error) {
            console.error('Error fetching peak hours:', error);
            peakHoursChart.innerHTML = '<div class="text-danger text-center">Failed to load peak hours data</div>';
        }
    };
    
    const renderPeakHours = (peakHours) => {
        if (!peakHoursChart) return;
        
        peakHoursChart.innerHTML = '';
        
        // Find max value for scaling
        const values = Object.values(peakHours);
        const maxValue = Math.max(...values, 1);
        
        // Create hour blocks
        const hoursContainer = document.createElement('div');
        hoursContainer.className = 'd-flex flex-wrap gap-2 justify-content-center';
        
        for (let hour = 0; hour < 24; hour++) {
            const count = peakHours[hour.toString()] || 0;
            const percentage = maxValue > 0 ? (count / maxValue) * 100 : 0;
            
            const hourBlock = document.createElement('div');
            hourBlock.className = 'text-center';
            hourBlock.style.width = '60px';
            
            // Color intensity based on activity
            let colorClass = 'bg-secondary';
            if (percentage > 75) colorClass = 'bg-danger';
            else if (percentage > 50) colorClass = 'bg-warning';
            else if (percentage > 25) colorClass = 'bg-info';
            else if (percentage > 0) colorClass = 'bg-primary';
            
            hourBlock.innerHTML = `
                <div class="rounded p-2 ${colorClass} mb-1" style="height: ${Math.max(30, percentage)}px; opacity: ${0.3 + (percentage / 100) * 0.7};" title="${count} sessions at ${hour}:00"></div>
                <small class="text-body-secondary">${hour}:00</small>
            `;
            
            hoursContainer.appendChild(hourBlock);
        }
        
        peakHoursChart.appendChild(hoursContainer);
    };
    
    const fetchRecentSessions = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/analytics/sessions`);
            if (!response.ok) throw new Error('Failed to fetch sessions');
            const sessions = await response.json();
            renderRecentSessions(sessions);
        } catch (error) {
            console.error('Error fetching sessions:', error);
            recentSessionsContainer.innerHTML = '<div class="text-danger text-center p-3">Failed to load sessions</div>';
        }
    };
    
    const renderRecentSessions = (sessions) => {
        if (!recentSessionsContainer) return;
        
        recentSessionsContainer.innerHTML = '';
        
        if (!sessions || sessions.length === 0) {
            recentSessionsContainer.innerHTML = '<div class="text-body-secondary text-center p-3">No session data available</div>';
            return;
        }
        
        sessions.slice(0, 20).forEach(session => {
            const sessionItem = document.createElement('div');
            sessionItem.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            
            const joinDate = new Date(session.join_time * 1000).toLocaleString();
            const leaveDate = session.leave_time ? new Date(session.leave_time * 1000).toLocaleString() : 'Still online';
            
            sessionItem.innerHTML = `
                <div>
                    <strong>${escapeHtml(session.player)}</strong><br>
                    <small class="text-body-secondary">
                        <i class="fas fa-sign-in-alt me-1"></i>${joinDate}
                        ${session.leave_time ? `<i class="fas fa-sign-out-alt ms-2 me-1"></i>${leaveDate}` : ''}
                    </small>
                </div>
                <span class="badge bg-primary">${session.duration_minutes}m</span>
            `;
            
            recentSessionsContainer.appendChild(sessionItem);
        });
    };
    
    const fetchAllAnalytics = () => {
        fetchOnlinePlayers();
        fetchPlaytime();
        fetchPeakHours();
        fetchRecentSessions();
    };
    
    if (refreshAnalyticsBtn) {
        refreshAnalyticsBtn.addEventListener('click', refreshAnalytics);
    }
    
    if (analyticsTab) {
        analyticsTab.addEventListener('shown.bs.tab', fetchAllAnalytics);
    }
    
    // Poll for online players when on analytics tab
    let analyticsPolling = null;
    if (analyticsTab) {
        analyticsTab.addEventListener('shown.bs.tab', () => {
            fetchAllAnalytics();
            analyticsPolling = setInterval(fetchOnlinePlayers, 5000); // Update every 5 seconds
        });
        
        // Stop polling when leaving analytics tab
        analyticsTab.addEventListener('hidden.bs.tab', () => {
            if (analyticsPolling) {
                clearInterval(analyticsPolling);
                analyticsPolling = null;
            }
        });
    }
    
    // ===========================
    // Plugin/Mod Manager
    // ===========================
    
    const pluginSearchInput = document.getElementById('plugin-search-input');
    const pluginSearchBtn = document.getElementById('plugin-search-btn');
    const pluginSearchResults = document.getElementById('plugin-search-results');
    const pluginSearchResultsContainer = document.getElementById('plugin-search-results-container');
    const installedPluginsContainer = document.getElementById('installed-plugins-container');
    const refreshPluginsBtn = document.getElementById('refresh-plugins-btn');
    const pluginsTab = document.getElementById('plugins-tab');
    const pluginsTabNav = document.getElementById('plugins-tab-nav');
    const pluginManagerTitle = document.getElementById('plugin-manager-title');
    const installedPluginType = document.getElementById('installed-plugin-type');
    
    let currentServerType = 'unknown';
    let folderType = 'plugins';
    
    // Check if server supports plugins/mods
    const checkPluginSupport = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/supports-plugins`);
            if (!response.ok) return;
            
            const data = await response.json();
            if (data.supports) {
                // Only show tab if user has permission (or is admin)
                if (currentUser.is_admin || (userPermissions && userPermissions.can_manage_plugins)) {
                    pluginsTabNav.style.display = 'block';
                    currentServerType = data.server_type;
                    folderType = data.folder_type;
                    
                    // Update UI labels based on folder type
                    if (folderType === 'mods') {
                        pluginManagerTitle.textContent = 'Mod Manager';
                        installedPluginType.textContent = 'Mods';
                        pluginSearchInput.placeholder = 'Search for mods...';
                    } else {
                        pluginManagerTitle.textContent = 'Plugin Manager';
                        installedPluginType.textContent = 'Plugins';
                        pluginSearchInput.placeholder = 'Search for plugins...';
                    }
                } else {
                    pluginsTabNav.style.display = 'none';
                }
            } else {
                pluginsTabNav.style.display = 'none';
            }
        } catch (error) {
            console.error('Error checking plugin support:', error);
            pluginsTabNav.style.display = 'none';
        }
    };
    
    // Fetch installed plugins
    const fetchInstalledPlugins = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/plugins`);
            if (!response.ok) throw new Error('Failed to fetch plugins');
            
            const plugins = await response.json();
            renderInstalledPlugins(plugins);
        } catch (error) {
            console.error('Error fetching plugins:', error);
            installedPluginsContainer.innerHTML = '<div class="text-danger text-center p-3">Failed to load plugins</div>';
        }
    };
    
    // Render installed plugins
    const renderInstalledPlugins = (plugins) => {
        if (!installedPluginsContainer) return;
        
        installedPluginsContainer.innerHTML = '';
        
        if (!plugins || plugins.length === 0) {
            installedPluginsContainer.innerHTML = `<div class="text-body-secondary text-center p-3">No ${folderType} installed</div>`;
            return;
        }
        
        plugins.forEach(plugin => {
            const pluginItem = document.createElement('div');
            pluginItem.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            
            pluginItem.innerHTML = `
                <div>
                    <i class="fas fa-puzzle-piece me-2"></i>
                    <strong>${escapeHtml(plugin.name)}</strong>
                    <br>
                    <small class="text-body-secondary">${plugin.size_mb} MB</small>
                </div>
                <button class="btn btn-sm btn-outline-danger delete-plugin-btn" data-filename="${escapeHtml(plugin.filename)}">
                    <i class="fas fa-trash-alt"></i> Remove
                </button>
            `;
            
            installedPluginsContainer.appendChild(pluginItem);
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-plugin-btn').forEach(btn => {
            btn.addEventListener('click', () => deletePlugin(btn.dataset.filename));
        });
    };
    
    // Search for plugins
    const searchPlugins = async () => {
        const query = pluginSearchInput.value.trim();
        if (!query) {
            Swal.fire('Error', 'Please enter a search term', 'error');
            return;
        }
        
        pluginSearchResultsContainer.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary" role="status"></div></div>';
        pluginSearchResults.style.display = 'block';
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/plugins/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error('Search failed');
            
            const results = await response.json();
            renderSearchResults(results);
        } catch (error) {
            console.error('Error searching plugins:', error);
            pluginSearchResultsContainer.innerHTML = '<div class="text-danger text-center p-3">Search failed. Please try again.</div>';
        }
    };
    
    // Render search results
    const renderSearchResults = (results) => {
        if (!pluginSearchResultsContainer) return;
        
        pluginSearchResultsContainer.innerHTML = '';
        
        if (!results || results.length === 0) {
            pluginSearchResultsContainer.innerHTML = '<div class="text-body-secondary text-center p-3">No results found</div>';
            return;
        }
        
        results.forEach(plugin => {
            const resultItem = document.createElement('div');
            resultItem.className = 'list-group-item list-group-item-dark';
            
            const iconHtml = plugin.icon_url 
                ? `<img src="${escapeHtml(plugin.icon_url)}" alt="${escapeHtml(plugin.name)}" style="width: 48px; height: 48px; object-fit: cover;" class="rounded me-3">`
                : '<i class="fas fa-puzzle-piece fa-2x me-3"></i>';
            
            const categoriesBadges = plugin.categories
                .slice(0, 3)
                .map(cat => `<span class="badge bg-secondary me-1">${escapeHtml(cat)}</span>`)
                .join('');
            
            resultItem.innerHTML = `
                <div class="d-flex align-items-start">
                    ${iconHtml}
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <h6 class="mb-1">${escapeHtml(plugin.name)}</h6>
                                <small class="text-body-secondary">by ${escapeHtml(plugin.author)}</small>
                            </div>
                            <button class="btn btn-sm btn-success install-plugin-btn" data-project-id="${escapeHtml(plugin.id)}" data-name="${escapeHtml(plugin.name)}">
                                <i class="fas fa-download me-1"></i> Install
                            </button>
                        </div>
                        <p class="mb-2 small">${escapeHtml(plugin.description)}</p>
                        <div class="d-flex gap-2 align-items-center">
                            ${categoriesBadges}
                            <small class="text-body-secondary ms-auto">
                                <i class="fas fa-download me-1"></i>${formatNumber(plugin.downloads)} downloads
                            </small>
                        </div>
                    </div>
                </div>
            `;
            
            pluginSearchResultsContainer.appendChild(resultItem);
        });
        
        // Add event listeners to install buttons
        document.querySelectorAll('.install-plugin-btn').forEach(btn => {
            btn.addEventListener('click', () => installPlugin(btn.dataset.projectId, btn.dataset.name));
        });
    };
    
    // Install a plugin
    const installPlugin = async (projectId, pluginName) => {
        const result = await Swal.fire({
            title: 'Install Plugin?',
            text: `Do you want to install ${pluginName}?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Install',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) return;
        
        Swal.fire({
            title: 'Installing...',
            text: `Installing ${pluginName}...`,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/plugins/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project_id: projectId })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Installation failed');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            fetchInstalledPlugins();
        } catch (error) {
            console.error('Error installing plugin:', error);
            Swal.fire('Error', error.message || 'Failed to install plugin', 'error');
        }
    };
    
    // Delete a plugin
    const deletePlugin = async (filename) => {
        const result = await Swal.fire({
            title: 'Remove Plugin?',
            text: `Are you sure you want to remove ${filename}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Remove',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc3545'
        });
        
        if (!result.isConfirmed) return;
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/plugins/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Deletion failed');
            }
            
            await Swal.fire('Removed!', data.message, 'success');
            fetchInstalledPlugins();
        } catch (error) {
            console.error('Error deleting plugin:', error);
            Swal.fire('Error', error.message || 'Failed to remove plugin', 'error');
        }
    };
    
    // Format number with commas
    const formatNumber = (num) => {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };
    
    // Event listeners
    if (pluginSearchBtn) {
        pluginSearchBtn.addEventListener('click', searchPlugins);
    }
    
    if (pluginSearchInput) {
        pluginSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchPlugins();
            }
        });
    }
    
    if (refreshPluginsBtn) {
        refreshPluginsBtn.addEventListener('click', fetchInstalledPlugins);
    }
    
    if (pluginsTab) {
        pluginsTab.addEventListener('shown.bs.tab', fetchInstalledPlugins);
    }
    
    // Check plugin support on page load
    checkPluginSupport();
    
    // ===========================
    // World Management
    // ===========================
    
    const worldsTab = document.getElementById('worlds-tab');
    const refreshWorldsBtn = document.getElementById('refresh-worlds-btn');
    const worldsListContainer = document.getElementById('worlds-list-container');
    const noWorldsMsg = document.getElementById('no-worlds-msg');
    const worldUploadForm = document.getElementById('world-upload-form');
    const worldNameInput = document.getElementById('world-name-input');
    const worldFileInput = document.getElementById('world-file-input');
    const uploadWorldBtn = document.getElementById('upload-world-btn');
    
    // Fetch worlds list
    const fetchWorlds = async () => {
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/worlds`);
            if (!response.ok) throw new Error('Failed to fetch worlds');
            
            const worlds = await response.json();
            renderWorlds(worlds);
        } catch (error) {
            console.error('Error fetching worlds:', error);
            if (worldsListContainer) {
                worldsListContainer.innerHTML = '<div class="text-danger text-center p-3">Failed to load worlds</div>';
            }
        }
    };
    
    // Render worlds list
    const renderWorlds = (worlds) => {
        if (!worldsListContainer) return;
        
        worldsListContainer.innerHTML = '';
        
        if (!worlds || worlds.length === 0) {
            worldsListContainer.innerHTML = '<div class="text-body-secondary text-center p-3">No worlds found</div>';
            return;
        }
        
        worlds.forEach(world => {
            const worldCard = document.createElement('div');
            worldCard.className = 'card bg-dark mb-3';
            
            const dimensionsInfo = [];
            if (world.has_nether) dimensionsInfo.push('<span class="badge bg-danger me-1"><i class="fas fa-fire me-1"></i>Nether</span>');
            if (world.has_end) dimensionsInfo.push('<span class="badge bg-purple me-1"><i class="fas fa-dragon me-1"></i>End</span>');
            
            worldCard.innerHTML = `
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1"><i class="fas fa-globe me-2"></i>${escapeHtml(world.name)}</h6>
                            <p class="text-body-secondary small mb-2">
                                <i class="fas fa-hdd me-1"></i>Size: ${world.size_mb} MB
                            </p>
                            <div>
                                ${dimensionsInfo.join('')}
                            </div>
                        </div>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-primary download-world-btn" data-world="${escapeHtml(world.name)}" title="Download World">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary dropdown-toggle dropdown-toggle-split" data-bs-toggle="dropdown" aria-expanded="false">
                                <span class="visually-hidden">More actions</span>
                            </button>
                            <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end">
                                ${world.has_nether ? `<li><a class="dropdown-item text-warning reset-dimension-btn" href="#" data-world="${escapeHtml(world.name)}" data-dimension="nether"><i class="fas fa-fire me-2"></i>Reset Nether</a></li>` : ''}
                                ${world.has_end ? `<li><a class="dropdown-item text-warning reset-dimension-btn" href="#" data-world="${escapeHtml(world.name)}" data-dimension="end"><i class="fas fa-dragon me-2"></i>Reset End</a></li>` : ''}
                            </ul>
                        </div>
                    </div>
                </div>
            `;
            
            worldsListContainer.appendChild(worldCard);
        });
        
        // Add event listeners
        document.querySelectorAll('.download-world-btn').forEach(btn => {
            btn.addEventListener('click', () => downloadWorld(btn.dataset.world));
        });
        
        document.querySelectorAll('.reset-dimension-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                resetDimension(btn.dataset.world, btn.dataset.dimension);
            });
        });
    };
    
    // Download world
    const downloadWorld = async (worldName) => {
        try {
            Swal.fire({
                title: 'Preparing Download...',
                text: `Creating ZIP file for ${worldName}. This may take a while for large worlds.`,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            // Trigger download
            const downloadUrl = `${API_URL}/api/servers/${serverId}/worlds/${encodeURIComponent(worldName)}/download`;
            window.location.href = downloadUrl;
            
            // Close loading after a delay
            setTimeout(() => {
                Swal.close();
            }, 2000);
            
        } catch (error) {
            console.error('Error downloading world:', error);
            Swal.fire('Error', 'Failed to download world', 'error');
        }
    };
    
    // Upload world
    const uploadWorld = async (e) => {
        e.preventDefault();
        
        const worldName = worldNameInput.value.trim();
        const file = worldFileInput.files[0];
        
        if (!worldName) {
            Swal.fire('Error', 'Please enter a world name', 'error');
            return;
        }
        
        if (!file) {
            Swal.fire('Error', 'Please select a ZIP file', 'error');
            return;
        }
        
        const result = await Swal.fire({
            title: 'Upload World?',
            html: `Upload <strong>${escapeHtml(file.name)}</strong> as world folder <strong>${escapeHtml(worldName)}</strong>?<br><br><span class="text-warning">⚠️ The server must be stopped. Existing world will be backed up.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Upload',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) return;
        
        Swal.fire({
            title: 'Uploading...',
            text: 'Uploading and extracting world. This may take a while...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('world_name', worldName);
            
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/worlds/upload`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            worldFileInput.value = '';
            fetchWorlds();
            
        } catch (error) {
            console.error('Error uploading world:', error);
            Swal.fire('Error', error.message || 'Failed to upload world', 'error');
        }
    };
    
    // Reset dimension
    const resetDimension = async (worldName, dimension) => {
        const result = await Swal.fire({
            title: `Reset ${dimension.charAt(0).toUpperCase() + dimension.slice(1)}?`,
            html: `This will delete the ${dimension} dimension in <strong>${escapeHtml(worldName)}</strong>.<br><br><span class="text-warning">⚠️ The server must be stopped. A backup will be created.</span>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, Reset',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#dc3545'
        });
        
        if (!result.isConfirmed) return;
        
        Swal.fire({
            title: 'Resetting...',
            text: `Resetting ${dimension} dimension...`,
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/servers/${serverId}/worlds/${encodeURIComponent(worldName)}/dimension/${dimension}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Reset failed');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            fetchWorlds();
            
        } catch (error) {
            console.error('Error resetting dimension:', error);
            Swal.fire('Error', error.message || 'Failed to reset dimension', 'error');
        }
    };
    
    // Event listeners
    if (refreshWorldsBtn) {
        refreshWorldsBtn.addEventListener('click', fetchWorlds);
    }
    
    if (worldUploadForm) {
        worldUploadForm.addEventListener('submit', uploadWorld);
    }
    
    if (worldsTab) {
        worldsTab.addEventListener('shown.bs.tab', fetchWorlds);
    }
    
    // ===========================
    // Save Server as Template
    // ===========================
    
    const saveAsTemplateBtn = document.getElementById('save-as-template-btn');
    const templateNameInput = document.getElementById('template-name-input');
    const templateDescInput = document.getElementById('template-desc-input');
    
    // Get checkbox elements
    const includeWorldCheckbox = document.getElementById('include-world');
    const includePluginsCheckbox = document.getElementById('include-plugins');
    const includeWhitelistCheckbox = document.getElementById('include-whitelist');
    const includeOpsCheckbox = document.getElementById('include-ops');
    const includeServerConfigsCheckbox = document.getElementById('include-server-configs');
    
    const saveAsTemplate = async () => {
        const templateName = templateNameInput.value.trim();
        
        if (!templateName) {
            Swal.fire('Error', 'Please enter a template name', 'error');
            return;
        }
        
        const description = templateDescInput.value.trim();
        
        // Get inclusion options
        const includeWorld = includeWorldCheckbox.checked;
        const includePlugins = includePluginsCheckbox.checked;
        const includeWhitelist = includeWhitelistCheckbox.checked;
        const includeOps = includeOpsCheckbox.checked;
        const includeServerConfigs = includeServerConfigsCheckbox.checked;
        
        // Build inclusion message
        const includes = [];
        if (includeServerConfigs) includes.push('configs');
        if (includeWorld) includes.push('world files');
        if (includePlugins) includes.push('plugins/mods');
        if (includeWhitelist) includes.push('whitelist');
        if (includeOps) includes.push('operators');
        
        const inclusionText = includes.length > 0 
            ? `<br><br><small class="text-body-secondary"><strong>Including:</strong> ${includes.join(', ')}</small>` 
            : '<br><br><small class="text-body-secondary">Only scripts and metadata will be saved.</small>';
        
        const result = await Swal.fire({
            title: 'Save as Template?',
            html: `Save current server configuration as template <strong>"${escapeHtml(templateName)}"</strong>?${inclusionText}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Save',
            cancelButtonText: 'Cancel'
        });
        
        if (!result.isConfirmed) return;
        
        Swal.fire({
            title: 'Saving...',
            text: 'Creating template...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        
        try {
            const response = await authenticatedFetch(`${API_URL}/api/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    server_name: serverId,
                    template_name: templateName,
                    description: description,
                    include_world: includeWorld,
                    include_plugins: includePlugins,
                    include_whitelist: includeWhitelist,
                    include_ops: includeOps,
                    include_server_configs: includeServerConfigs
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to save template');
            }
            
            await Swal.fire('Success!', data.message, 'success');
            templateNameInput.value = '';
            templateDescInput.value = '';
            
            // Reset checkboxes to defaults
            includeServerConfigsCheckbox.checked = true;
            includeWorldCheckbox.checked = false;
            includePluginsCheckbox.checked = false;
            includeWhitelistCheckbox.checked = false;
            includeOpsCheckbox.checked = false;
            
        } catch (error) {
            console.error('Error saving template:', error);
            Swal.fire('Error', error.message || 'Failed to save template', 'error');
        }
    };
    
    if (saveAsTemplateBtn) {
        saveAsTemplateBtn.addEventListener('click', saveAsTemplate);
    }
    
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
})();
