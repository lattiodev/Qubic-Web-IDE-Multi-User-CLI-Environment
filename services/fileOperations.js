const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to recursively get all files in a directory
function getAllFiles(dir, fileList = [], baseDir) {
    if (!baseDir) baseDir = dir;
    
    try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                getAllFiles(filePath, fileList, baseDir);
            } else {
                // Only include relevant file types
                const ext = path.extname(filePath).toLowerCase();
                if (['.cpp', '.h', '.txt', '.json', '.c', '.hpp'].includes(ext)) {
                    fileList.push(path.relative(baseDir, filePath).replace(/\\/g, '/'));
                }
            }
        });
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error);
    }
    
    return fileList;
}

// Helper function to copy directory recursively
function copyDirectoryRecursive(source, destination) {
    const files = fs.readdirSync(source);
    
    files.forEach(file => {
        const sourcePath = path.join(source, file);
        const destPath = path.join(destination, file);
        
        if (fs.statSync(sourcePath).isDirectory()) {
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            copyDirectoryRecursive(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    });
}

// Function to create a user project
function createUserProject(userId, PROJECTS_DIR, SOURCE_DIR) {
    const projectDir = path.join(PROJECTS_DIR, userId);
    
    // Create project directory if it doesn't exist
    if (!fs.existsSync(projectDir)) {
        console.log(`Creating project directory for user ${userId}`);
        fs.mkdirSync(projectDir, { recursive: true });
        
        // Copy cli-commands folder to user project
        const cliCommandsDir = path.join(projectDir, 'cli-commands');
        fs.mkdirSync(cliCommandsDir, { recursive: true });
        
        // Copy all files from SOURCE_DIR to user's cli-commands directory
        copyDirectoryRecursive(SOURCE_DIR, cliCommandsDir);
    }
    
    return projectDir;
}

// Function to get all files in a user's project
function getUserProjectFiles(userId, PROJECTS_DIR, SOURCE_DIR) {
    const projectDir = path.join(PROJECTS_DIR, userId, 'cli-commands');
    console.log(`Getting files from user project directory: ${projectDir}`);
    
    if (!fs.existsSync(projectDir)) {
        console.log(`Project directory does not exist, creating it: ${projectDir}`);
        fs.mkdirSync(projectDir, { recursive: true });
        // Copy cli-commands folder to user project if it doesn't exist
        copyDirectoryRecursive(SOURCE_DIR, projectDir);
    }
    
    return getAllFiles(projectDir, [], projectDir);
}

// Function to save a single file
function saveFile(userId, filePath, content, PROJECTS_DIR) {
    console.log(`Saving file for user ${userId}, path: ${filePath}`);
    
    // Ensure the path is relative to the cli-commands directory
    const relativePath = filePath.replace(/^\/+/, ''); // Remove leading slashes
    const fullPath = path.join(PROJECTS_DIR, userId, 'cli-commands', relativePath);
    
    console.log(`Saving file to: ${fullPath}`);
    
    // Validate the path is within the user's project directory for security
    const cliCommandsDir = path.join(PROJECTS_DIR, userId, 'cli-commands');
    if (!fullPath.startsWith(cliCommandsDir)) {
        console.log(`Directory traversal attempt: ${fullPath}`);
        throw new Error('Invalid file path - attempted directory traversal');
    }
    
    // Ensure the directory exists
    const dirPath = path.dirname(fullPath);
    
    if (!fs.existsSync(dirPath)) {
        console.log(`Creating directory: ${dirPath}`);
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Write the file
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`File saved successfully: ${fullPath}`);
    
    return relativePath;
}

// Function to get file content
function getFileContent(userId, filePath, PROJECTS_DIR, SOURCE_DIR) {
    let fullPath;
    
    if (userId) {
        // Logged in user - get from their project
        fullPath = path.join(PROJECTS_DIR, userId, 'cli-commands', filePath);
        
        // Validate the path for security
        if (!fullPath.startsWith(path.join(PROJECTS_DIR, userId, 'cli-commands'))) {
            throw new Error('Invalid file path');
        }
    } else {
        // Not logged in - get from source directory
        fullPath = path.join(SOURCE_DIR, filePath);
        
        // Security check to prevent directory traversal
        if (!fullPath.startsWith(SOURCE_DIR)) {
            throw new Error('Invalid file path');
        }
    }
    
    console.log(`Attempting to read file: ${fullPath}`);
    
    if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
    } else {
        console.log(`File not found: ${fullPath}`);
        throw new Error(`File not found: ${filePath}`);
    }
}

// Function to create a new file
function createFile(userId, filePath, PROJECTS_DIR) {
    // Normalize the file path
    const relativePath = filePath.replace(/^\/+/, ''); // Remove leading slashes
    const fullPath = path.join(PROJECTS_DIR, userId, 'cli-commands', relativePath);
    
    // Validate the path is within the user's project directory for security
    const cliCommandsDir = path.join(PROJECTS_DIR, userId, 'cli-commands');
    if (!fullPath.startsWith(cliCommandsDir)) {
        throw new Error('Invalid file path - attempted directory traversal');
    }
    
    // Validate file extension
    const ext = path.extname(fullPath).toLowerCase();
    if (ext !== '.cpp' && ext !== '.h') {
        throw new Error('Only .cpp and .h files are allowed');
    }
    
    // Ensure the directory exists
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Create empty file if it doesn't exist
    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, '', 'utf8');
        console.log(`Created new file: ${fullPath}`);
        return true;
    } else {
        console.log(`File already exists: ${fullPath}`);
        return false;
    }
}

// Function to reset a project
function resetProject(userId, PROJECTS_DIR, SOURCE_DIR) {
    console.log(`Resetting project for user: ${userId}`);
    console.log(`PROJECTS_DIR: ${PROJECTS_DIR}`);
    console.log(`SOURCE_DIR: ${SOURCE_DIR}`);
    
    // Reset project files
    const cliCommandsDir = path.join(PROJECTS_DIR, userId, 'cli-commands');
    
    // If the directory exists, remove it and all its contents
    if (fs.existsSync(cliCommandsDir)) {
        console.log(`Removing existing cli-commands directory: ${cliCommandsDir}`);
        fs.rmSync(cliCommandsDir, { recursive: true, force: true });
    }
    
    // Create a new directory and copy the template files
    console.log(`Creating fresh cli-commands directory and copying template files`);
    fs.mkdirSync(cliCommandsDir, { recursive: true });
    copyDirectoryRecursive(SOURCE_DIR, cliCommandsDir);
    
    console.log(`Project reset complete for user: ${userId}`);
    return getUserProjectFiles(userId, PROJECTS_DIR, SOURCE_DIR);
}

function compileUserProject(userId, PROJECTS_DIR) {
    const projectDir = path.join(PROJECTS_DIR, userId, 'cli-commands');
    
    // Make sure directory exists before trying to use it
    if (!fs.existsSync(projectDir)) {
        console.error(`Project directory does not exist: ${projectDir}`);
        return Promise.reject(new Error(`Project directory not found: ${projectDir}`));
    }

    // Verify the directory is readable
    try {
        fs.accessSync(projectDir, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
        console.error(`Cannot access project directory: ${projectDir}`, error);
        return Promise.reject(new Error(`Cannot access project directory: ${error.message}`));
    }
    
    // Create build directory with proper permissions
    const buildDir = path.join(projectDir, 'build_docker');
    
    // Remove old build directory if it exists
    if (fs.existsSync(buildDir)) {
        try {
            fs.rmSync(buildDir, { recursive: true, force: true });
        } catch (error) {
            console.error(`Error removing old build directory: ${error}`);
        }
    }
    
    // Create fresh build directory with proper permissions
    try {
        fs.mkdirSync(buildDir, { recursive: true, mode: 0o777 });
    } catch (error) {
        console.error(`Error creating build directory: ${error}`);
        return Promise.reject(new Error(`Failed to create build directory: ${error.message}`));
    }
    
    // Collect all output
    let errorOutput = '';
    let stdOutput = '';

    // Make sure we have required packages installed first
    const setupCmd = `apt-get update && apt-get install -y build-essential cmake g++ || true`;
    
    // Then run the actual build command with more explicit error handling
    const buildCmd = `cd "${projectDir}" && \
        cmake -S "${projectDir}" -B "${buildDir}" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="${buildDir}/redist" && \
        cmake --build "${buildDir}" --target install`;

    // Return a promise for the full build process
    return new Promise((resolve, reject) => {
        console.log(`Setting up build environment for user ${userId}...`);
        
        // First run the setup command to install necessary packages
        const setupProcess = require('child_process').exec(setupCmd, { maxBuffer: 1024 * 1024 * 10 });
        
        setupProcess.stdout.on('data', (data) => {
            console.log(`[Setup ${userId}]: ${data.toString()}`);
        });
        
        setupProcess.stderr.on('data', (data) => {
            console.error(`[Setup Error ${userId}]: ${data.toString()}`);
        });
        
        setupProcess.on('close', (setupCode) => {
            console.log(`Setup completed with code ${setupCode}, starting build...`);
            
            // Now run the actual build command
            const childProcess = require('child_process').exec(
                buildCmd, 
                { 
                    maxBuffer: 1024 * 1024 * 10,
                    cwd: projectDir  // Explicitly set working directory
                }
            );
            
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdOutput += output;
                console.log(`[Compile ${userId}]: ${output}`);
            });
            
            childProcess.stderr.on('data', (data) => {
                const output = data.toString();
                errorOutput += output;
                console.error(`[Compile Error ${userId}]: ${output}`);
            });
            
            childProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`Compiled user project successfully: ${projectDir}`);
                    resolve({success: true, output: stdOutput});
                } else {
                    const errorMsg = `Compilation failed with exit code ${code}: ${errorOutput}`;
                    console.error(`Error compiling user project: ${errorMsg}`);
                    reject(new Error(errorMsg));
                }
            });
        });
    });
}

module.exports = {
    getAllFiles,
    copyDirectoryRecursive,
    createUserProject,
    getUserProjectFiles,
    saveFile,
    getFileContent,
    createFile,
    resetProject,
    compileUserProject
};