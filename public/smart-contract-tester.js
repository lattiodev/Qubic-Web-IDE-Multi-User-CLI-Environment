document.addEventListener('DOMContentLoaded', () => {
    // Connect to Socket.io
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });

    // Initialize variables
    let editor;
    let terminal;
    let currentFile = null;
    let isLoggedIn = false;
    let userId = null;
    let terminalHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--terminal-height'));
    let userContracts = [];
    let coreFiles = [];
    let exampleContracts = [];
    
    // Define a constant for the assistant ID to ensure consistency
    const ASSISTANT_ID = 'asst_RB8usbGy1Q7b9qQTkiUhGzcu';
    
    // Initial contract template
    const INITIAL_CONTRACT = `using namespace qpi;

class SimpleContract {
public:
    // Stores balance at epoch start
    struct State {
        uint64_t previous_balance;
        uint64_t current_balance;
    };

    State state;

    // Function to update balance at BEGIN_EPOCH
    PUBLIC void begin_epoch() {
        ::Entity entity;
        bit status = qpi.getEntity(SELF, entity);

        require(status, "Failed to fetch entity data");

        state.previous_balance = state.current_balance;
        state.current_balance = entity.incomingAmount - entity.outgoingAmount;

        print("Previous Balance: ", state.previous_balance);
        print("Current Balance: ", state.current_balance);
    }

    // Function to check SC balance dynamically
    PUBLIC uint64_t get_balance() {
        ::Entity entity;
        bit status = qpi.getEntity(SELF, entity);
        require(status, "Failed to fetch entity balance");
        return entity.incomingAmount - entity.outgoingAmount;
    }

    // Function to deposit funds (test case)
    PUBLIC void deposit(uint64_t amount) {
        require(amount > 0, "Deposit amount must be positive");
        print("Received deposit: ", amount);
    }
};`;
    
    // DOM Elements
    const toggleSidebarBtn = document.getElementById('toggle-sidebar');
    const toggleAssistantBtn = document.getElementById('toggle-assistant');
    const loginButton = document.getElementById('login-button');
    const testContractBtn = document.getElementById('test-contract');
    const saveFileBtn = document.getElementById('save-file');
    const submitContractBtn = document.getElementById('submit-contract');
    const fileExplorer = document.getElementById('file-explorer');
    const resizeHandle = document.getElementById('resize-handle');
    const maximizeTerminalBtn = document.getElementById('maximize-terminal');
    const minimizeTerminalBtn = document.getElementById('minimize-terminal');
    const clearTerminalBtn = document.getElementById('clear-terminal');
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send');
    const aiMessages = document.getElementById('ai-messages');
    const sidebar = document.querySelector('.sidebar');
    const aiAssistant = document.querySelector('.ai-assistant');
    const addContractBtn = document.getElementById('add-contract');
    
    // Initialize Monaco Editor
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.36.1/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        // Define C++ language
        monaco.languages.register({ id: 'cpp' });
        
        // Create editor
        editor = monaco.editor.create(document.getElementById('editor'), {
            value: `// This is a test contract for your Qubic smart contract

using namespace qpi;

class SimpleContract {
public:
    // Stores balance at epoch start
    struct State {
        uint64_t previous_balance;
        uint64_t current_balance;
    };

    State state;

    // Function to update balance at BEGIN_EPOCH
    PUBLIC void begin_epoch() {
        ::Entity entity;
        bit status = qpi.getEntity(SELF, entity);

        require(status, "Failed to fetch entity data");

        state.previous_balance = state.current_balance;
        state.current_balance = entity.incomingAmount - entity.outgoingAmount;

        print("Previous Balance: ", state.previous_balance);
        print("Current Balance: ", state.current_balance);
    }

    // Function to check SC balance dynamically
    PUBLIC uint64_t get_balance() {
        ::Entity entity;
        bit status = qpi.getEntity(SELF, entity);
        require(status, "Failed to fetch entity balance");
        return entity.incomingAmount - entity.outgoingAmount;
    }

    // Function to deposit funds (test case)
    PUBLIC void deposit(uint64_t amount) {
        require(amount > 0, "Deposit amount must be positive");
        print("Received deposit: ", amount);
    }
};`,
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: {
                enabled: true
            },
            scrollBeyondLastLine: false,
            fontSize: 14,
            tabSize: 4,
            insertSpaces: true
        });
        
        // Set editor focus
        editor.focus();
    });
    
    // Initialize Terminal
    terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        theme: {
            background: '#1e1e1e',
            foreground: '#cccccc'
        }
    });
    terminal.open(document.getElementById('terminal'));
    terminal.writeln('Smart Contract Tester Terminal');
    terminal.writeln('-------------------------------');
    terminal.writeln('Write or load a contract and click "Test Contract" to analyze it.');
    terminal.writeln('');
    
    // Load example contracts
    loadExampleContracts();
    
    // Check login status
    checkLoginStatus();
    
    // Event Listeners
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
    });
    
    toggleAssistantBtn.addEventListener('click', () => {
        aiAssistant.classList.toggle('show');
    });
    
    loginButton.addEventListener('click', () => {
        if (isLoggedIn) {
            console.log('Logging out user:', userId);
            // Logout
            socket.emit('logout');
            
            // Clear cookie and reset state
            document.cookie = 'qubicUserId=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            isLoggedIn = false;
            userId = null;
            updateLoginButton();
            
            // Show notification
            showNotification('Logged out successfully', 'info');
            
            // Clear file explorer
            renderFileExplorer();
        } else {
            // Use the shared auth modal
            if (window.AuthModal) {
                // Store socket in window for the auth modal to access
                window.authSocket = socket;
                window.AuthModal.show(socket);
                
                // Listen for login success event
                document.addEventListener('auth:login-success', function loginSuccessHandler(e) {
                    console.log('Login success event received:', e.detail);
                    isLoggedIn = true;
                    userId = e.detail.userId;
                    updateLoginButton();
                    showNotification('Logged in successfully', 'success');
                    
                    // Add a small delay before requesting contracts to ensure server has time to register the login
                    setTimeout(() => {
                        // Get user's contracts
                        console.log('Requesting user contracts for:', userId);
                        socket.emit('get-user-contracts');
                    }, 500); // 500ms delay should be enough
                    
                    // Remove this event listener
                    document.removeEventListener('auth:login-success', loginSuccessHandler);
                });
            } else {
                console.error('Auth modal not available. Make sure auth-modal.js is loaded.');
                showNotification('Login functionality not available', 'error');
            }
        }
    });
    
    // Track if a test is currently in progress
    let testInProgress = false;
    let lastTestTime = 0;

    // Function to test the current contract with AI
    function testCurrentContract() {
        if (!isLoggedIn) {
            showNotification('Please login to test contracts', 'error');
            return;
        }
        
        const code = editor.getValue();
        if (!code.trim()) {
            showNotification('Please write or load a contract first', 'error');
            return;
        }
        
        // Prevent rapid double-clicks - debounce to 3 seconds
        const now = Date.now();
        if (testInProgress || (now - lastTestTime < 3000)) {
            console.log('Test already in progress or clicked too soon - ignoring request');
            return;
        }
        
        // Update test state
        testInProgress = true;
        lastTestTime = now;
        
        // Disable the test button to prevent multiple clicks
        const testButton = document.getElementById('test-contract');
        testButton.disabled = true;
        testButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
        
        // Clear terminal and show status
        terminal.clear();
        terminal.writeln('Sending your contract to the AI for review...');
        terminal.writeln('This may take up to a minute to complete.');
        terminal.writeln('Please wait while the analysis is performed...');
        terminal.writeln('');
        
        // Show thinking animation
        const progressChars = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
        let progressIndex = 0;
        
        const progressInterval = setInterval(() => {
            // Clear the previous line and write the new progress character
            terminal.write('\r');
            terminal.write(`${progressChars[progressIndex]} Analyzing...`);
            progressIndex = (progressIndex + 1) % progressChars.length;
        }, 200);
        
        // Send to the server for testing
        console.log('Sending contract for analysis with assistant ID:', ASSISTANT_ID);
        socket.emit('test-contract', {
            code: code,
            assistantId: ASSISTANT_ID
        });
        
        // Set up a listener to clear the progress indicator when results come back
        const clearProgress = (data) => {
            clearInterval(progressInterval);
            testButton.disabled = false;
            testButton.innerHTML = '<i class="fas fa-vial"></i> Test Contract';
            
            // Reset test state
            testInProgress = false;
            
            // Remove this one-time listener
            socket.off('test-results', clearProgress);
        };
        
        // Add the listener
        socket.on('test-results', clearProgress);
    }
    
    testContractBtn.addEventListener('click', testCurrentContract);
    
    saveFileBtn.addEventListener('click', () => {
        if (!isLoggedIn) {
            showNotification('Please login to save contracts', 'error');
            return;
        }
        
        const code = editor.getValue();
        if (!code.trim()) {
            showNotification('Nothing to save', 'error');
            return;
        }
        
        if (currentFile) {
            // Save existing file
            socket.emit('save-file', { path: currentFile, content: code });
        } else {
            // Show save dialog
            const fileName = prompt('Enter file name (with .h extension):', 'MyContract.h');
            if (fileName) {
                if (!fileName.endsWith('.h')) {
                    showNotification('File name must end with .h extension', 'error');
                    return;
                }
                
                socket.emit('save-file', { path: fileName, content: code });
                currentFile = fileName;
            }
        }
    });
    
    submitContractBtn.addEventListener('click', () => {
        if (!isLoggedIn) {
            showNotification('Please login to submit contracts', 'error');
            return;
        }
        
        const code = editor.getValue();
        if (!code.trim()) {
            showNotification('Please write or load a contract first', 'error');
            return;
        }
        
        // First test the contract
        socket.emit('test-contract', { 
            code,
            onSuccess: () => {
                // If test passes, show confirmation dialog
                if (confirm('Your contract passed the tests! Do you want to submit it to the testnet?')) {
                    // Submit contract to testnet
                    socket.emit('submit-contract', { code });
                }
            }
        });
    });
    
    resizeHandle.addEventListener('mousedown', initResize);
    
    maximizeTerminalBtn.addEventListener('click', () => {
        const mainContent = document.querySelector('.main-content');
        const editorContainer = document.querySelector('.editor-container');
        const terminalContainer = document.querySelector('.terminal-container');
        
        // Save current height before maximizing
        terminalHeight = terminalContainer.offsetHeight;
        
        // Set terminal to take up most of the space
        editorContainer.style.flex = '0 0 100px';
        terminalContainer.style.flex = '1';
        terminalContainer.style.height = 'auto';
        
        // Update terminal size
        updateTerminalLayout();
    });
    
    minimizeTerminalBtn.addEventListener('click', () => {
        const mainContent = document.querySelector('.main-content');
        const editorContainer = document.querySelector('.editor-container');
        const terminalContainer = document.querySelector('.terminal-container');
        
        // Restore original layout
        editorContainer.style.flex = '1';
        terminalContainer.style.flex = '0';
        terminalContainer.style.height = `${terminalHeight}px`;
        
        // Update terminal size
        updateTerminalLayout();
    });
    
    clearTerminalBtn.addEventListener('click', () => {
        terminal.clear();
    });
    
    aiSendBtn.addEventListener('click', sendAiMessage);
    
    aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiMessage();
        }
    });
    
    // Socket.io Event Handlers
    socket.on('connect', () => {
        console.log('Connected to server');
        checkLoginStatus();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
    
    socket.on('login-success', (data) => {
        isLoggedIn = true;
        userId = data.userId;
        updateLoginButton();
    });
    
    socket.on('logout-success', () => {
        isLoggedIn = false;
        userId = null;
        updateLoginButton();
        showNotification('Logged out successfully', 'info');
    });
    
    socket.on('file-saved', (data) => {
        showNotification(`File ${data.path} saved successfully`, 'success');
        currentFile = data.path;
    });
    
    socket.on('test-result', (data) => {
        if (data.error) {
            showNotification(`Test failed: ${data.error}`, 'error');
            if (terminal) {
                terminal.write(`\r\nTest failed: ${data.error}\r\n`);
            }
            // Remove thinking message
            document.querySelector('.ai-message.thinking')?.remove();
        } else {
            if (terminal) {
                // Clear terminal and show the test output
                terminal.clear();
                
                if (data.aiAnalysis) {
                    // Show the full AI analysis in the terminal
                    const formattedOutput = simpleMarkdownToAnsi(data.aiAnalysis);
                    terminal.write(`${formattedOutput}\r\n`);
                } else if (data.output) {
                    // Fallback to output field if aiAnalysis isn't available
                    const formattedOutput = simpleMarkdownToAnsi(data.output);
                    terminal.write(`${formattedOutput}\r\n`);
                } else {
                    // Generic message if no analysis is available
                    terminal.write(`Test completed. ${data.success ? 'Success!' : 'Failed.'}\r\n`);
                    
                    if (data.errors && data.errors.length > 0) {
                        terminal.write(`\r\nErrors:\r\n`);
                        data.errors.forEach(err => terminal.write(`- ${err}\r\n`));
                    }
                    
                    if (data.warnings && data.warnings.length > 0) {
                        terminal.write(`\r\nWarnings:\r\n`);
                        data.warnings.forEach(warn => terminal.write(`- ${warn}\r\n`));
                    }
                }
            }
            
            // Remove thinking message if exists
            const thinkingMsg = document.querySelector('.ai-message.thinking');
            if (thinkingMsg) {
                aiMessages.removeChild(thinkingMsg);
            }
            
            // Add a note in the chat area showing that we used the review agent
            terminal.writeln(`\r\nTest failed: ${data.error}\r\n`);
            return;
        }
        
        // Display basic results
        terminal.writeln('');
        terminal.writeln('Test completed.');
        terminal.writeln('');
        
        if (data.success) {
            terminal.writeln('✅ No critical errors found');
        } else {
            terminal.writeln('❌ Contract has issues that need to be fixed');
        }
        
        // Display errors if any
        if (data.errors && data.errors.length > 0) {
            terminal.writeln('');
            terminal.writeln('ERRORS:');
            data.errors.forEach(error => {
                terminal.writeln(`- ${error}`);
            });
        }
        
        // Display warnings if any
        if (data.warnings && data.warnings.length > 0) {
            terminal.writeln('');
            terminal.writeln('WARNINGS:');
            data.warnings.forEach(warning => {
                terminal.writeln(`- ${warning}`);
            });
        }
        
        // Display AI analysis if available
        if (data.aiAnalysis) {
            terminal.writeln('');
            terminal.writeln('AI ANALYSIS:');
            terminal.writeln('');
            
            // Format AI analysis with markdown
            const formattedAnalysis = simpleMarkdownToAnsi(data.aiAnalysis);
            terminal.writeln(formattedAnalysis);
        }
        
        terminal.writeln('');
        terminal.writeln('Test complete. Review the results above.');
    });
    
    socket.on('contract-submitted', (data) => {
        if (data.success) {
            showNotification('Contract submitted to testnet successfully!', 'success');
            terminal.writeln('');
            terminal.writeln('✅ Contract submitted to testnet successfully!');
            terminal.writeln(`Pull request created: ${data.pullRequestUrl}`);
            terminal.writeln('The Qubic team will review your contract and deploy it to the testnet.');
        } else {
            showNotification('Failed to submit contract: ' + data.error, 'error');
            terminal.writeln('');
            terminal.writeln('❌ Failed to submit contract:');
            terminal.writeln(data.error);
        }
    });
    
    socket.on('ai-response', (data) => {
        // Remove thinking message if it exists
        const thinkingMsg = document.querySelector('.ai-message.thinking');
        if (thinkingMsg) {
            aiMessages.removeChild(thinkingMsg);
        }
        
        // Check if there's an error
        if (data.error) {
            const messageEl = document.createElement('div');
            messageEl.className = 'ai-message assistant error';
            messageEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${data.error}`;
            aiMessages.appendChild(messageEl);
            
            // Scroll to bottom
            aiMessages.scrollTop = aiMessages.scrollHeight;
            return;
        }
        
        // Process message
        const response = data.message || '';
        
        // Add AI response
        const messageEl = document.createElement('div');
        messageEl.className = 'ai-message assistant';
        messageEl.innerHTML = formatAiMessage(response);
        
        aiMessages.appendChild(messageEl);
        
        // Scroll to bottom
        aiMessages.scrollTop = aiMessages.scrollHeight;
    });
    
    socket.on('user-contracts', (data) => {
        if (data.error) {
            showNotification(`Error loading contracts: ${data.error}`, 'error');
            return;
        }
        
        userContracts = data.contracts || [];
        
        // Find the user contracts section
        const userHeader = document.querySelector('.file-header');
        if (!userHeader) return;
        
        // Clear existing contracts (except for headers and separators)
        let nextElement = userHeader.nextElementSibling;
        while (nextElement && !nextElement.classList.contains('file-header') && 
               !nextElement.style.borderBottom) {
            const toRemove = nextElement;
            nextElement = nextElement.nextElementSibling;
            fileExplorer.removeChild(toRemove);
        }
        
        // Add new contract button
        const newContractBtn = document.createElement('div');
        newContractBtn.className = 'file-item';
        newContractBtn.innerHTML = '<i class="fas fa-plus"></i> New Contract';
        newContractBtn.addEventListener('click', createNewContract);
        fileExplorer.insertBefore(newContractBtn, nextElement);
        
        // Add user contracts
        if (userContracts.length === 0) {
            const noContractsItem = document.createElement('div');
            noContractsItem.className = 'file-item';
            noContractsItem.innerHTML = '<i class="fas fa-info-circle"></i> No contracts yet';
            fileExplorer.insertBefore(noContractsItem, nextElement);
        } else {
            userContracts.forEach(contract => {
                const contractItem = document.createElement('div');
                contractItem.className = 'file-item';
                contractItem.setAttribute('data-file', contract.path);
                if (currentFile === contract.path) {
                    contractItem.classList.add('active');
                }
                contractItem.innerHTML = `<i class="fas fa-file-code"></i> ${contract.name}`;
                contractItem.addEventListener('click', () => loadUserContract(contract.path));
                fileExplorer.insertBefore(contractItem, nextElement);
            });
        }
    });
    
    socket.on('example-contracts', (data) => {
        coreFiles = data.coreFiles || [];
        exampleContracts = data.contracts || [];
        
        // Find the example contracts section
        const exampleHeader = Array.from(document.querySelectorAll('.file-header')).find(
            el => el.innerHTML.includes('Example Contracts')
        );
        if (!exampleHeader) return;
        
        // Clear existing examples
        let nextElement = exampleHeader.nextElementSibling;
        while (nextElement) {
            const toRemove = nextElement;
            nextElement = nextElement.nextElementSibling;
            fileExplorer.removeChild(toRemove);
        }
        
        // Add example contracts
        if (exampleContracts.length === 0) {
            const noExamplesItem = document.createElement('div');
            noExamplesItem.className = 'file-item';
            noExamplesItem.innerHTML = '<i class="fas fa-info-circle"></i> No examples available';
            fileExplorer.appendChild(noExamplesItem);
        } else {
            exampleContracts.forEach(contract => {
                const contractItem = document.createElement('div');
                contractItem.className = 'file-item';
                contractItem.setAttribute('data-path', contract.path);
                contractItem.innerHTML = `<i class="fas fa-book-open"></i> ${contract.name}`;
                contractItem.addEventListener('click', () => loadExampleContract(contract.path));
                fileExplorer.appendChild(contractItem);
            });
        }
    });
    
    // Add handler for analyzing-contract event
    socket.on('analyzing-contract', (data) => {
        if (data.status === 'started') {
            console.log('Server has begun analyzing the contract');
            // We're already showing progress in the terminal,
            // but we could update other UI elements here if needed
        }
    });
    
    // Handler for login result
    socket.on('login-result', (data) => {
        if (data.success) {
            isLoggedIn = true;
            userId = data.userId;
            
            showNotification(`Logged in as ${userId}`, 'success');
            updateLoginButton();
            
            // Load user's contracts
            socket.emit('get-user-contracts');
        } else {
            showNotification(`Login failed: ${data.error}`, 'error');
        }
    });

    // Handler for auto-login success
    socket.on('auto-login-success', (data) => {
        isLoggedIn = true;
        userId = data.userId;
        console.log(`Auto-logged in as ${userId}`);
        updateLoginButton();
        
        // Load user's contracts
        socket.emit('get-user-contracts');
    });

    // Handler for contract content
    socket.on('contract-content', (data) => {
        if (data.error) {
            showNotification(`Error loading contract: ${data.error}`, 'error');
            return;
        }
        
        if (editor) {
            editor.setValue(data.content);
            // Save the current file name for later operations
            currentFile = data.fileName;
            
            // Update UI to show which file is active
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            document.querySelector(`.file-item[data-file="${data.fileName}"]`)?.classList.add('active');
            
            console.log('Loaded file:', currentFile);
        }
    });

    // Handler for example contract content
    socket.on('example-contract-content', (data) => {
        if (data.error) {
            showNotification(`Error loading example: ${data.error}`, 'error');
            return;
        }
        
        if (editor) {
            editor.setValue(data.content);
            // When loading an example, set currentFile to the example name but mark it as example
            currentFile = null; // Reset current file as we're viewing an example
            
            // Update UI to show which file is active
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            document.querySelector(`.file-item.example-contract[data-path="${data.fileName}"], .file-item.core-file[data-path="${data.fileName}"]`)?.classList.add('active');
            
            // Show notification about read-only mode
            showNotification('Example contract loaded in read-only mode.', 'info');
        }
    });

    // Handler for save result
    socket.on('save-result', (data) => {
        if (data.error) {
            showNotification(`Error saving contract: ${data.error}`, 'error');
        } else {
            showNotification('Contract saved successfully', 'success');
            
            // Make sure we refresh the user contracts list
            socket.emit('get-user-contracts');
        }
    });

    // Handler for create result
    socket.on('create-result', (data) => {
        if (data.error) {
            showNotification(`Error creating contract: ${data.error}`, 'error');
        } else {
            showNotification('Contract created successfully', 'success');
        }
    });

    // Handler for submit result
    socket.on('submit-result', (data) => {
        if (data.error) {
            showNotification(`Submission failed: ${data.error}`, 'error');
            if (terminal) {
                terminal.write(`\r\nSubmission failed: ${data.error}\r\n`);
            }
        } else if (!data.success) {
            showNotification(`Submission failed: ${data.message}`, 'error');
        } else {
            showNotification('Contract submitted successfully!', 'success');
        }
    });
    
    // Add socket event handler for test-results
    socket.on('test-results', (data) => {
        console.log('Received test results:', data);
        
        // Make sure the test button is reset regardless of response
        const testButton = document.getElementById('test-contract');
        if (testButton) {
            testButton.disabled = false;
            testButton.innerHTML = '<i class="fas fa-vial"></i> Test Contract';
            
            // Reset test state
            testInProgress = false;
        }
        
        if (data.error) {
            // For test-in-progress errors, show a more friendly message
            if (data.error.includes('already in progress')) {
                showNotification('Analysis already in progress. Please wait...', 'info');
            } else {
                showNotification(`Test failed: ${data.error}`, 'error');
            }
            terminal.writeln(`\r\n`);
            return;
        }
        
        // Clear any previous content
        terminal.clear();
        
        // Create a nicely formatted header
        terminal.writeln('\r\n');
        terminal.writeln('╔═══════════════════════════════════════════╗');
        terminal.writeln('║           SMART CONTRACT ANALYSIS         ║');
        terminal.writeln('╚═══════════════════════════════════════════╝');
        terminal.writeln('\r\n');
        
        // Display AI Analysis if available
        if (data.aiAnalysis) {
            // Format as markdown for better readability
            const formattedAnalysis = simpleMarkdownToAnsi(data.aiAnalysis);
            terminal.writeln(formattedAnalysis);
        } else if (data.message) {
            terminal.writeln(data.message);
        }
        
        // Display errors if any
        if (data.errors && data.errors.length > 0) {
            terminal.writeln('\r\n');
            terminal.writeln('⚠️  ERRORS:');
            terminal.writeln('───────────');
            data.errors.forEach(error => {
                terminal.writeln(`• ${error}`);
            });
        }
        
        // Display warnings if any
        if (data.warnings && data.warnings.length > 0) {
            terminal.writeln('\r\n');
            terminal.writeln('⚠️  WARNINGS:');
            terminal.writeln('─────────────');
            data.warnings.forEach(warning => {
                terminal.writeln(`• ${warning}`);
            });
        }
        
        terminal.writeln('\r\n');
        terminal.writeln('════════════════════════════════════════════');
        
        if (data.success) {
            terminal.writeln('Analysis completed.');
        } else {
            terminal.writeln('⚠️ Analysis complete. Please address the issues above.');
        }
    });
    
    // Functions
    function initResize(e) {
        e.preventDefault();
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResize);
    }
    
    function resize(e) {
        const mainContent = document.querySelector('.main-content');
        const terminalContainer = document.querySelector('.terminal-container');
        
        // Calculate new terminal height
        const newHeight = Math.max(100, mainContent.offsetHeight - e.clientY + mainContent.getBoundingClientRect().top);
        
        // Update terminal height
        terminalContainer.style.height = `${newHeight}px`;
        terminalHeight = newHeight;
        
        // Update terminal size
        updateTerminalLayout();
    }
    
    function stopResize() {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResize);
    }
    
    function updateTerminalLayout() {
        // Force terminal to update its size
        if (terminal) {
            terminal.fit();
        }
    }
    
    function checkLoginStatus() {
        console.log('Checking login status...');
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'qubicUserId' && value) {
                console.log('Found user ID in cookie:', value);
                isLoggedIn = true;
                userId = value;
                updateLoginButton();
                
                // Ensure socket.userId is set on both client and server
                if (window.AuthModal && socket) {
                    window.AuthModal.setSocketUserId(socket, value);
                }
                
                return true;
            }
        }
        console.log('No user ID found in cookies');
        isLoggedIn = false;
        userId = null;
        updateLoginButton();
        return false;
    }
    
    function updateLoginButton() {
        console.log('Updating login button. isLoggedIn:', isLoggedIn, 'userId:', userId);
        if (isLoggedIn && userId) {
            loginButton.innerHTML = `<i class="fas fa-user"></i> ${userId}`;
            loginButton.classList.add('logged-in');
        } else {
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
            loginButton.classList.remove('logged-in');
        }
        
        // Refresh file explorer when login status changes
        renderFileExplorer();
    }
    
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove notification after 5 seconds
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 5000);
    }
    
    function loadExampleContracts() {
        socket.emit('get-example-contracts');
    }
    
    function renderFileExplorer() {
        // Clear the file explorer
        fileExplorer.innerHTML = '';
        
        // Create file headers with better descriptions
        const userContractsHeader = document.createElement('div');
        userContractsHeader.className = 'file-header';
        userContractsHeader.innerHTML = '<i class="fas fa-file-code"></i> Your Smart Contracts';
        fileExplorer.appendChild(userContractsHeader);
        
        // If user is logged in, get user contracts
        if (isLoggedIn) {
            socket.emit('get-user-contracts');
        } else {
            // Show login prompt
            const loginPrompt = document.createElement('div');
            loginPrompt.className = 'file-item';
            loginPrompt.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to view your contracts';
            loginPrompt.addEventListener('click', () => {
                document.getElementById('login-button').click();
            });
            fileExplorer.appendChild(loginPrompt);
        }
        
        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid var(--border-color)';
        separator.style.margin = '10px 0';
        fileExplorer.appendChild(separator);
        
        // Add example contracts header
        const exampleHeader = document.createElement('div');
        exampleHeader.className = 'file-header';
        exampleHeader.innerHTML = '<i class="fas fa-book"></i> Example Contracts';
        fileExplorer.appendChild(exampleHeader);
        
        // Get example contracts
        socket.emit('get-example-contracts');
    }
    
    function loadExampleContract(path) {
        if (!path) {
            console.error('No path provided for example contract');
            return;
        }
        console.log('Loading example contract:', path);
        socket.emit('load-example-contract', { path });
    }
    
    // Initialize include code checkbox with localStorage persistence
    const includeCodeCheckbox = document.getElementById('include-code-contract-checkbox');
    if (includeCodeCheckbox) {
        // Load saved preference
        const savedIncludeCode = localStorage.getItem('includeCodeInContractAI');
        includeCodeCheckbox.checked = savedIncludeCode === 'true';
        
        // Save preference when changed
        includeCodeCheckbox.addEventListener('change', () => {
            localStorage.setItem('includeCodeInContractAI', includeCodeCheckbox.checked);
        });
    }

    function sendAiMessage() {
        const message = aiInput.value.trim();
        if (!message) return;
        
        // Truncate message if too long (prevent UI breaking)
        const displayMessage = message.length > 500 
            ? message.substring(0, 500) + '...' 
            : message;
        
        // Add user message
        const userMessageEl = document.createElement('div');
        userMessageEl.className = 'ai-message user';
        userMessageEl.textContent = displayMessage;
        aiMessages.appendChild(userMessageEl);
        
        // Get current code if checkbox is checked
        let code = '';
        if (includeCodeCheckbox && includeCodeCheckbox.checked && editor) {
            code = editor.getValue();
            
            // Add code indicator to the message if code is included
            if (code) {
                const codeIndicator = document.createElement('div');
                codeIndicator.className = 'code-included-indicator';
                codeIndicator.innerHTML = '<i class="fas fa-code"></i> Code included';
                userMessageEl.appendChild(codeIndicator);
            }
        }
        
        // Add thinking message
        const thinkingEl = document.createElement('div');
        thinkingEl.className = 'ai-message thinking';
        thinkingEl.textContent = 'Thinking...';
        aiMessages.appendChild(thinkingEl);
        
        // Scroll to bottom
        aiMessages.scrollTop = aiMessages.scrollHeight;
        
        // Clear input
        aiInput.value = '';
        
        // Send to server (will use the chat agent)
        console.log('Sending message to chat assistant with ID:', ASSISTANT_ID);
        console.log('Including code:', includeCodeCheckbox && includeCodeCheckbox.checked);
        console.log('Code length:', code.length);
        
        socket.emit('ai-message', { 
            message: message, // Send full message to server
            code: code,
            isFromSmartContractPage: true,  // Flag to distinguish from main page messages
            assistantId: ASSISTANT_ID
        });
    }
    
    function formatAiMessage(message) {
        // Convert markdown-like syntax to HTML
        let formatted = message;
        
        // Code blocks
        formatted = formatted.replace(/```(\w*)([\s\S]*?)```/g, (match, language, code) => {
            return `<pre style="max-width: 100%; overflow-x: auto;"><code class="language-${language}">${code.trim()}</code></pre>`;
        });
        
        // Inline code
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Bold
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Italic
        formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Lists
        formatted = formatted.replace(/^\s*-\s+(.*)/gm, '<li>$1</li>');
        formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Paragraphs
        formatted = formatted.split('\n\n').map(p => `<p>${p}</p>`).join('');
        
        return formatted;
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
        updateTerminalLayout();
    });

    // Function to load a user contract
    function loadUserContract(fileName) {
        if (!isLoggedIn) {
            showNotification('Please log in to load contracts', 'error');
            return;
        }
        
        currentFile = fileName;
        console.log('Loading user contract:', fileName);
        socket.emit('get-user-contract', { fileName });
    }

    // Function to save the current contract
    function saveCurrentContract() {
        if (!isLoggedIn) {
            showNotification('Please log in to save contracts', 'error');
            return;
        }
        
        // Get the current content
        const content = editor.getValue();
        if (!content || content.trim().length === 0) {
            showNotification('No content to save', 'error');
            return;
        }
        
        console.log('Current file when saving:', currentFile);
        
        // If we're editing a user contract, save directly to it
        if (currentFile) {
            console.log('Saving to existing file:', currentFile);
            socket.emit('save-user-contract', {
                fileName: currentFile,
                content
            });
            return;
        }
        
        // If we don't have a current file (viewing an example), 
        // save to initial_contract.h if it exists
        if (userContracts.length > 0) {
            const initialContract = userContracts.find(c => c.name === 'initial_contract.h');
            if (initialContract) {
                console.log('Saving to initial contract');
                currentFile = 'initial_contract.h';
                socket.emit('save-user-contract', {
                    fileName: currentFile,
                    content
                });
                
                // Update UI
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
                document.querySelector(`.file-item[data-file="initial_contract.h"]`)?.classList.add('active');
                return;
            }
        }
        
        // If we get here, we need to create a new contract
        console.log('Creating new contract from content');
        // Just use a default name rather than prompting
        const fileName = 'my_contract.h';
        socket.emit('create-user-contract', { 
            fileName,
            initialContent: content
        });
    }

    // Function to create a new contract, optionally with initial content
    function createNewContract(initialContent = null) {
        if (!isLoggedIn) {
            showNotification('Please log in to create contracts', 'error');
            return;
        }
        
        // If initialContent is an event object, ignore it
        if (initialContent && typeof initialContent === 'object' && initialContent.target) {
            console.log('Received event object instead of content, ignoring:', initialContent);
            initialContent = null;
        }
        
        const fileName = prompt('Enter a name for the new contract file:');
        if (!fileName) return;
        
        // We'll let the server handle default content, just send a null if we don't have content
        socket.emit('create-user-contract', { 
            fileName,
            initialContent: typeof initialContent === 'string' ? initialContent : null
        });
    }

    // Function to submit the current contract
    function submitCurrentContract() {
        if (!isLoggedIn) {
            showNotification('Please log in to submit contracts', 'error');
            return;
        }
        
        // Use editor content regardless of whether a file is "selected"
        const content = editor.getValue();
        if (!content || content.trim().length === 0) {
            showNotification('No contract code to submit', 'error');
            return;
        }
        
        // If we have a current file, save it first
        if (currentFile) {
            socket.emit('save-user-contract', {
                fileName: currentFile,
                content
            });
        }
        
        // Display thinking in terminal
        if (terminal) {
            terminal.clear();
            terminal.write('Submitting contract to testnet...\r\n');
        }
        
        // Then submit
        socket.emit('submit-contract', {
            code: content
        });
    }

    // Event listeners
    saveFileBtn.addEventListener('click', saveCurrentContract);
    testContractBtn.addEventListener('click', testCurrentContract);
    submitContractBtn.addEventListener('click', submitCurrentContract);
    
    // Initial setup
    checkLoginStatus();
    
    // Load example contracts (if available)
    socket.emit('get-example-contracts');

    // Function to convert simple markdown to ANSI terminal formatting
    function simpleMarkdownToAnsi(markdown) {
        if (!markdown) return '';
        
        // Convert headers
        let formatted = markdown.replace(/^# (.+)$/gm, '\x1B[1;33m$1\x1B[0m')  // H1 - bold yellow
                                .replace(/^## (.+)$/gm, '\x1B[1;36m$1\x1B[0m')  // H2 - bold cyan
                                .replace(/^### (.+)$/gm, '\x1B[1;32m$1\x1B[0m'); // H3 - bold green
        
        // Convert lists
        formatted = formatted.replace(/^- (.+)$/gm, ' • $1');
        
        // Convert code blocks
        formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
            return '\x1B[2m' + match.replace(/```/g, '') + '\x1B[0m';
        });
        
        // Convert inline code
        formatted = formatted.replace(/`([^`]+)`/g, '\x1B[2m$1\x1B[0m');
        
        // Convert bold
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '\x1B[1m$1\x1B[0m');
        
        // Convert italic
        formatted = formatted.replace(/\*([^*]+)\*/g, '\x1B[3m$1\x1B[0m');
        
        return formatted;
    }

    // Add this function after the other functions
    function createLoginModal() {
        // Create login modal
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
                        <button id="submit-login-btn" class="submit-button">Login</button>
                        <button id="cancel-login-btn" class="cancel-button">Cancel</button>
                    </div>
                </div>
                
                <div class="modal-form" id="register-modal">
                    <div class="input-group">
                        <label for="register-username">Username:</label>
                        <input type="text" id="register-username" placeholder="Choose a username">
                    </div>
                    <div class="input-group">
                        <label for="register-password">Password:</label>
                        <input type="password" id="register-password" placeholder="Choose a password">
                    </div>
                    <div class="login-error" id="modal-register-error"></div>
                    <div class="button-group">
                        <button id="submit-register-btn" class="submit-button">Register</button>
                        <button id="cancel-register-btn" class="cancel-button">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add styles for the modal
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
                background-color: var(--bg-color);
                padding: 25px;
                border-radius: 5px;
                width: 350px;
                position: relative;
                border: 1px solid var(--border-color);
            }
            
            .modal-tabs {
                display: flex;
                margin-bottom: 20px;
                border-bottom: 1px solid var(--border-color);
            }
            
            .modal-tab {
                padding: 8px 15px;
                background: none;
                border: none;
                color: var(--text-color);
                cursor: pointer;
                opacity: 0.7;
                font-size: 14px;
            }
            
            .modal-tab.active {
                opacity: 1;
                font-weight: bold;
                border-bottom: 2px solid var(--primary-color);
            }
            
            .modal-form {
                display: none;
            }
            
            .modal-form.active {
                display: block;
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
                border: 1px solid #555;
                color: var(--text-color);
                border-radius: 3px;
            }
            
            .button-group {
                display: flex;
                justify-content: space-between;
                margin-top: 20px;
            }
            
            .button-group button {
                padding: 8px 15px;
                border-radius: 3px;
                cursor: pointer;
            }
            
            .submit-button {
                background-color: var(--primary-color);
                color: white;
                border: none;
            }
            
            .cancel-button {
                background-color: transparent;
                border: 1px solid #555;
                color: var(--text-color);
            }
            
            .login-error {
                color: #dc3545;
                margin-top: 10px;
                font-size: 14px;
            }
        `;
        document.head.appendChild(modalStyle);
        
        // Handle tab switching
        const tabs = document.querySelectorAll('.modal-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                console.log('Tab clicked:', tab.getAttribute('data-tab'));
                
                // Remove active class from all tabs
                tabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                tab.classList.add('active');
                
                // Hide all forms
                const forms = document.querySelectorAll('.modal-form');
                forms.forEach(form => {
                    form.style.display = 'none';
                    form.classList.remove('active');
                });
                
                // Show the form corresponding to the clicked tab
                const tabId = tab.getAttribute('data-tab');
                const targetForm = document.getElementById(tabId);
                if (targetForm) {
                    targetForm.style.display = 'block';
                    targetForm.classList.add('active');
                    console.log('Activated form:', tabId);
                } else {
                    console.error('Could not find form with ID:', tabId);
                }
            });
        });
        
        // Handle login form submission
        document.getElementById('submit-login-btn').addEventListener('click', () => {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value.trim();
            
            if (!username || !password) {
                document.getElementById('modal-login-error').textContent = 'Please enter both username and password';
                return;
            }
            
            socket.emit('login', { username, password });
        });
        
        // Handle register form submission
        document.getElementById('submit-register-btn').addEventListener('click', () => {
            const username = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value.trim();
            
            if (!username || !password) {
                document.getElementById('modal-register-error').textContent = 'Please enter both username and password';
                return;
            }
            
            socket.emit('register', { username, password });
        });
        
        // Handle cancel buttons
        document.getElementById('cancel-login-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            document.head.removeChild(modalStyle);
        });
        
        document.getElementById('cancel-register-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            document.head.removeChild(modalStyle);
        });
        
        // Handle login result
        socket.on('login-error', (data) => {
            document.getElementById('modal-login-error').textContent = data.error;
        });
        
        socket.on('register-error', (data) => {
            document.getElementById('modal-register-error').textContent = data.error;
        });
        
        socket.on('login-success', (data) => {
            document.body.removeChild(modal);
            document.head.removeChild(modalStyle);
            isLoggedIn = true;
            userId = data.userId;
            updateLoginButton();
            showNotification('Logged in successfully', 'success');
            
            // Get user's contracts
            socket.emit('get-user-contracts');
        });
        
        socket.on('register-success', (data) => {
            // Update the modal to show success and login form
            modal.querySelector('.modal-content').innerHTML = `
                <h3>Registration Successful</h3>
                <p>Your account has been created successfully. You can now log in.</p>
                <div class="input-group">
                    <label for="login-username">Username:</label>
                    <input type="text" id="login-username" value="${data.username}" readonly>
                </div>
                <div class="input-group">
                    <label for="login-password">Password:</label>
                    <input type="password" id="login-password" placeholder="Enter your password">
                </div>
                <div class="login-error" id="modal-login-error"></div>
                <div class="button-group">
                    <button id="submit-login-btn" class="submit-button">Login</button>
                    <button id="cancel-login-btn" class="cancel-button">Cancel</button>
                </div>
            `;
            
            // Re-attach event listeners
            document.getElementById('submit-login-btn').addEventListener('click', () => {
                const username = document.getElementById('login-username').value.trim();
                const password = document.getElementById('login-password').value.trim();
                
                if (!username || !password) {
                    document.getElementById('modal-login-error').textContent = 'Please enter both username and password';
                    return;
                }
                
                socket.emit('login', { username, password });
            });
            
            document.getElementById('cancel-login-btn').addEventListener('click', () => {
                document.body.removeChild(modal);
                document.head.removeChild(modalStyle);
            });
        });
    }

    // Initialize modal functionality
    const messageModal = document.getElementById('message-modal');
    const modalClose = document.getElementById('modal-close');
    const modalContent = document.getElementById('modal-conversation-content');
    const expandConversationBtn = document.getElementById('expand-conversation');
    
    modalClose.addEventListener('click', () => {
        messageModal.classList.remove('show');
    });
    
    expandConversationBtn.addEventListener('click', () => {
        openConversationModal();
    });
    
    function openConversationModal() {
        // Clone the AI messages container to show in the modal
        const aiMessagesClone = aiMessages.cloneNode(true);
        
        // Clear previous content and add the cloned messages
        modalContent.innerHTML = '';
        modalContent.appendChild(aiMessagesClone);
        
        // Show the modal
        messageModal.classList.add('show');
    }
    
    // Close modal when clicking outside content
    messageModal.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            messageModal.classList.remove('show');
        }
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && messageModal.classList.contains('show')) {
            messageModal.classList.remove('show');
        }
    });
}); 