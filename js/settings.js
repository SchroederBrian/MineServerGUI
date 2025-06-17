document.addEventListener('DOMContentLoaded', function () {
    const API_URL = 'http://127.0.0.1:5000';

    const settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));
    const fileExplorerModal = new bootstrap.Modal(document.getElementById('fileExplorerModal'));
    
    const mcServersPathInput = document.getElementById('mcServersPath');
    const browsePathBtn = document.getElementById('browsePathBtn');

    const fileExplorerList = document.getElementById('fileExplorerList');
    const currentPathDisplay = document.getElementById('currentPathDisplay');
    const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');

    let currentExplorerPath = '';

    // --- Settings Logic ---

    // Function to fetch and display the current server path
    async function loadSettings() {
        try {
            const response = await fetch(`${API_URL}/api/settings`);
            if (!response.ok) throw new Error('Failed to fetch settings');
            const settings = await response.json();
            mcServersPathInput.value = settings.mc_servers_path;
        } catch (error) {
            console.error('Error loading settings:', error);
            alert('Could not load settings from the backend.');
        }
    }
    
    // Function to save the new path and reload the page
    async function savePathAndReload(newPath) {
        if (!newPath || newPath === 'My Computer') {
            alert('Please select a valid directory.');
            return;
        }

        try {
            const response = await fetch(`${API_URL}/api/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mc_servers_path: newPath })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to save settings');
            
            alert(result.message);
            // Hide modals before reloading to prevent them from briefly reappearing
            fileExplorerModal.hide();
            settingsModal.hide();
            window.location.reload();
        } catch (error) {
            console.error('Error saving settings:', error);
            alert(`Error: ${error.message}`);
        }
    }

    // Load settings when the main settings modal is shown
    document.getElementById('settingsModal').addEventListener('shown.bs.modal', loadSettings);


    // --- File Explorer Logic ---

    // Function to browse directories
    async function browse(path = '') {
        try {
            const response = await fetch(`${API_URL}/api/browse?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to browse directory');
            }
            const data = await response.json();
            
            currentExplorerPath = data.current_path;
            currentPathDisplay.textContent = data.current_path;
            fileExplorerList.innerHTML = ''; // Clear previous list

            // Add an "Up" directory item ("..") to navigate to the parent
            const parentDirItem = createDirItem('.. (Up)', data.parent_path);
            fileExplorerList.appendChild(parentDirItem);
            
            // Add sub-directory items
            data.directories.forEach(dir => {
                const nextPath = data.current_path === 'My Computer' 
                    ? dir // For drive list, the path is the drive letter itself (e.g., C:\)
                    : `${data.current_path}${data.current_path.endsWith('\\') || data.current_path.endsWith('/') ? '' : '/'}${dir}`;
                const dirItem = createDirItem(dir, nextPath);
                fileExplorerList.appendChild(dirItem);
            });

        } catch (error) {
            console.error('Error browsing files:', error);
            fileExplorerList.innerHTML = `<li class="list-group-item text-danger">${error.message}</li>`;
        }
    }
    
    function createDirItem(name, path) {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'list-group-item list-group-item-action bg-dark text-white';
        item.textContent = name;
        item.dataset.path = path;
        item.addEventListener('click', (e) => {
            e.preventDefault();
            browse(path);
        });
        return item;
    }

    // Load initial directory list when file explorer is opened
    browsePathBtn.addEventListener('click', () => browse());
    
    // Set the selected directory and save automatically
    selectDirectoryBtn.addEventListener('click', () => {
        savePathAndReload(currentExplorerPath);
    });
}); 