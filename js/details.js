document.addEventListener('DOMContentLoaded', function () {
    const API_URL = 'http://127.0.0.1:5000';
    const params = new URLSearchParams(window.location.search);
    const serverId = params.get('id');

    // --- Panorama Effect ---
    const setupPanoramaEffect = async () => {
        const panorama = document.querySelector('.panorama-background');
        if (!panorama) return;

        try {
            const response = await fetch(`${API_URL}/api/config`);
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

    // Danger Zone
    const deleteServerBtn = document.getElementById('delete-server-btn');

    let currentPath = '.';
    let selectedFiles = new Set();
    let currentLogLine = 0;
    let isLogAutoscrollEnabled = true;
    let currentServerState = {};
    let pollingInterval;

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
            const detailsResponse = await fetch(`${API_URL}/api/servers/${serverId}`);
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
                const statusResponse = await fetch(`${API_URL}/api/servers/${serverId}/status`);
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/${action}`, { method: 'POST' });
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
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
        breadcrumbEl.innerHTML = '';
        const parts = path.split('/').filter(p => p);
        
        const rootItem = document.createElement('li');
        rootItem.className = 'breadcrumb-item';
        rootItem.innerHTML = `<a href="#">root</a>`;
        rootItem.onclick = (e) => { e.preventDefault(); fetchFiles('.'); };
        breadcrumbEl.appendChild(rootItem);

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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`);
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/content`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/log?since=${currentLogLine}`);
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/clear-logs`, {
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
            await fetch(`${API_URL}/api/servers/${serverId}/console`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/install-script`);
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/install-script`, {
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
                const response = await fetch(`${API_URL}/api/servers/${serverId}/install`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/java/install`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/start-script`);
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/start-script`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/port`, {
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
            const response = await fetch(`${API_URL}/api/loaders/${loader}/versions`);
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
                const response = await fetch(`${API_URL}/api/servers/${serverId}/change-software`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/delete`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/rename`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/reapply-eula`, {
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
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/upload`, {
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
});