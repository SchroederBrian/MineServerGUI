document.addEventListener('DOMContentLoaded', function () {
    const API_URL = 'http://127.0.0.1:5000';
    const params = new URLSearchParams(window.location.search);
    const serverId = params.get('id');

    if (!serverId) {
        window.location.href = 'index.html';
        return;
    }

    // --- DOM Elements ---
    const serverNameEl = document.getElementById('serverName');
    const minecraftVersionEl = document.getElementById('minecraftVersion');
    const portEl = document.getElementById('port').querySelector('span');
    const portIconEl = document.getElementById('portIcon');
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
    const fileListView = document.getElementById('file-list-view');
    const fileEditorView = document.getElementById('file-editor');
    const breadcrumbEl = document.getElementById('breadcrumb');
    const fileListContainer = document.getElementById('file-list-container');
    const reloadFilesBtn = document.getElementById('reload-files-btn');
    
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

    // Java Installation
    const javaVersionSelect = document.getElementById('java-version-select');
    const installJavaBtn = document.getElementById('install-java-btn');

    // Danger Zone
    const deleteServerBtn = document.getElementById('delete-server-btn');

    let currentPath = '.';
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
                const statusData = await statusResponse.json();
                updateUIMetrics(statusData);
            } else {
                // If stopped, reset metrics and clear the log line count
                // so we get a fresh log on the next start.
                resetMetrics();
                if (currentLogLine !== 0) {
                    logOutputEl.innerHTML = '<p class="text-body-secondary">[Server has stopped]</p>';
                    currentLogLine = 0;
                }
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
        portEl.textContent = data.port;
        portIconEl.className = data.port == 25565 
            ? 'fas fa-check-circle text-success ms-2' 
            : 'fas fa-exclamation-triangle text-warning ms-2';
        portIconEl.title = data.port == 25565 ? 'Standard Port' : 'Non-standard Port';
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
            alert(`Error: ${error.message}`);
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

    const fetchFiles = async (path) => {
        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            const files = await response.json();
            renderFileList(files, path);
            currentPath = path;
        } catch (error) {
            console.error('File fetch error:', error);
            fileListContainer.innerHTML = `<p class="text-danger">Could not load files.</p>`;
        }
    };
    
    const renderFileList = (files, path) => {
        renderBreadcrumb(path);
        fileListContainer.innerHTML = '';
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
            const fileItem = document.createElement('a');
            fileItem.href = '#';
            fileItem.className = 'list-group-item list-group-item-action list-group-item-dark d-flex justify-content-between align-items-center';
            const icon = file.is_directory ? 'fa-folder text-warning' : 'fa-file-alt text-light';
            
            const isBinary = /\.(jar|zip|exe|dll|dat|png|jpg|jpeg|gif|bmp|so|a|class|lock)$/i.test(file.name);

            fileItem.innerHTML = `
                <div>
                    <i class="fas ${icon} fa-fw me-3"></i>
                    ${file.name}
                </div>
                <small class="text-body-secondary">${file.is_directory ? '' : `${(file.size / 1024).toFixed(2)} KB`}</small>
            `;
            fileItem.onclick = (e) => {
                e.preventDefault();
                if (fileItem.classList.contains('disabled')) return;

                const newPath = `${path}/${file.name}`.replace('./', '');
                if (file.is_directory) {
                    fetchFiles(newPath);
                } else {
                    openFileEditor(newPath);
                }
            };

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

            fileListView.classList.add('d-none');
            fileEditorView.classList.remove('d-none');
        } catch (error) {
            console.error('File open error:', error);
            alert(`Error opening file: ${error.message}`);
        }
    };

    const closeFileEditor = () => {
        fileListView.classList.remove('d-none');
        fileEditorView.classList.add('d-none');
        editingFilenameEl.textContent = '';
        fileContentEditor.value = '';
        delete saveFileBtn.dataset.path;
    };

    const saveFile = async () => {
        saveFileBtn.disabled = true;
        saveFileBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/files/content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: currentFile.path,
                    content: fileContentEditor.value
                }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Failed to save file.");
            }
            alert('File saved successfully!');
            closeFileEditor();
        } catch (error) {
            console.error('Save error:', error);
            alert(`Error saving file: ${error.message}`);
        } finally {
            saveFileBtn.disabled = false;
            saveFileBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save';
        }
    };
    
    saveFileBtn.addEventListener('click', saveFile);
    cancelEditBtn.addEventListener('click', closeFileEditor);

    // --- Logs & Console ---

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
                    const p = document.createElement('p');
                    p.className = 'm-0';
                    p.textContent = line.trim(); // Use trim to remove trailing newlines from the server
                    logOutputEl.appendChild(p);
                });
                // Auto-scroll to the bottom
                logOutputEl.scrollTop = logOutputEl.scrollHeight;
            }
            
            currentLogLine = data.line_count;

        } catch (error) {
            // Don't spam the log on errors, just ensure there's a message.
            if (logOutputEl.innerHTML.includes('Could not fetch')) return;
            logOutputEl.innerHTML = `<p class="text-danger m-0">[Could not fetch server logs: ${error.message}]</p>`;
        }
    };
    
    const clearLogs = async () => {
        if (!confirm('Are you sure you want to clear all logs?')) {
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
            alert(`Error: ${error.message}`);
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
            alert('Please enter a command to save');
            return;
        }
        
        if (savedCommands.includes(command)) {
            alert('This command is already saved');
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
    let installScript = [];

    const renderInstallScript = () => {
        commandListEl.innerHTML = '';
        installScript.forEach((cmd, index) => {
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <span class="font-monospace">${cmd}</span>
                <button class="btn btn-outline-danger btn-sm" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
            `;
            li.querySelector('button').addEventListener('click', () => {
                installScript.splice(index, 1);
                renderInstallScript();
            });
            commandListEl.appendChild(li);
        });
    };

    const fetchInstallScript = async () => {
        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/install-script`);
            const data = await response.json();
            if (response.ok) {
                installScript = data.commands || [];
            } else {
                installScript = []; // Start with empty on error
            }
            renderInstallScript();
        } catch (error) {
            console.error('Failed to fetch install script:', error);
            installScript = [];
            renderInstallScript();
        }
    };

    addCommandBtn.addEventListener('click', () => {
        const newCommand = newCommandInput.value.trim();
        if (newCommand) {
            installScript.push(newCommand);
            newCommandInput.value = '';
            renderInstallScript();
        }
    });

    const saveInstallScript = async () => {
        const originalContent = saveScriptBtn.innerHTML;
        saveScriptBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Saving...`;
        saveScriptBtn.disabled = true;
        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/install-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: installScript })
            });
            if (!response.ok) throw new Error( (await response.json()).error || 'Failed to save script.');
            // Maybe add a temporary "Saved!" message
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            saveScriptBtn.innerHTML = originalContent;
            saveScriptBtn.disabled = false;
        }
    };
    
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
        if (!confirm('Are you sure you want to run the installation script? This may modify server files.')) {
            return;
        }
        
        // Switch to the logs tab to show the output
        const logsTab = new bootstrap.Tab(document.getElementById('logs-tab'));
        logsTab.show();

        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/install`, { method: 'POST' });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'Failed to start installation.');
            
            // The output will now appear in the logs tab automatically.
            // No need to poll a separate endpoint.
            alert(data.message);

        } catch (error) {
             alert(`[INSTALLATION FAILED TO START] ${error.message}`);
        }
    };

    const installJava = async () => {
        const javaVersion = javaVersionSelect.value;
        if (!confirm(`Are you sure you want to install Java version ${javaVersion}? This will download and extract the JDK.`)) {
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
            alert(data.message);

        } catch (error) {
             alert(`[JAVA INSTALLATION FAILED TO START] ${error.message}`);
        }
    };
    
    saveScriptBtn.addEventListener('click', saveInstallScript);
    runInstallBtn.addEventListener('click', runInstallation);
    installJavaBtn.addEventListener('click', installJava);

    // --- Start Command Script ---
    let startScript = [];

    const renderStartScript = () => {
        startCommandListEl.innerHTML = '';
        startScript.forEach((cmd, index) => {
            const li = document.createElement('li');
            li.className = 'list-group-item list-group-item-dark d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <span class="font-monospace">${escapeHtml(cmd)}</span>
                <button class="btn btn-outline-danger btn-sm" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
            `;
            li.querySelector('button').addEventListener('click', () => {
                startScript.splice(index, 1);
                renderStartScript();
            });
            startCommandListEl.appendChild(li);
        });
    };

    const fetchStartScript = async () => {
        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/start-script`);
            const data = await response.json();
            if (response.ok) {
                startScript = data.commands || [];
            } else {
                startScript = [];
            }
            renderStartScript();
        } catch (error) {
            console.error('Failed to fetch start script:', error);
            startScript = [];
            renderStartScript();
        }
    };
    
    addStartCommandBtn.addEventListener('click', () => {
        const newCommand = newStartCommandInput.value.trim();
        if (newCommand) {
            startScript.push(newCommand);
            newStartCommandInput.value = '';
            renderStartScript();
        }
    });

    const saveStartScript = async () => {
        const originalContent = saveStartScriptBtn.innerHTML;
        saveStartScriptBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Saving...`;
        saveStartScriptBtn.disabled = true;
        try {
            const response = await fetch(`${API_URL}/api/servers/${serverId}/start-script`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commands: startScript })
            });
            if (!response.ok) throw new Error( (await response.json()).error || 'Failed to save script.');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            saveStartScriptBtn.innerHTML = originalContent;
            saveStartScriptBtn.disabled = false;
        }
    };

    saveStartScriptBtn.addEventListener('click', saveStartScript);

    const settingsTab = document.getElementById('settings-tab');

    settingsTab.addEventListener('shown.bs.tab', function () {
        fetchInstallScript();
        fetchStartScript();
    });

    const deleteServer = async () => {
        if (!confirm(`Are you sure you want to permanently delete this server? This action cannot be undone.`)) {
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

            alert('Server deleted successfully. Returning to dashboard.');
            window.location.href = 'index.html';

        } catch (error) {
            alert(`Error: ${error.message}`);
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

    // --- Initial Load ---
    console.log(`[INIT] Initializing detail view for server: ${serverId}`);
    startPolling();
    fetchFiles(currentPath);
    fetchInstallScript();
    fetchStartScript();
    loadSavedCommands();
    loadLogSettings();
}); 