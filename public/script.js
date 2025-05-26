document.addEventListener('DOMContentLoaded', () => {
    console.log('Script.js loaded and DOMContentLoaded event fired');
    
    // Add a showNotification function to fix the ReferenceError
    function showNotification(message, type = 'info') {
        console.log(`[NOTIFICATION] ${type}: ${message}`);
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
    
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });
    
    // Initialize terminal with proper options
    const term = new Terminal({
        cursorBlink: true,
        theme: {
            background: '#1e1e1e',
            foreground: '#cccccc',
            cursor: '#ffffff'
        },
        convertEol: true,
        scrollback: 5000,  // Increased scrollback buffer
        disableStdin: false,  // Enable stdin
        padding: 10  // Add padding to ensure text doesn't touch edges
    });
    term.open(document.getElementById('terminal'));
    
    // Add scrolling functionality to terminal
    require(['https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.5.0/lib/xterm-addon-fit.js', 
             'https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.8.0/lib/xterm-addon-web-links.js'], 
             function(FitAddon, WebLinksAddon) {
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        
        // Add web links support
        if (WebLinksAddon) {
            term.loadAddon(new WebLinksAddon.WebLinksAddon());
        }
        
        // Override terminal write to auto-scroll
        const originalWrite = term.write;
        term.write = function(data) {
            originalWrite.call(this, data);
            // Scroll to bottom after writing
            term.scrollToBottom();
        };
        
        // Add a visual separator line to the terminal
        const separator = document.createElement('div');
        separator.className = 'terminal-separator';
        document.querySelector('.terminal-container').insertBefore(
            separator, 
            document.querySelector('.command-input-container')
        );
        
        // Fit the terminal to its container
        function fitTerminal() {
            try {
                fitAddon.fit();
                term.scrollToBottom();
            } catch (e) {
                console.error('Error fitting terminal:', e);
            }
        }
        
        // Fit on initial load and when window resizes
        setTimeout(fitTerminal, 100);
        window.addEventListener('resize', fitTerminal);
        
        // Handle terminal resize
        const resizeHandle = document.getElementById('resize-handle');
        const terminalContainer = document.querySelector('.terminal-container');
        const editorContainer = document.querySelector('.editor-container');
        
        let isResizing = false;
        let startY, startHeight, startEditorHeight;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = terminalContainer.offsetHeight;
            startEditorHeight = editorContainer.offsetHeight;
            document.body.style.cursor = 'row-resize';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
        });
        
        function handleMouseMove(e) {
            if (!isResizing) return;
            const deltaY = e.clientY - startY;
            const newTerminalHeight = Math.max(100, startHeight - deltaY);
            terminalContainer.style.height = `${newTerminalHeight}px`;
            fitTerminal();
        }
        
        function handleMouseUp() {
            isResizing = false;
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            fitTerminal();
        }
        
        // Terminal actions
        document.getElementById('maximize-terminal').addEventListener('click', () => {
            const mainContent = document.querySelector('.main-content');
            const editorHeight = editorContainer.offsetHeight;
            const terminalHeight = terminalContainer.offsetHeight;
            const totalHeight = editorHeight + terminalHeight;
            
            if (terminalHeight < totalHeight * 0.8) {
                // Maximize terminal
                terminalContainer.style.height = `${totalHeight * 0.8}px`;
            } else {
                // Restore terminal
                terminalContainer.style.height = `300px`;
            }
            fitTerminal();
        });
        
        document.getElementById('minimize-terminal').addEventListener('click', () => {
            terminalContainer.style.height = `30px`;
            fitTerminal();
        });
        
        document.getElementById('clear-terminal').addEventListener('click', () => {
            term.clear();
        });
    });
    
    // Monaco Editor setup
    let editor;
    let currentFile = null;
    const modifiedFiles = new Set();
    
    // Expose editor globally for AI functionality
    window.getCodeEditor = function() {
        return editor;
    };
    
    // Load Monaco Editor
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: `// Welcome to Qubic CLI Web Interface

// GETTING STARTED
// ------------------------------------------------------
// 1. Create or edit .cpp and .h files in the explorer panel
// 2. Add new files to CMakeLists.txt in the SET(FILES ...) section
// 3. Click "Compile & Run" to build the Docker container
// 4. Use the terminal below to run CLI commands
//
// IMPORTANT PARAMETERS
// ------------------------------------------------------
// • Node IP (-nodeip): 45.152.160.22 - The IP address of a public Qubic Core node. This is required for most commands that interact with the blockchain.
// • Node Port (-nodeport): 21841 - The port on which the Qubic Core node listens for connections (default is 21841).
// • Seed (-seed): Your 55-character private key. Required for sending transactions or accessing wallet functions.
// • Schedule Tick (-scheduletick): Offset number of ticks for scheduling transactions (default is 20).
//
// IMPORTANT NOTES
// ------------------------------------------------------
// • This is running the latest version of Qubic CLI in a Docker container
// • All commands run in an isolated environment
// • Example command: ./qubic-cli -nodeip 45.152.160.22 -getcurrenttick
// • Changes to CMakeLists.txt are required when adding new source files`,
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: {
                enabled: true
            },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            lineNumbers: 'on',
            renderIndentGuides: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 14
        });
        // Listen for changes to mark files as modified
        editor.onDidChangeModelContent(() => {
            if (currentFile) {
                modifiedFiles.add(currentFile);
                // Update file item in explorer to show modified state
                document.querySelectorAll('.file-item').forEach(item => {
                    if (item.dataset.path === currentFile) {
                        if (!item.textContent.includes('*')) {
                            item.innerHTML = `<i class="fas fa-file-code"></i> ${item.textContent.trim()} *`;
                        }
                    }
                });
            }
        });
        
        // Load file list
        loadFileList();
    });
    
    // Load file list from server
    function loadFileList() {
        socket.emit('get-file-list');
    }
    
    // Handle file list from server
    socket.on('file-list', (files) => {
        const fileExplorer = document.getElementById('file-explorer');
        // Clear the explorer first
        fileExplorer.innerHTML = '';
        
        // Add the header back
        const header = document.createElement('div');
        header.className = 'file-header';
        header.innerHTML = 'Explorer <span id="new-file-btn" style="margin-left: 10px; cursor: pointer;"><i class="fas fa-plus"></i></span>';
        fileExplorer.appendChild(header);
        
        // Add event listener for new file button
        setTimeout(() => {
            const newFileBtn = document.getElementById('new-file-btn');
            if (newFileBtn) {
                newFileBtn.addEventListener('click', createNewFile);
            }
        }, 0);
        
        // Group files by directory
        const fileTree = {};
        files.forEach(file => {
            const parts = file.split('/');
            let current = fileTree;
            
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            if (!current[parts[parts.length - 1]]) {
                current[parts[parts.length - 1]] = file;
            }
        });
        
        // Render file tree
        renderFileTree(fileTree, fileExplorer);
    });
    
    // Add a variable to track the currently active file
    let currentActiveFile = null;

    // Update the file click handler to highlight the active file
    function handleFileClick(filePath) {
        // Set the current active file
        currentActiveFile = filePath;
        
        // Request file content
        socket.emit('get-file-content', filePath);
        
        // Update UI to show active file
        updateActiveFileUI();
    }

    // Function to update the UI for active file
    function updateActiveFileUI() {
        // Remove active class from all file items
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current file
        if (currentActiveFile) {
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                if (item.dataset.path === currentActiveFile) {
                    item.classList.add('active');
                }
            });
        }
    }

    // Update the renderFileTree function to add data-path attribute
    function renderFileTree(tree, container, basePath = '') {
        for (const key in tree) {
            const value = tree[key];
            
            if (typeof value === 'string') {
                // This is a file
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.dataset.path = value; // Store the full path for reference
                
                // Determine icon based on file extension
                const ext = key.split('.').pop().toLowerCase();
                let icon = 'fa-file-code';
                if (ext === 'h') icon = 'fa-file-alt';
                
                fileItem.innerHTML = `<i class="fas ${icon}"></i> ${key}`;
                
                // Add active class if this is the current file
                if (value === currentActiveFile) {
                    fileItem.classList.add('active');
                }
                
                fileItem.addEventListener('click', () => handleFileClick(value));
                container.appendChild(fileItem);
            } else {
                // This is a directory
                const folderHeader = document.createElement('div');
                folderHeader.className = 'file-item folder-header';
                folderHeader.innerHTML = `<i class="fas fa-folder"></i> ${key}`;
                container.appendChild(folderHeader);
                
                const folderContainer = document.createElement('div');
                folderContainer.className = 'folder';
                container.appendChild(folderContainer);
                
                renderFileTree(value, folderContainer, basePath + key + '/');
            }
        }
    }

    // Update the socket.on('file-content') handler to set the active file
    socket.on('file-content', (data) => {
        console.log(`[DEBUG] Received file content for: ${data.path}`);
        
        // Set the editor's value to the file content
        if (editor) {
            editor.setValue(data.content || '');
            
            // Reset undo history when switching files
            setTimeout(() => {
                editor.getModel().pushStackElement();
            }, 0);
            
            // Store current file
            currentFile = data.path;
            
            // Update UI to show current file
            updateFileHighlight(data.path);
            
            // If this is a new file or explicitly requested to be opened, focus the editor
            if (data.openInEditor) {
                editor.focus();
                
                // Optionally reveal the file in the file explorer
                const fileElement = document.querySelector(`.file-item[data-path="${data.path}"]`);
                if (fileElement) {
                    fileElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Briefly highlight the file item
                    fileElement.classList.add('file-item-highlight');
                    setTimeout(() => {
                        fileElement.classList.remove('file-item-highlight');
                    }, 2000);
                }
            }
        }
        
        // Set editor language based on file extension
        const ext = data.path.split('.').pop().toLowerCase();
        let language = 'cpp';
        
        if (ext === 'h' || ext === 'hpp') language = 'cpp';
        else if (ext === 'c') language = 'c';
        else if (ext === 'txt') language = 'plaintext';
        else if (ext === 'json') language = 'json';
        
        monaco.editor.setModelLanguage(editor.getModel(), language);
        
        // Update UI to show which file is active
        document.querySelectorAll('.file-item').forEach(item => {
            if (item.dataset.path === data.path) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Update document title to include file name
        document.title = `${data.path} - Qubic CLI Interface`;
    });
    
    // Function to save all modified files with enhanced debugging
    function saveFile() {
        console.log(`[DEBUG] Save button clicked, currentFile = ${currentFile}`);
        
        if (!window.isLoggedIn) {
            console.log('[DEBUG] User not logged in, showing alert');
            alert('Please login to save files');
            return;
        }
        
        if (!currentFile) {
            console.log('[DEBUG] No current file selected');
            window.term.write('No file selected to save.\n');
            return;
        }
        
        const content = editor.getValue();
        console.log(`[DEBUG] Saving current file: ${currentFile}`);
        console.log(`[DEBUG] Content length: ${content.length} characters`);
        
        // Send to server
        socket.emit('save-file', {
            path: currentFile,
            content: content
        });
        
        // Log that we sent the save request
        console.log(`[DEBUG] Sent save-file event for: ${currentFile}`);
        
        // Mark file as saved in UI
        modifiedFiles.delete(currentFile);
        
        // Update file items in explorer to remove modified state
        document.querySelectorAll('.file-item').forEach(item => {
            if (item.dataset.path === currentFile) {
                const text = item.textContent.trim();
                if (text.endsWith('*')) {
                    item.innerHTML = `<i class="fas fa-file-code"></i> ${text.slice(0, -1).trim()}`;
                }
            }
        });
        
        window.term.write(`File ${currentFile} saved.\n`);
    }

    // Update the HTML to change "Save All" to "Save"
    document.addEventListener('DOMContentLoaded', () => {
        // Find the save-all button and update its text and ID
        const saveButton = document.getElementById('save-all');
        if (saveButton) {
            saveButton.innerHTML = '<i class="fas fa-save"></i> Save';
            saveButton.id = 'save-file';
        }
        
        // Update the event listener
        document.getElementById('save-file').addEventListener('click', saveFile);
        
        // Add keyboard shortcut for save (Ctrl+S)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault(); // Prevent browser's save dialog
                saveFile();
            }
        });
    });
    
    // Make sure the compile button has the correct event listener
    document.addEventListener('DOMContentLoaded', () => {
        // Remove nested DOMContentLoaded listener (this is causing double triggers)
        // Delete lines 417-463 (nested event listener)
        
        // Keep only ONE handler for the compile button
        const compileBtn = document.getElementById('compile-docker');
        if (compileBtn) {
            console.log('[DEBUG] Found compile button, adding click handler');
            
            // Remove existing listeners by cloning
            const newBtn = compileBtn.cloneNode(true);
            compileBtn.parentNode.replaceChild(newBtn, compileBtn);
            
            // Add new listener
            newBtn.onclick = function() {
                console.log('[DEBUG] Compile button clicked');
                
                // First save the current file if there is one
                if (currentFile) {
                    const content = editor.getValue();
                    console.log(`[DEBUG] Auto-saving current file before compile: ${currentFile}`);
                    
                    socket.emit('save-file', {
                        path: currentFile,
                        content: content
                    });
                    
                    // Update UI
                    modifiedFiles.delete(currentFile);
                    document.querySelectorAll('.file-item').forEach(item => {
                        if (item.dataset.path === currentFile) {
                            const text = item.textContent.trim();
                            if (text.endsWith('*')) {
                                item.innerHTML = `<i class="fas fa-file-code"></i> ${text.slice(0, -1).trim()}`;
                            }
                        }
                    });
                }
                
                // Clear terminal and start compilation
                term.clear();
                term.write('Starting compilation...\n');
                socket.emit('compile-docker');
                return false; // Prevent default
            };
        }
        
        // Remove the global click handler completely (lines 1193-1203)
    });
    
    // Run command button
    document.getElementById('run-command').addEventListener('click', () => {
        const command = document.getElementById('command-input').value.trim();
        if (command) {
            executeCommand(command);
        }
    });
    
    // Allow Enter key to run command
    document.getElementById('command-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const command = document.getElementById('command-input').value.trim();
            if (command) {
                executeCommand(command);
            }
        }
    });
    
    // Toggle sidebar on mobile
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.querySelector('.sidebar');
        sidebar.classList.toggle('show');
    });

    // Track recently shown messages to avoid duplicates
    const recentTerminalMessages = new Map();
    
    // Add a wrapper for term.write to avoid duplicate messages
    function writeToTerminal(message) {
        const now = Date.now();
        // Only deduplicate certain common messages
        if (message.includes('Connected to server') || 
            message.includes('Docker container is not running') ||
            message.includes('You must be logged in')) {
            
            // For Docker errors, modify message if compilation failed
            if (message.includes('Docker container is not running') && compilationFailed) {
                // Replace with more accurate message
                message = message.replace(
                    'Docker container is not running. Please compile and start Docker first.',
                    'Previous compilation failed. Please fix errors and compile again.'
                );
            }
            
            const lastTime = recentTerminalMessages.get(message);
            if (lastTime && now - lastTime < 3000) { // Within 3 seconds
                console.log('Avoiding duplicate terminal message:', message);
                return; // Skip duplicate message
            }
            recentTerminalMessages.set(message, now);
            
            // Clean up old messages
            if (recentTerminalMessages.size > 20) {
                const expired = now - 10000; // 10 seconds
                for (const [key, time] of recentTerminalMessages.entries()) {
                    if (time < expired) {
                        recentTerminalMessages.delete(key);
                    }
                }
            }
        }
        
        // Write the message to the terminal
        term.write(message);
    }

    // Update terminal setup to show current working directory
    let hasConnectedBefore = false;
    socket.on('connect', () => {
        console.log('Connected to server');
        if (!hasConnectedBefore) {
            writeToTerminal('Connected to server. Ready to compile and run commands.\n');
            hasConnectedBefore = true;
        }
        
        // Get current working directory after connection
        socket.emit('run-command', 'find /app/project -name "qubic-cli" -type f | sort');
    });
    
    // Use our writeToTerminal function for terminal output
    socket.on('terminal-output', (data) => {
        writeToTerminal(data);
        
        // Update compilation status message
        const compilationMessage = document.getElementById('compilation-message');
        if (compilationMessage) {
            if (data.includes('Error:')) {
                compilationMessage.textContent = 'Compilation Failed';
                compilationMessage.style.color = 'red';
            } else if (data.includes('Docker image built successfully')) {
                compilationMessage.textContent = 'Compilation Successful';
                compilationMessage.style.color = 'green';
            } else {
                compilationMessage.textContent = 'Compiling...';
                compilationMessage.style.color = 'orange';
            }
        }
    });

    // Socket connection handling
    socket.on('connect', () => {
        console.log('Connected to server');
        term.write('Connected to server. Ready to compile and run commands.\n');
        
        // Check if user is logged in via cookie
        const userId = checkLoggedInStatus();
        if (userId) {
            console.log('[DEBUG] Found user ID in cookie:', userId);
            // Auto-login with cookie
            socket.emit('auto-login', { userId });
        }
        
        // Get current working directory after connection
        socket.emit('run-command', 'find /app/project -name "qubic-cli" -type f | sort');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        term.write('Error connecting to server. Check console for details.\n');
        document.querySelector('.statusbar').textContent = 'Connection error';
    });
    
    socket.on('disconnect', () => {
        term.write('\r\n\x1b[31mDisconnected from server. Attempting to reconnect...\x1b[0m\r\n');
        document.querySelector('.statusbar').textContent = 'Disconnected - reconnecting...';
    });
    
    socket.on('reconnect', (attemptNumber) => {
        term.write(`\r\n\x1b[32mReconnected to server after ${attemptNumber} attempts.\x1b[0m\r\n`);
        document.querySelector('.statusbar').textContent = 'Reconnected to server';
        // Reload file list after reconnection
        loadFileList();
    });
    
    socket.on('reconnect_failed', () => {
        term.write('\r\n\x1b[31mFailed to reconnect to server. Please refresh the page.\x1b[0m\r\n');
        document.querySelector('.statusbar').textContent = 'Reconnection failed';
    });

    // Add a clear visual indicator between terminal and command input
    function updateTerminalLayout() {
        const terminalContainer = document.querySelector('.terminal-container');
        const terminalElement = document.getElementById('terminal');
        const commandInput = document.querySelector('.command-input-container');
        
        // Ensure terminal has enough space to scroll
        terminalElement.style.height = `${terminalContainer.clientHeight - commandInput.clientHeight}px`;
        
        // Force scroll to bottom
        term.scrollToBottom();
    }

    // Update layout on resize
    window.addEventListener('resize', updateTerminalLayout);
    // Initial layout update
    setTimeout(updateTerminalLayout, 100);

    socket.on('initial-file', (data) => {
        currentFile = data.path;
        
        // Determine language based on file extension
        const extension = data.path.split('.').pop().toLowerCase();
        let language = 'plaintext';  // Default to plaintext
        
        if (['cpp', 'c', 'h', 'hpp'].includes(extension)) {
            language = 'cpp';
        } else if (['js', 'json'].includes(extension)) {
            language = extension;
        } else if (extension === 'html') {
            language = 'html';
        } else if (extension === 'txt') {
            language = 'plaintext';
        } else if (extension === 'md') {
            language = 'markdown';  // Add support for markdown files
        }
        
        // Update editor content and language
        if (editor) {
            monaco.editor.setModelLanguage(editor.getModel(), language);
            editor.setValue(data.content);
            
            // Update status bar
            document.querySelector('.statusbar').textContent = `${data.path} - ${language.toUpperCase()}`;
            
            // Highlight the file in the explorer when it's loaded
            setTimeout(() => {
                document.querySelectorAll('.file-item').forEach(item => {
                    if (item.textContent.includes(data.path)) {
                        item.classList.add('active');
                    }
                });
            }, 500);
        }
    });

    // Function to create a new file
    function createNewFile() {
        // Create modal for new file
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Create New File</h3>
                <div class="input-group">
                    <label for="file-name">File Name:</label>
                    <input type="text" id="file-name" placeholder="example.cpp">
                </div>
                <div class="button-group">
                    <button id="create-file-btn">Create</button>
                    <button id="cancel-file-btn">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('cancel-file-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        document.getElementById('create-file-btn').addEventListener('click', () => {
            const fileName = document.getElementById('file-name').value.trim();
            
            // Validate file name
            if (!fileName) {
                alert('Please enter a file name');
                return;
            }
            
            // Check file extension
            const ext = fileName.split('.').pop().toLowerCase();
            if (ext !== 'cpp' && ext !== 'h') {
                alert('Only .cpp and .h files are allowed');
                return;
            }
            
            // Create file directly in the root directory
            socket.emit('create-file', fileName);
            
            // Close modal
            document.body.removeChild(modal);
        });
    }

    // Add CSS for the modal to the document
    const modalStyle = document.createElement('style');
    modalStyle.textContent = `
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .modal-content {
        background-color: var(--sidebar-bg);
        padding: 20px;
        border-radius: 5px;
        width: 400px;
        max-width: 90%;
    }

    .input-group {
        margin-bottom: 15px;
    }

    .input-group label {
        display: block;
        margin-bottom: 5px;
    }

    .input-group input {
        width: 100%;
        padding: 8px;
        background-color: #3c3c3c;
        border: 1px solid #3c3c3c;
        color: var(--text-color);
        border-radius: 2px;
    }

    .button-group {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }

    .button-group button {
        padding: 8px 15px;
        border: none;
        border-radius: 2px;
        cursor: pointer;
    }

    #create-file-btn {
        background-color: var(--primary-color);
        color: white;
    }

    #cancel-file-btn {
        background-color: #555;
        color: white;
    }
    `;
    document.head.appendChild(modalStyle);

    // AI Assistant page link
    const openAiAssistant = document.getElementById('open-ai-assistant');
    if (openAiAssistant) {
        openAiAssistant.addEventListener('click', () => {
            // Toggle AI assistant visibility
            const aiAssistant = document.querySelector('.ai-assistant');
            if (aiAssistant) {
                if (aiAssistant.classList.contains('show')) {
                    aiAssistant.classList.remove('show');
                } else {
                    aiAssistant.classList.add('show');
                }
            }
        });
    }

    // Toggle AI Assistant with floating button (for responsive mode)
    const toggleAiAssistantBtn = document.getElementById('toggle-ai-assistant');
    if (toggleAiAssistantBtn) {
        toggleAiAssistantBtn.addEventListener('click', () => {
            const aiAssistant = document.querySelector('.ai-assistant');
            if (aiAssistant) {
                if (aiAssistant.classList.contains('show')) {
                    aiAssistant.classList.remove('show');
                } else {
                    aiAssistant.classList.add('show');
                }
            }
        });
    }

    // Update the login button click handler
    document.getElementById('login-button').addEventListener('click', (e) => {
        e.preventDefault(); // Prevent any default action
        
        if (window.isLoggedIn) {
            console.log('[DEBUG] User is logged in, showing logout confirmation');
            // Show logout confirmation
            if (confirm('Do you want to log out?')) {
                console.log('[DEBUG] User confirmed logout');
                
                // Tell the server about logout
                socket.emit('logout');
                
                // Clear client-side session
                clearSession();
                
                // Update UI
                const loginButton = document.getElementById('login-button');
                loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
                loginButton.classList.remove('logged-in');
                
                // Show notification
                showNotification('Logged out successfully', 'info');
                
                // Reload page to reset state
                setTimeout(() => {
                    window.location.reload();
                }, 1000); // Slight delay so the notification is visible
            }
            return;
        }
        
        // Use the shared auth modal if available
        if (window.AuthModal) {
            console.log('[DEBUG] Using shared auth modal');
            
            // Store socket in window for the auth modal to access
            window.authSocket = socket;
            window.AuthModal.show(socket);
            
            // Listen for login success event
            document.addEventListener('auth:login-success', function loginSuccessHandler(e) {
                console.log('[DEBUG] Login success event received:', e.detail);
                
                // Update session
                window.isLoggedIn = true;
                window.userId = e.detail.userId;
                
                // Update UI
                const loginButton = document.getElementById('login-button');
                loginButton.innerHTML = '<i class="fas fa-user"></i> ' + e.detail.userId;
                loginButton.classList.add('logged-in');
                
                // Show notification
                showNotification('Logged in successfully', 'success');
                
                // Add a small delay before fetching files
                setTimeout(() => {
                    // Fetch files
                    console.log('[DEBUG] Fetching files for user:', window.userId);
                    fetchFilesList();
                }, 500); // 500ms delay
                
                // Remove this event listener
                document.removeEventListener('auth:login-success', loginSuccessHandler);
            });
        } else {
            console.log('[DEBUG] Shared auth modal not available, using legacy modal');
            
            // Create login modal (legacy approach)
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Login or Register</h3>
                    <div class="modal-tabs">
                        <button class="modal-tab active" data-tab="login-modal">Login</button>
                        <button class="modal-tab" data-tab="register-modal">Register</button>
                    </div>
                    
                    <div class="modal-form active" id="login-modal">
                        <div class="input-group">
                            <label for="login-username">Username:</label>
                            <input type="text" id="login-username" placeholder="Enter username">
                        </div>
                        <div class="input-group">
                            <label for="login-password">Password:</label>
                            <input type="password" id="login-password" placeholder="Enter password">
                        </div>
                        <div class="login-error" id="modal-login-error"></div>
                        <div class="button-group">
                            <button id="submit-login-btn">Login</button>
                            <button id="cancel-login-btn">Cancel</button>
                        </div>
                    </div>
                    
                    <div class="modal-form" id="register-modal" style="display: none;">
                        <div class="input-group">
                            <label for="register-username">Username:</label>
                            <input type="text" id="register-username" placeholder="Choose a username">
                        </div>
                        <div class="input-group">
                            <label for="register-password">Password:</label>
                            <input type="password" id="register-password" placeholder="Choose a password">
                        </div>
                        <div class="input-group">
                            <label for="register-confirm">Confirm Password:</label>
                            <input type="password" id="register-confirm" placeholder="Confirm password">
                        </div>
                        <div class="login-error" id="modal-register-error"></div>
                        <div class="button-group">
                            <button id="submit-register-btn">Register</button>
                            <button id="cancel-register-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Add styles for the modal tabs
            const modalTabStyles = document.createElement('style');
            modalTabStyles.textContent = `
                .modal-tabs {
                    display: flex;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--border-color);
                }
                
                .modal-tab {
                    flex: 1;
                    background: none;
                    border: none;
                    color: var(--text-color);
                    padding: 10px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .modal-tab.active {
                    color: var(--primary-color);
                    border-bottom: 2px solid var(--primary-color);
                }
                
                .modal-form {
                    display: none;
                }
                
                .modal-form.active {
                    display: block;
                }
            `;
            document.head.appendChild(modalTabStyles);
            
            // Setup tab switching
            const tabs = document.querySelectorAll('.modal-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabName = tab.dataset.tab;
                    
                    // Update active tab
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    // Show selected form
                    document.querySelectorAll('.modal-form').forEach(form => {
                        form.classList.remove('active');
                        form.style.display = 'none';
                    });
                    const selectedForm = document.getElementById(tabName);
                    selectedForm.classList.add('active');
                    selectedForm.style.display = 'block';
                    
                    // Focus on first input in the selected form
                    setTimeout(() => {
                        const firstInput = selectedForm.querySelector('input');
                        if (firstInput) firstInput.focus();
                    }, 100);
                });
            });
            
            // Focus on username input
            setTimeout(() => {
                document.getElementById('login-username').focus();
            }, 100);
            
            // Add event listeners for cancel buttons
            document.getElementById('cancel-login-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            document.getElementById('cancel-register-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            // Login button click handler
            document.getElementById('submit-login-btn').addEventListener('click', () => {
                const username = document.getElementById('login-username').value.trim();
                const password = document.getElementById('login-password').value;
                const errorElement = document.getElementById('modal-login-error');
                
                if (!username || !password) {
                    errorElement.textContent = 'Username and password are required';
                    errorElement.style.display = 'block';
                    return;
                }
                
                // Send login request
                socket.emit('login', { username, password });
                
                // Show loading state
                modal.innerHTML = `
                    <div class="modal-content">
                        <h3>Logging in...</h3>
                        <div class="loader"></div>
                    </div>
                `;
            });
            
            // Register button click handler
            document.getElementById('submit-register-btn').addEventListener('click', () => {
                const username = document.getElementById('register-username').value.trim();
                const password = document.getElementById('register-password').value;
                const confirmPassword = document.getElementById('register-confirm').value;
                const errorElement = document.getElementById('modal-register-error');
                
                if (!username) {
                    errorElement.textContent = 'Username is required';
                    errorElement.style.display = 'block';
                    return;
                }
                
                if (!password) {
                    errorElement.textContent = 'Password is required';
                    errorElement.style.display = 'block';
                    return;
                }
                
                if (password !== confirmPassword) {
                    errorElement.textContent = 'Passwords do not match';
                    errorElement.style.display = 'block';
                    return;
                }
                
                // Send registration request
                socket.emit('register', { username, password });
                
                // Show loading state
                modal.innerHTML = `
                    <div class="modal-content">
                        <h3>Creating your account...</h3>
                        <div class="loader"></div>
                    </div>
                `;
            });
            
            // Allow Enter key in login fields
            document.getElementById('login-password').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('submit-login-btn').click();
                }
            });
            
            // Allow Enter key in register fields
            document.getElementById('register-confirm').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('submit-register-btn').click();
                }
            });
        }
    });

    // Add CSS for disabled buttons
    const disabledButtonStyle = document.createElement('style');
    disabledButtonStyle.textContent = `
        .action-button.disabled {
            background-color: #555;
            cursor: not-allowed;
            opacity: 0.7;
        }
        
        .action-button.disabled:hover {
            background-color: #555;
        }
    `;
    document.head.appendChild(disabledButtonStyle);

    // Make sure the save button has the correct event listener
    const saveFileButton = document.getElementById('save-file');
    if (saveFileButton) {
        console.log('[DEBUG] Found save-file button, attaching event listener');
        saveFileButton.addEventListener('click', () => {
            console.log(`[DEBUG] Save button clicked, currentFile = ${currentFile}`);
            if (currentFile) {
                const content = editor.getValue();
                console.log(`[DEBUG] Saving file: ${currentFile}, content length: ${content.length}`);
                
                // Send to server
                socket.emit('save-file', {
                    path: currentFile,
                    content: content
                });
                
                // Update UI
                modifiedFiles.delete(currentFile);
                document.querySelectorAll('.file-item').forEach(item => {
                    if (item.dataset.path === currentFile) {
                        const text = item.textContent.trim();
                        if (text.endsWith('*')) {
                            item.innerHTML = `<i class="fas fa-file-code"></i> ${text.slice(0, -1).trim()}`;
                        }
                    }
                });
                
                term.write(`Saving file: ${currentFile}\n`);
            } else {
                term.write('No file selected to save.\n');
            }
        });
    } else {
        console.error('[DEBUG] Save button not found in the DOM');
    }
    
    // Also add a socket event handler for file-saved confirmation
    socket.on('file-saved', (data) => {
        console.log(`[DEBUG] Received file-saved confirmation for: ${data.path}`);
        term.write(`File saved: ${data.path}\n`);
    });

    // Add this function to handle file opening and set currentFile
    function openFile(filePath) {
        console.log(`[DEBUG] Opening file: ${filePath}`);
        
        // Request file content from server
        socket.emit('get-file-content', filePath);
        
        // Set as current file immediately
        currentFile = filePath;
        
        // Update UI to show which file is active
        document.querySelectorAll('.file-item').forEach(item => {
            if (item.dataset.path === filePath) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        console.log(`[DEBUG] Current file set to: ${currentFile}`);
    }

    // Update the file click handler in the buildFileTree function
    function buildFileTree(files) {
        // ... existing code ...
        
        fileItem.addEventListener('click', () => {
            const filePath = fileItem.dataset.path;
            console.log(`[DEBUG] File clicked: ${filePath}`);
            openFile(filePath);
        });
        
        // ... existing code ...
    }

    // Debug all buttons to make sure they're in the DOM
    console.log('[DEBUG] All buttons in the DOM:');
    document.querySelectorAll('button').forEach(button => {
        console.log(`[DEBUG] Button: id=${button.id}, text=${button.innerText}`);
    });
    
    // Direct approach - add click handler to compile button
    const compileBtn = document.getElementById('compile-docker');
    if (compileBtn) {
        console.log('[DEBUG] Found compile button, adding direct click handler');
        
        // Remove existing listeners by cloning
        const newBtn = compileBtn.cloneNode(true);
        compileBtn.parentNode.replaceChild(newBtn, compileBtn);
        
        // Add new listener
        newBtn.onclick = function() {
            console.log('[DEBUG] Compile button clicked (direct handler)');
            // Reset compilation status
            compilationFailed = false;
            // Clear previous error messages
            term.write('Starting compilation from direct handler...\n');
            socket.emit('compile-docker');
            return false; // Prevent default
        };
    } else {
        console.error('[DEBUG] CRITICAL: Compile button not found!');
    }
    
    // Add global click handler to catch all clicks
    document.addEventListener('click', (e) => {
        console.log(`[DEBUG] Click detected on: ${e.target.tagName} id=${e.target.id} class=${e.target.className}`);
        
        // Check if click is on or inside the compile button
        if (e.target.id === 'compile-docker' || e.target.closest('#compile-docker')) {
            console.log('[DEBUG] Compile button area clicked (global handler)');
            // Reset compilation status
            compilationFailed = false;
            term.write('Starting compilation from global handler...\n');
            socket.emit('compile-docker');
        }
    });
    
    // Add manual compile function that can be called from console
    window.manualCompile = function() {
        console.log('[DEBUG] Manual compile triggered');
        // Reset compilation status
        compilationFailed = false;
        term.write('Starting compilation from manual trigger...\n');
        socket.emit('compile-docker');
    };
    
    console.log('[DEBUG] Setup complete - you can trigger compile manually with manualCompile()');

    let currentProjectId = null; // Variable to store the current project ID

    // Function to open a file and set the current project ID
    function openProject(projectId) {
        currentProjectId = projectId; // Set the current project ID
        console.log(`[DEBUG] Current project set to: ${currentProjectId}`);
        loadFileList(); // Load the file list for the selected project
    }

    // Update the file click handler in the buildFileTree function
    function buildFileTree(files) {
        // ... existing code ...
        
        fileItem.addEventListener('click', () => {
            const filePath = fileItem.dataset.path;
            console.log(`[DEBUG] File clicked: ${filePath}`);
            openFile(filePath);
        });
        
        // Add a project selection mechanism (e.g., dropdown or list)
        const projectSelector = document.getElementById('project-selector');
        projectSelector.addEventListener('change', (event) => {
            openProject(event.target.value); // Set the current project ID based on selection
        });
        
        // ... existing code ...
    }

    // Add this helper function for command execution
    function executeCommand(command) {
        // For qubic-cli commands, ensure we're in the right directory
        if (command.includes('qubic-cli')) {
            // Send a modified command that executes in the correct directory
            const wrappedCommand = `
                if [ -f "/app/project/cli-commands/build_docker/qubic-cli" ]; then
                    cd /app/project/cli-commands/build_docker && ${command.replace('./qubic-cli', './qubic-cli')}
                elif [ -f "/app/project/contracts/build_docker/qubic-cli" ]; then
                    cd /app/project/contracts/build_docker && ${command.replace('./qubic-cli', './qubic-cli')}
                elif [ -f "/app/project/build_docker/qubic-cli" ]; then
                    cd /app/project/build_docker && ${command.replace('./qubic-cli', './qubic-cli')}
                elif [ -f "/app/project/qubic-cli" ]; then
                    cd /app/project && ${command}
                else
                    echo "Error: qubic-cli not found. Please compile first."
                    # Search for qubic-cli in the project directory
                    echo "Searching for qubic-cli executable..."
                    find /app/project -name "qubic-cli" -type f
                fi
            `;
            socket.emit('run-command', wrappedCommand);
        } else {
            // For non-qubic-cli commands, just execute normally
            socket.emit('run-command', command);
        }
        
        // Clear command input
        commandInput.value = '';
    }

    // Update the run-command button click handler
    document.getElementById('run-command').addEventListener('click', () => {
        const command = document.getElementById('command-input').value.trim();
        if (command) {
            executeCommand(command);
        }
    });

    // Add the same for command input Enter key press
    document.getElementById('command-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const command = document.getElementById('command-input').value.trim();
            if (command) {
                executeCommand(command);
            }
        }
    });

    // Add directory information to the terminal prompt
    function updatePrompt() {
        socket.emit('run-command', `
            if [ -f "/tmp/workdir" ]; then
                echo "WORKDIR=$(cat /tmp/workdir)"
            elif [ -d "/app/project/cli-commands/build_docker" ] && [ -f "/app/project/cli-commands/build_docker/qubic-cli" ]; then
                echo "WORKDIR=/app/project/cli-commands/build_docker"
            elif [ -d "/app/project/contracts/build_docker" ] && [ -f "/app/project/contracts/build_docker/qubic-cli" ]; then
                echo "WORKDIR=/app/project/contracts/build_docker"
            elif [ -d "/app/project/build_docker" ] && [ -f "/app/project/build_docker/qubic-cli" ]; then
                echo "WORKDIR=/app/project/build_docker"
            else
                echo "WORKDIR=/app/project"
            fi
        `);
    }

    // Store compilation status
    let compilationFailed = false;

    // Add this after successful compilation
    socket.on('compile-complete', (result) => {
        console.log('Compilation complete:', result);
        
        // Store compilation status
        compilationFailed = !result.success;
        
        // After compilation, update prompt to show new working directory
        setTimeout(updatePrompt, 2000);
        
        // Update UI based on compilation result
        const compilationMessage = document.getElementById('compilation-message');
        if (compilationMessage) {
            if (result.success) {
                compilationMessage.textContent = 'Compilation Successful';
                compilationMessage.style.color = 'green';
                // Show a success notification
                showNotification('Compilation completed successfully!', 'success');
            } else {
                compilationMessage.textContent = 'Compilation Failed';
                compilationMessage.style.color = 'red';
                // Show a failure notification
                showNotification('Compilation failed. Please check the terminal for errors.', 'error');
            }
        }
    });

    // Add reset project functionality
    const resetButton = document.getElementById('reset-project');
    if (resetButton) {
        console.log('[DEBUG] Found reset-project button, attaching event listener');
        resetButton.addEventListener('click', () => {
            console.log('[DEBUG] Reset button clicked');
            if (window.isLoggedIn) {
                // Confirm before resetting
                if (confirm('Are you sure you want to reset your project? All your changes will be lost.')) {
                    console.log('[DEBUG] Confirmed reset, sending reset-project event');
                    socket.emit('reset-project');
                    
                    // Show feedback in terminal
                    term.write('Resetting project to default state...\n');
                }
            } else {
                alert('Please log in to reset your project');
            }
        });
    } else {
        console.error('[DEBUG] Reset button not found in the DOM');
    }

    // Add a new handler for register-complete
    socket.on('register-complete', (data) => {
        console.log('[DEBUG] Registration complete:', data);
        
        // Find existing modal
        const modal = document.querySelector('.modal');
        if (modal) {
            // Update the modal content to show success and login form
            modal.querySelector('.modal-content').innerHTML = `
                <h3>Account Created!</h3>
                <p class="success-message">Your account has been created successfully.</p>
                <p>Please login with your credentials:</p>
                
                <div class="input-group">
                    <label for="success-login-username">Username:</label>
                    <input type="text" id="success-login-username" value="${data.username}" readonly>
                </div>
                <div class="input-group">
                    <label for="success-login-password">Password:</label>
                    <input type="password" id="success-login-password" placeholder="Enter your password" autofocus>
                </div>
                <div class="login-error" id="success-login-error"></div>
                <div class="button-group">
                    <button id="success-login-btn" class="primary-button">Login</button>
                </div>
            `;
            
            // Add success login button handler
            document.getElementById('success-login-btn').addEventListener('click', () => {
                const username = document.getElementById('success-login-username').value;
                const password = document.getElementById('success-login-password').value;
                
                if (!password) {
                    const errorElement = document.getElementById('success-login-error');
                    errorElement.textContent = 'Password is required';
                    errorElement.style.display = 'block';
                    return;
                }
                
                // Show loading
                modal.querySelector('.modal-content').innerHTML = `
                    <h3>Logging in...</h3>
                    <div class="loader"></div>
                `;
                
                // Send login request
                socket.emit('login', { username, password });
            });
            
            // Add enter key handler for password field
            document.getElementById('success-login-password').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('success-login-btn').click();
                }
            });
        }
        
        // Also show a notification
        showNotification('Account created successfully!', 'success');
    });

    // Add this CSS for success message
    const successStyles = document.createElement('style');
    successStyles.textContent = `
        .success-message {
            color: #28a745;
            margin: 15px 0;
            font-weight: bold;
        }
        
        .primary-button {
            background-color: var(--primary-color);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .primary-button:hover {
            background-color: #005999;
        }
        
        .loader {
            border: 4px solid #f3f3f3;
            border-top: 4px solid var(--primary-color);
            border-radius: 50%;
            width: 30px;
            height: 30px;
            margin: 20px auto;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(successStyles);

    // Update the login-success handler to ensure the modal is properly removed
    socket.on('login-success', (data) => {
        console.log('[DEBUG] Login successful:', data);
        
        // Set logged in state and update UI immediately
        window.isLoggedIn = true;
        const userId = data.userId;
        
        try {
            // Update cookie with longer expiration (7 days)
            document.cookie = `qubicUserId=${userId}; path=/; max-age=604800`;
            
            // Update login button
            const loginButton = document.getElementById('login-button');
            if (loginButton) {
                loginButton.innerHTML = `<i class="fas fa-user"></i> ${userId}`;
                loginButton.classList.add('logged-in');
            }
            
            // Find and remove modal if it exists
            const modal = document.querySelector('.modal');
            if (modal && modal.parentNode) {
                console.log('[DEBUG] Removing login modal after successful login');
                modal.parentNode.removeChild(modal);
            }
            
            // Show notification
            showNotification(`Logged in as ${userId}`, 'success');
            
            // Log successful login completion
            console.log('[DEBUG] Login process completed successfully');
        } catch (error) {
            console.error('[DEBUG] Error in login success handler:', error);
        }
    });

    // Add a login error handler to script.js if it doesn't exist
    socket.on('login-error', (data) => {
        console.log('[DEBUG] Login error:', data.error);
        
        // Find existing modal
        const modal = document.querySelector('.modal');
        if (modal) {
            // Update the modal content to show the error
            modal.querySelector('.modal-content').innerHTML = `
                <span class="close-modal">&times;</span>
                <h3>Login Failed</h3>
                <p class="error-message">${data.error}</p>
                <div class="button-group">
                    <button id="try-again-btn" class="submit-button">Try Again</button>
                </div>
            `;
            
            // Close button handler
            modal.querySelector('.close-modal').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            // Try again button handler
            document.getElementById('try-again-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
                document.getElementById('login-button').click();
            });
        } else {
            // If modal doesn't exist, show a notification
            showNotification(data.error, 'error');
        }
    });

    // Update the clearSession function to be more robust
    function clearSession() {
        console.log('[DEBUG] Clearing user session');
        // Clear cookies by setting expiration in the past
        document.cookie = 'qubicUserId=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        // Reset logged in state
        window.isLoggedIn = false;
        window.userId = null;
    }

    // Update the checkLoggedInStatus function to be more robust
    function checkLoggedInStatus() {
        console.log('[DEBUG] Checking login status...');
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'qubicUserId' && value) {
                console.log('[DEBUG] Found user ID in cookie:', value);
                
                // Ensure socket.userId is set on both client and server
                if (window.AuthModal && socket) {
                    window.AuthModal.setSocketUserId(socket, value);
                }
                
                return value; // Return the user ID
            }
        }
        console.log('[DEBUG] No user ID found in cookies');
        return null; // Not logged in
    }

    // Add handler for auto-login-success
    socket.on('auto-login-success', (data) => {
        console.log('[DEBUG] Auto-login successful:', data);
        
        // Set logged in state
        window.isLoggedIn = true;
        const userId = data.userId;
        
        // Update login button
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
            loginButton.innerHTML = `<i class="fas fa-user"></i> ${userId}`;
            loginButton.classList.add('logged-in');
        }
        
        // No need to show notification for auto-login
    });

    // Event listeners
    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('show');
    });

    document.getElementById('open-ai-assistant').addEventListener('click', () => {
        // Toggle AI assistant visibility
        const aiAssistant = document.querySelector('.ai-assistant');
        if (aiAssistant) {
            if (aiAssistant.classList.contains('show')) {
                aiAssistant.classList.remove('show');
            } else {
                aiAssistant.classList.add('show');
            }
        }
    });
    
    document.getElementById('open-contract-tester').addEventListener('click', () => {
        window.location.href = '/smart-contract-tester';
    });

    document.getElementById('login-button').addEventListener('click', () => {
        // ... existing code ...
    });

    // Initialize AI Assistant functionality
    // Note: AI Assistant functionality is now handled in ai-cli.js
    // This prevents conflicts between multiple event handlers
    // Keep the socket reference for other functionality
});