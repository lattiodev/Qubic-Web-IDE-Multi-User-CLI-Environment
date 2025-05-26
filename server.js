const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');
const fileOps = require('./services/fileOperations');
const smartOps = require('./services/smartOperations');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add this middleware after creating the app
app.use(cookieParser());

// Configure smart contract routes
smartOps.configureRoutes(app, __dirname);

// Container reference
let containerProcess = null;
let containerId = null;

// Define the source code directory to point to the cli-commands folder
const SOURCE_DIR = path.join(__dirname, 'cli-commands');

// Create the directory if it doesn't exist
if (!fs.existsSync(SOURCE_DIR)) {
    console.log(`Creating source directory at: ${SOURCE_DIR}`);
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
}

// Log the actual path for debugging
console.log(`Source directory path: ${SOURCE_DIR}`);

// Create projects directory if it doesn't exist
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
    console.log(`Creating projects directory at: ${PROJECTS_DIR}`);
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Store user sessions
const userSessions = new Map();

// Define users file path
const USERS_FILE = path.join(__dirname, 'users.json');

// Function to read users from file
function readUsers() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = fs.readFileSync(USERS_FILE, 'utf8');
            return JSON.parse(data);
        }
        // If file doesn't exist, create it with empty users object
        fs.writeFileSync(USERS_FILE, JSON.stringify({}));
        return {};
    } catch (error) {
        console.error('Error reading users file:', error);
        return {};
    }
}

// Function to write users to file
function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing users file:', error);
        return false;
    }
}

// Function to create a user project
function createUserProject(userId) {
    return fileOps.createUserProject(userId, PROJECTS_DIR, SOURCE_DIR);
}

// Function to get all files in a user's project
function getUserProjectFiles(userId) {
    return fileOps.getUserProjectFiles(userId, PROJECTS_DIR, SOURCE_DIR);
}

// Add OpenAI integration
const openai = new OpenAI({
});

// Assistant ID
const ASSISTANT_ID = 'asst_m7lG2GdsPJKQLOcdiDInUGeM';

// Store threads by socket ID
const threadStore = new Map();

// Maintain a list of active compilations to prevent duplicates
const activeCompilations = new Map();

// Track recent commands to prevent duplication
const recentCommands = new Map();

// Track container timeouts to ensure proper cleanup
const containerTimeouts = new Map();

// Add message deduplication for common errors
const socketMessages = new Map();

io.on('connection', (socket) => {
    console.log('Client connected');
    
    // Check for cookie auth
    const cookies = socket.handshake.headers.cookie;
    if (cookies) {
        const cookieArr = cookies.split(';');
        let userId = null;
        
        for (let cookie of cookieArr) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'qubicUserId') {
                userId = value;
                break;
            }
        }
        
        if (userId) {
            console.log(`User authenticated via cookie: ${userId}`);
            socket.userId = userId;
            
            // Send success response
            socket.emit('login-success', { 
                userId,
                message: `Logged in as ${userId}. Your project is ready.`
            });
            
            // Also send to terminal
            socket.emit('terminal-output', `Logged in as ${userId}. Your project is ready.\n`);
            
            // Get user's file list
            const files = getUserProjectFiles(userId);
            socket.emit('file-list', files);
        }
    }
    
    socket.emit('terminal-output', 'Connected to server. Ready to compile and run commands.\n');

    // Configure smart contract socket events
    smartOps.configureSocketEvents(io, socket, __dirname, openai);

    // Handle login
    socket.on('login', async (userData) => {
        console.log('Login data received:', userData);
        if (!userData || !userData.username || !userData.password) {
            console.log('Invalid login data');
            socket.emit('login-error', { error: 'Username and password are required' });
            return;
        }
        
        const users = readUsers();
        const userId = userData.username;
        
        // Check if user exists
        if (!users[userId]) {
            console.log('User not found:', userId);
            socket.emit('login-error', { error: 'Invalid username or password' });
            return;
        }
        
        // Verify password
        try {
            const isMatch = await bcrypt.compare(userData.password, users[userId].passwordHash);
            if (!isMatch) {
                console.log('Invalid password for user:', userId);
                socket.emit('login-error', { error: 'Invalid password' });
                return;
            }
            
            // Set user ID on socket
            socket.userId = userId;
            
            // Get/create user's project directory
            let projectDir = '';
            if (userSessions.has(userId)) {
                projectDir = userSessions.get(userId).projectDir;
            } else {
                projectDir = createUserProject(userId);
                console.log(`Created project directory for login: ${projectDir}`);
                
                // Set up user session
                userSessions.set(userId, {
                    projectDir
                });
            }
            
            // Send success response
            socket.emit('login-success', { 
                userId,
                message: `Logged in as ${userId}. Your project is ready.`
            });
            
            // Also send to terminal
            socket.emit('terminal-output', `Logged in as ${userId}. Your project is ready.\n`);
            
            // Get user's file list
            const files = getUserProjectFiles(userId);
            socket.emit('file-list', files);
        } catch (error) {
            console.error('Error during login:', error);
            socket.emit('login-error', { error: 'Login failed' });
        }
    });

    // Replace the register handler
    socket.on('register', async (userData) => {
        console.log('Registration data received:', userData.username);
        if (!userData || !userData.username || !userData.password) {
            console.log('Invalid registration data');
            socket.emit('register-error', { error: 'Username and password are required' });
            return;
        }
        
        const users = readUsers();
        const userId = userData.username;
        
        // Check if user already exists
        if (users[userId]) {
            console.log('User already exists:', userId);
            socket.emit('register-error', { error: 'Username already taken' });
            return;
        }
        
        // Hash the password
        try {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(userData.password, salt);
            
            // Store user
            users[userId] = {
                passwordHash,
                created: new Date().toISOString()
            };
            
            if (writeUsers(users)) {
                console.log('User registered successfully:', userId);
                
                // Create user project
                const projectDir = createUserProject(userId);
                console.log('Created project directory:', projectDir);
                
                // Don't auto-login - just notify success and let them login manually
                socket.emit('register-success', { 
                    username: userId,
                    message: 'Account created successfully! Please log in with your credentials.'
                });
            } else {
                socket.emit('register-error', { error: 'Error creating user account' });
            }
        } catch (error) {
            console.error('Error during registration:', error);
            socket.emit('register-error', { error: 'Registration failed: ' + error.message });
        }
    });

    // Reset project
    socket.on('reset-project', () => {
        if (!socket.userId) {
            sendTerminalOutput(socket, 'Error: You must be logged in to reset your project.\n');
            return;
        }
        
        try {
            // Create a new default project for the user
            const files = fileOps.resetProject(socket.userId, PROJECTS_DIR, SOURCE_DIR);
            
            // Send the file list back to the client
            socket.emit('file-list', files);
            
            // Confirm reset in terminal
            socket.emit('terminal-output', 'Project has been reset to default state. You can now compile and run commands.\n');
            
        } catch (error) {
            console.error(`Reset project error: ${error.message}`);
            sendTerminalOutput(socket, `Error resetting project: ${error.message}\n`);
        }
    });

    // Handle compile-docker events
    socket.on('compile-docker', async (projectId) => {
        if (!socket.userId) {
            sendTerminalOutput(socket, 'Error: You must be logged in to compile.\n');
            return;
        }

        const userId = socket.userId;
        const compileKey = `${userId}-${projectId || userId}`;
        
        // Check if compilation is already in progress
        if (activeCompilations.has(compileKey)) {
            socket.emit('terminal-output', 'Compilation already in progress, please wait...\n');
            return;
        }
        
        // Mark compilation as active
        activeCompilations.set(compileKey, Date.now());
        
        try {
            console.log(`Received compile-docker request for project: ${projectId}`);
            socket.emit('terminal-output', 'Compilation started...\n');
            
            // First compile the project with detailed output to terminal
            try {
                const projectDir = path.join(PROJECTS_DIR, userId);
                const srcDir = path.join(projectDir, 'cli-commands');
                const buildDir = path.join(srcDir, 'build_docker');
                
                // Clean the build directory if it exists
                socket.emit('terminal-output', 'Cleaning previous build directory...\n');
                const rmCommand = `rm -rf ${buildDir}`;
                
                const rmProcess = spawn('bash', ['-c', rmCommand]);
                
                rmProcess.stdout.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                rmProcess.stderr.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                await new Promise(resolve => rmProcess.on('close', resolve));
                
                // Show directory structure for debugging
                const lsCommand = `ls -la ${srcDir}`;
                socket.emit('terminal-output', `Checking source files...\n`);
                const lsProcess = spawn('bash', ['-c', lsCommand]);
                
                lsProcess.stdout.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                lsProcess.stderr.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                await new Promise(resolve => lsProcess.on('close', resolve));
                
                // Run the actual compilation with CMake
                socket.emit('terminal-output', `\nStarting compilation with CMake...\n`);
                
                // Create build directory
                const mkdirProcess = spawn('mkdir', ['-p', buildDir]);
                await new Promise(resolve => mkdirProcess.on('close', resolve));
                
                // Run CMake
                const cmakeProcess = spawn('cmake', [
                    '-S', srcDir,
                    '-B', buildDir,
                    '-DCMAKE_BUILD_TYPE=Release'
                ]);
                
                cmakeProcess.stdout.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                cmakeProcess.stderr.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                const cmakeResult = await new Promise(resolve => {
                    cmakeProcess.on('close', code => resolve(code));
                });
                
                if (cmakeResult !== 0) {
                    throw new Error(`CMake configuration failed with code ${cmakeResult}`);
                }
                
                // Run make
                socket.emit('terminal-output', `\nRunning make...\n`);
                const makeProcess = spawn('make', [
                    '-C', buildDir,
                    '-j4'  // Use parallel compilation
                ]);
                
                makeProcess.stdout.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                makeProcess.stderr.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                const makeResult = await new Promise(resolve => {
                    makeProcess.on('close', code => resolve(code));
                });
                
                if (makeResult !== 0) {
                    throw new Error(`Make failed with code ${makeResult}`);
                }
                
                // Check if the qubic-cli executable was created
                const checkExecProcess = spawn('ls', ['-la', path.join(buildDir, 'qubic-cli')]);
                let checkOutput = '';
                
                checkExecProcess.stdout.on('data', (data) => {
                    checkOutput += data.toString();
                    socket.emit('terminal-output', data.toString());
                });
                
                checkExecProcess.stderr.on('data', (data) => {
                    socket.emit('terminal-output', data.toString());
                });
                
                const checkResult = await new Promise(resolve => {
                    checkExecProcess.on('close', code => resolve(code));
                });
                
                if (checkResult !== 0) {
                    socket.emit('terminal-output', 'Warning: qubic-cli executable not found in build directory.\n');
                }
                
                socket.emit('terminal-output', 'Compilation completed successfully.\n');
                
            } catch (error) {
                socket.emit('terminal-output', `Compilation failed: ${error.message}\n`);
                throw error; // Re-throw to skip Docker build
            }
            
            // After successful compilation, proceed with Docker build
            const projectDir = path.join(__dirname, 'projects', compileKey.split('-')[1]);
            const dockerfilePath = path.join(projectDir, 'cli-commands', 'Dockerfile');
            
            // Check if the Dockerfile exists
            if (!fs.existsSync(dockerfilePath)) {
                socket.emit('terminal-output', `Error: Dockerfile not found for project ${compileKey.split('-')[1]}.\n`);
                return;
            }
            
            // Proceed with Docker build
            const buildProcess = spawn('docker', [
                'build',
                '-t', `qubic-cli-${compileKey.split('-')[0]}-${compileKey.split('-')[1]}`,
                '-f', dockerfilePath,
                projectDir
            ]);
            
            buildProcess.stdout.on('data', (data) => {
                socket.emit('terminal-output', data.toString());
            });
            
            buildProcess.stderr.on('data', (data) => {
                socket.emit('terminal-output', data.toString());
            });
            
            buildProcess.on('close', (code) => {
                if (code === 0) {
                    socket.emit('terminal-output', 'Docker image built successfully.\n');
                    socket.compilationFailed = false;
                    startContainerSafely(socket, projectDir, compileKey.split('-')[1]);
                } else {
                    socket.compilationFailed = true;
                    socket.emit('terminal-output', `Error building Docker image, exited with code ${code}\n`);
                }
                
                // Signal compilation completion to the client
                socket.emit('compile-complete', {
                    success: code === 0,
                    message: code === 0 ? 'Compilation succeeded' : 'Compilation failed'
                });
            });
            
        } catch (error) {
            console.error('Error during compilation:', error);
            socket.compilationFailed = true;
            socket.emit('terminal-output', `Compilation error: ${error.message}\n`);
            socket.emit('compile-complete', {
                success: false,
                message: `Compilation failed: ${error.message}`
            });
        } finally {
            // Remove from active compilations when done
            activeCompilations.delete(compileKey);
        }
    });

    async function startContainerSafely(socket, projectDir, projectId) {
        return new Promise((resolve, reject) => {
            // Existing container start logic
            startContainer(socket, projectDir, projectId);
            
            // Resolve after a slight delay to avoid double starts
            setTimeout(resolve, 1000);
        });
    }

    // Add message deduplication for common errors
    function sendTerminalOutput(socket, message) {
        const userId = socket.userId || 'unknown';
        const messageKey = `${userId}-${message}`;
        const now = Date.now();
        
        // Only deduplicate certain common messages
        if (message.includes('Docker container is not running') || 
            message.includes('You must be logged in')) {
            
            const lastTime = socketMessages.get(messageKey);
            if (lastTime && now - lastTime < 3000) { // Within 3 seconds
                console.log(`Avoiding duplicate message to user ${userId}: ${message}`);
                return; // Skip duplicate message
            }
            socketMessages.set(messageKey, now);
            
            // Clean up old messages
            if (socketMessages.size > 100) {
                const expired = now - 10000; // 10 seconds
                for (const [key, time] of socketMessages.entries()) {
                    if (time < expired) {
                        socketMessages.delete(key);
                    }
                }
            }
        }
        
        // Send the message to the client
        socket.emit('terminal-output', message);
    }

    // Modify the run-command handler to prevent command duplication
    socket.on('run-command', (command) => {
        if (!socket.userId) {
            sendTerminalOutput(socket, 'Error: You must be logged in to run commands.\n');
            return;
        }
        
        if (!socket.containerName) {
            // Check if there's an active or failed compilation
            const compileKey = `${socket.userId}-${socket.userId}`;
            if (activeCompilations.has(compileKey)) {
                sendTerminalOutput(socket, 'Compilation in progress. Please wait for it to complete.\n');
            } else {
                // Check if there's a record of failed compilation
                if (socket.compilationFailed) {
                    sendTerminalOutput(socket, 'Error: Previous compilation failed. Please fix errors and compile again.\n');
                } else {
                    sendTerminalOutput(socket, 'Error: Docker container is not running. Please compile and start Docker first.\n');
                }
            }
            return;
        }
        
        // Generate a unique command ID
        const commandId = `${socket.userId}-${Date.now()}`;
        
        // Check for duplicate command (prevent double execution)
        const commandKey = `${socket.userId}-${command}`;
        const now = Date.now();
        if (recentCommands.has(commandKey)) {
            const lastTime = recentCommands.get(commandKey);
            if (now - lastTime < 1000) { // Within 1 second
                console.log(`Ignoring duplicate command: ${command}`);
                return; // Skip duplicate command execution
            }
        }
        recentCommands.set(commandKey, now);
        
        // Clean up old commands (every 100 commands)
        if (recentCommands.size > 100) {
            const expired = now - 10000; // 10 seconds
            for (const [key, time] of recentCommands.entries()) {
                if (time < expired) {
                    recentCommands.delete(key);
                }
            }
        }
        
        console.log(`Running command in container ${socket.containerName}: ${command}`);
        
        // For qubic-cli commands, use a path based on the user's project structure
        if (command.includes('qubic-cli') || command.includes('./qubic-cli')) {
            // Get the correct path based on the user's project structure
            const simpleCommand = `
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
                    find /app/project -name "qubic-cli" -type f
                fi
            `;
            
            runCommandInContainer(socket, simpleCommand, commandId);
        } else {
            // For other commands, execute directly but preserve working directory if set
            if (socket.workingDir) {
                runCommandInContainer(socket, `cd ${socket.workingDir} && ${command}`, commandId);
            } else {
                runCommandInContainer(socket, command, commandId);
            }
        }
    });

    // Update startContainer to handle undefined projectId
    function startContainer(socket, projectDir, projectId) {
        if (!socket.userId) {
            socket.emit('terminal-output', 'Error: You must be logged in to start a container.\n');
            return;
        }
        
        const userId = socket.userId;
        const actualProjectId = projectId || userId;
        const containerName = `qubic-cli-container-${userId}-${actualProjectId}`;
        const imageName = `qubic-cli-${userId}-${actualProjectId}`;
        
        // Force remove any existing container with this name
        console.log(`Checking for existing container: ${containerName}`);
        
        // Use docker rm -f to forcefully remove container even if it's running
        const removeProcess = spawn('docker', ['rm', '-f', containerName]);
        
        removeProcess.on('close', (code) => {
            console.log(`Container removal process exited with code ${code}`);
            
            // Verify image exists before starting container
            console.log(`Checking for image: ${imageName}`);
            const checkImageProcess = spawn('docker', ['image', 'inspect', imageName]);
            
            let checkError = '';
            checkImageProcess.stderr.on('data', (data) => {
                checkError += data.toString();
            });
            
            checkImageProcess.on('close', (checkCode) => {
                if (checkCode !== 0) {
                    console.error(`Image ${imageName} not found: ${checkError}`);
                    socket.emit('terminal-output', `Error: Docker image not found. Please compile again.\n`);
                    return;
                }
                
                // Start a new container with proper configuration
                console.log(`Starting new container with name: ${containerName}`);
                
                // Fix the docker run command with proper parameters
                const runProcess = spawn('docker', [
                    'run',
                    '-d',  // Run in detached mode
                    '--name', containerName,
                    '-v', `${projectDir}:/app/project`,  // Mount project directory
                    '-w', '/app/project',  // Set initial working directory
                    imageName,
                    'bash', '-c', 'tail -f /dev/null'  // Simple command to keep container running
                ]);
                
                let containerStartError = '';
                
                runProcess.stderr.on('data', (data) => {
                    containerStartError += data.toString();
                    console.error(`Error starting container: ${data}`);
                });
                
                runProcess.on('close', (code) => {
                    if (code !== 0) {
                        socket.emit('terminal-output', `Error starting container, exited with code ${code}\n`);
                        if (containerStartError) {
                            socket.emit('terminal-output', `Error details: ${containerStartError}\n`);
                        }
                        return;
                    }
                    
                    // Store container name for later use
                    socket.containerName = containerName;
                    socket.emit('terminal-output', `Container started successfully. Will run for 20 minutes.\n`);
                    
                    // Set working directory to build_docker if it exists
                    const setWorkDirCommand = `
                        if [ -d "/app/project/cli-commands/build_docker" ] && [ -f "/app/project/cli-commands/build_docker/qubic-cli" ]; then
                            cd /app/project/cli-commands/build_docker
                            echo "Working directory set to /app/project/cli-commands/build_docker"
                            # Store this for future commands
                            echo "/app/project/cli-commands/build_docker" > /tmp/workdir
                            echo " ✅ Code has been compiled. You can start taking commands, e.g., ./qubic-cli -nodeip 45.152.160.22 -getcurrenttick"
                        elif [ -d "/app/project/contracts/build_docker" ] && [ -f "/app/project/contracts/build_docker/qubic-cli" ]; then
                            cd /app/project/contracts/build_docker
                            echo "Working directory set to /app/project/contracts/build_docker"
                            # Store this for future commands
                            echo "/app/project/contracts/build_docker" > /tmp/workdir
                            echo " ✅ Code has been compiled. You can start taking commands, e.g., ./qubic-cli -nodeip 45.152.160.22 -getcurrenttick"
                        elif [ -d "/app/project/build_docker" ] && [ -f "/app/project/build_docker/qubic-cli" ]; then
                            cd /app/project/build_docker
                            echo "Working directory set to /app/project/build_docker"
                            # Store this for future commands
                            echo "/app/project/build_docker" > /tmp/workdir
                            echo " ✅ Code has been compiled. You can start taking commands, e.g., ./qubic-cli -nodeip 45.152.160.22 -getcurrenttick"
                        else
                            # Look for qubic-cli
                            QUBIC_CLI_PATH=$(find /app/project -name "qubic-cli" -type f -executable | head -1)
                            if [ -n "$QUBIC_CLI_PATH" ]; then
                                QUBIC_CLI_DIR=$(dirname "$QUBIC_CLI_PATH")
                                cd "$QUBIC_CLI_DIR"
                                echo "Working directory set to $QUBIC_CLI_DIR"
                                echo "$QUBIC_CLI_DIR" > /tmp/workdir
                                echo " ✅ Found qubic-cli at $QUBIC_CLI_PATH. You can start taking commands, e.g., ./qubic-cli -nodeip 45.152.160.22 -getcurrenttick"
                            else
                                cd /app/project
                                echo "Working directory set to default: /app/project"
                                echo "/app/project" > /tmp/workdir
                            fi
                        fi
                        
                        # For debugging, list where qubic-cli is found
                        echo "Available qubic-cli executables:"
                        find /app/project -name "qubic-cli" -type f -executable | sort
                    `;
                    
                    const setWorkDirProcess = spawn('docker', [
                        'exec', 
                        containerName, 
                        'bash', 
                        '-c', 
                        setWorkDirCommand
                    ]);
                    
                    setWorkDirProcess.stdout.on('data', (data) => {
                        socket.emit('terminal-output', data.toString());
                        // Parse the output to extract the working directory if present
                        const output = data.toString();
                        if (output.includes('Working directory set to')) {
                            const match = output.match(/Working directory set to (.+?)(\n|$)/);
                            if (match && match[1]) {
                                const dir = match[1].trim();
                                console.log(`Setting working directory to: ${dir}`);
                                socket.workingDir = dir;
                            }
                        }
                    });

                 
                    // CRITICAL FIX: Use a more reliable way to implement container timeout
                    // Store the container timeout in a global map instead of just in the closure
                    if (containerTimeouts.has(containerName)) {
                        clearTimeout(containerTimeouts.get(containerName));
                    }
                    
                    console.log(`Setting timeout for container ${containerName} - will stop in 20 minutes`);
                    
                    // Set timeout to stop container after 20 minutes
                    const timeoutId = setTimeout(() => {
                        console.log(`Container ${containerName} timeout reached. Stopping...`);
                        
                        // Remove the timeout from the map
                        containerTimeouts.delete(containerName);
                        
                        // Stop and remove the container
                        const stopProcess = spawn('docker', ['rm', '-f', containerName]);
                        
                        stopProcess.on('close', (stopCode) => {
                            console.log(`Container ${containerName} stopped with code ${stopCode}`);
                            
                            if (socket.connected) {
                                socket.emit('terminal-output', `Container session expired after 20 minutes.\n`);
                                socket.emit('terminal-output', `Please compile again if you need more time.\n`);
                                socket.containerName = null;
                            }
                        });
                    }, 20 * 60 * 1000); // 20 minutes
                    
                    // Store the timeout ID for potential cancellation
                    containerTimeouts.set(containerName, timeoutId);
                });
            });
        });
    }

    // Updated runCommandInContainer with command ID tracking
    function runCommandInContainer(socket, command, commandId) {
        const execProcess = spawn('docker', [
            'exec',
            '-i',
            socket.containerName,
            'bash',
            '-c',
            command
        ]);
        
        execProcess.stdout.on('data', (data) => {
            socket.emit('terminal-output', data.toString());
        });
        
        execProcess.stderr.on('data', (data) => {
            socket.emit('terminal-output', data.toString());
        });
        
        execProcess.on('close', (code) => {
            if (code !== 0 && code !== undefined) {
                if (code === 255 && command.includes('45.152.160.22')) {
                    sendTerminalOutput(socket, `Network error: Could not connect to Qubic node.\n`);
                } else {
                    socket.emit('terminal-output', `Command exited with code ${code}\n`);
                }
            }
        });
    }

    // Handle file list request
    socket.on('get-file-list', () => {
        try {
            let files;
            if (socket.userId) {
                // Logged in user - get their project files
                files = fileOps.getUserProjectFiles(socket.userId, PROJECTS_DIR, SOURCE_DIR);
            } else {
                // Not logged in - show sample files from SOURCE_DIR
                files = fileOps.getAllFiles(SOURCE_DIR, [], SOURCE_DIR);
            }
            socket.emit('file-list', files);
        } catch (error) {
            console.error('Error getting file list:', error);
            socket.emit('terminal-output', `Error getting file list: ${error.message}\n`);
        }
    });
    
    // Handle file content request
    socket.on('get-file-content', (filePath) => {
        try {
            const content = fileOps.getFileContent(socket.userId, filePath, PROJECTS_DIR, SOURCE_DIR);
            socket.emit('file-content', { path: filePath, content });
        } catch (error) {
            console.error('Error getting file content:', error);
            socket.emit('terminal-output', `Error getting file content: ${error.message}\n`);
        }
    });
    
    // Handle file save
    socket.on('save-file', (data) => {
        console.log(`Received save-file request for path: ${data.path}`);
        console.log(`Content length: ${data.content ? data.content.length : 0} characters`);
        
        if (!socket.userId) {
            console.log(`User not logged in when trying to save file`);
            socket.emit('terminal-output', 'Error: You must be logged in to save files.\n');
            return;
        }
        
        try {
            const relativePath = fileOps.saveFile(socket.userId, data.path, data.content, PROJECTS_DIR);
            console.log(`File saved successfully: ${relativePath}`);
            socket.emit('file-saved', { path: data.path });
            socket.emit('terminal-output', `File saved: ${relativePath}\n`);
        } catch (error) {
            console.error(`Error saving file:`, error);
            socket.emit('terminal-output', `Error saving file: ${error.message}\n`);
        }
    });

    // Enhanced create-file handler
    socket.on('create-file', (filePath) => {
        if (!socket.userId) {
            socket.emit('terminal-output', 'Error: You must be logged in to create files.\n');
            return;
        }
        
        try {
            const created = fileOps.createFile(socket.userId, filePath, PROJECTS_DIR);
            
            if (created) {
                socket.emit('terminal-output', `Created new file: ${filePath}\n`);
                
                // Load the new file in the editor with a flag to indicate it should be opened
                socket.emit('file-content', { 
                    path: filePath, 
                    content: '',
                    openInEditor: true  // Add this flag to indicate it should be opened
                });
                
                // Update file list
                const files = fileOps.getUserProjectFiles(socket.userId, PROJECTS_DIR, SOURCE_DIR);
                socket.emit('file-list', files);
            } else {
                socket.emit('terminal-output', `File already exists: ${filePath}\n`);
                
                // Even if the file exists, still open it
                try {
                    const content = fileOps.getFileContent(socket.userId, filePath, PROJECTS_DIR, SOURCE_DIR);
                    socket.emit('file-content', { 
                        path: filePath, 
                        content,
                        openInEditor: true
                    });
                } catch (err) {
                    console.error(`Error reading existing file:`, err);
                }
            }
        } catch (error) {
            console.error(`Error creating file:`, error);
            socket.emit('terminal-output', `Error creating file: ${error.message}\n`);
        }
    });

    // Handle AI assistant messages for the main Terminal, not the smart contract assistant
    socket.on('ai-message', async (message) => {
        // Only ignore messages from smart contract page, properly handle CLI messages
        if (message && typeof message === 'object' && message.isFromSmartContractPage) {
            console.log(`Ignoring AI message from smart contract page - will be handled by smartOperations.js`);
            return; // Let smartOperations.js handle these
        }
        
        try {
            let threadId = threadStore.get(socket.id);
            
            // Create thread if it doesn't exist
            if (!threadId) {
                console.log('Creating new thread for socket', socket.id);
                const thread = await openai.beta.threads.create();
                threadId = thread.id;
                threadStore.set(socket.id, threadId);
                console.log(`Created thread ${threadId} for socket ${socket.id}`);
            }

            // Send user message to thread
            socket.emit('ai-response', { status: 'thinking', message: 'AI is thinking...' });
            
            // Ensure message is a string
            let messageContent;
            let assistantId;
            
            if (typeof message === 'object') {
                messageContent = message.message;
                assistantId = message.assistantId; // Get the assistant ID from the client
                
                // Include code if provided
                if (message.code && message.code.trim()) {
                    messageContent = `${messageContent}\n\nHere is my current code:\n\`\`\`cpp\n${message.code}\n\`\`\``;
                }
            } else {
                messageContent = message;
            }
            
            // Default to CLI assistant if none provided
            if (!assistantId) {
                assistantId = 'asst_m7lG2GdsPJKQLOcdiDInUGeM'; // CLI Assistant ID
            }
            
            console.log(`Processing CLI message with assistant: ${assistantId}`);

            // Add user message to thread
            await openai.beta.threads.messages.create(threadId, {
                role: 'user',
                content: messageContent
            });

            console.log(`Running assistant ${assistantId} on thread ${threadId}`);
            // Run the assistant
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            // Track run status
            console.log(`Initial run status: ${run.status}`);
            let runStatus = run.status;
            
            // Poll for completion
            while (runStatus === 'queued' || runStatus === 'in_progress') {
                console.log(`Waiting for completion... Current status: ${runStatus}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                try {
                    const runDetails = await openai.beta.threads.runs.retrieve(threadId, run.id);
                    runStatus = runDetails.status;
                } catch (error) {
                    console.error('Error retrieving run status:', error);
                    break;
                }
            }
            
            console.log(`Run completed with status: ${runStatus}`);
            
            if (runStatus === 'completed') {
                // Retrieve messages from the thread
                const messages = await openai.beta.threads.messages.list(threadId);
                
                // Find the latest assistant message (should be the first one in the list)
                const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
                
                if (assistantMessage) {
                    // Extract and send the content
                    const content = assistantMessage.content;
                    console.log(`Found latest assistant message: ${assistantMessage.id}`);
                    
                    // Parse the content
                    const textContent = content
                        .filter(item => item.type === 'text')
                        .map(item => item.text.value)
                        .join('\n');
                    
                    socket.emit('ai-response', { message: textContent });
                } else {
                    console.log('No assistant messages found');
                    socket.emit('ai-response', { error: 'No response from assistant' });
                }
            } else {
                console.error(`Run failed: ${JSON.stringify(run)}`);
                socket.emit('ai-response', { error: 'Assistant run failed. Please try again.' });
            }
        } catch (error) {
            console.error('Error with AI assistant:', error);
            console.error(error.stack);
            socket.emit('ai-response', { error: `Error processing your request: ${error.message}` });
        }
    });

    socket.on('logout', () => {
        console.log('User logging out:', socket.userId);
        
        // Clean up user session
        if (socket.userId) {
            socket.emit('terminal-output', `Logged out. Goodbye ${socket.userId}!\n`);
            socket.userId = null;
        }
    });

    // Add an auto-login handler
    socket.on('auto-login', (data) => {
        console.log(`Auto-login attempt with cookie: ${data.userId}`);
        if (!data.userId) {
            console.log('No user ID provided for auto-login');
            socket.emit('auto-login-error', { error: 'No user ID provided' });
            return;
        }
        
        const users = readUsers();
        const userId = data.userId;
        
        // Check if user exists
        if (!users[userId]) {
            console.log('User not found for auto-login:', userId);
            socket.emit('auto-login-error', { error: 'Invalid user' });
            return;
        }
        
        // Set user ID on socket
        socket.userId = userId;
        
        // Get/create user's project directory
        let projectDir = '';
        if (userSessions.has(userId)) {
            projectDir = userSessions.get(userId).projectDir;
        } else {
            projectDir = createUserProject(userId);
            console.log(`Created project directory for auto-login: ${projectDir}`);
            
            // Set up user session
            userSessions.set(userId, {
                projectDir
            });
        }
        
        // Send success response
        socket.emit('auto-login-success', { 
            userId,
            message: `Auto-logged in as ${userId}`
        });
        
        // Get user's file list
        const files = getUserProjectFiles(userId);
        socket.emit('file-list', files);
    });

    // Add an explicit handler for setting userId on the socket
    socket.on('set-user-id', (data) => {
        console.log(`Explicit set-user-id request received: ${data.userId}`);
        if (!data.userId) {
            console.log('No user ID provided for set-user-id');
            return;
        }
        
        const users = readUsers();
        const userId = data.userId;
        
        // Check if user exists
        if (!users[userId]) {
            console.log('User not found for set-user-id:', userId);
            return;
        }
        
        // Set user ID on socket
        socket.userId = userId;
        console.log(`User ID explicitly set on socket: ${userId}`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Client ${socket.id} disconnected. Reason: ${reason}`);
        if (socket.userId) {
            console.log(`User ${socket.userId} disconnected`);
        }
        
        // Clean up timeouts
        if (socket.containerTimeout) {
            clearTimeout(socket.containerTimeout);
        }
        if (socket.notificationTimeout) {
            clearTimeout(socket.notificationTimeout);
        }
        
        // Stop and remove container if it exists
        if (socket.containerName) {
            const stopProcess = spawn('docker', ['stop', socket.containerName]);
            stopProcess.on('close', () => {
                const rmProcess = spawn('docker', ['rm', socket.containerName]);
                rmProcess.on('close', () => {
                    console.log(`Cleaned up container ${socket.containerName}`);
                });
            });
        }
        
        // Clean up thread
        threadStore.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.on('error', (error) => {
  console.error('Server error:', error);
  // Attempt to restart the server if it crashes
  setTimeout(() => {
    try {
      server.close();
      server.listen(PORT, () => {
        console.log(`Server restarted and listening on port ${PORT}`);
      });
    } catch (e) {
      console.error('Failed to restart server:', e);
    }
  }, 5000);
});

// Add process-level error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Log but don't exit
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Log but don't exit
});

// Add a keep-alive mechanism
setInterval(() => {
  console.log('Server health check - still running');
}, 60000);

// Also add a cleanup function for the server to run periodically
// Add this at server startup, outside any socket connection

// Cleanup function to remove containers older than 20 minutes
function cleanupOldContainers() {
    console.log('Running container cleanup process');
    
    // Get a list of all containers
    const listProcess = spawn('docker', ['ps', '-a', '--format', '{{.Names}},{{.CreatedAt}}']);
    
    let output = '';
    listProcess.stdout.on('data', (data) => {
        output += data.toString();
    });
    
    listProcess.on('close', () => {
        const now = new Date();
        const lines = output.trim().split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            const [name, createdAtStr] = line.split(',');
            if (!name.startsWith('qubic-cli-container-')) continue;
            
            const createdAt = new Date(createdAtStr);
            const ageMinutes = (now - createdAt) / (60 * 1000);
            
            if (ageMinutes >= 20) {
                console.log(`Cleaning up old container ${name} (age: ${ageMinutes.toFixed(1)} minutes)`);
                spawn('docker', ['rm', '-f', name]);
            }
        }
    });
}

// Run cleanup every 5 minutes
setInterval(cleanupOldContainers, 5 * 60 * 1000);

// Also run cleanup on startup
cleanupOldContainers();

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
