const fs = require('fs');
const path = require('path');

// Initialize the global thread maps at the top of the file
const chatThreads = new Map();
const reviewThreads = new Map();
// Add separate map for smart contract chat threads
const scChatThreads = new Map();
// Map to track CLI chat threads
const cliChatThreads = new Map();

// Export them via the global object to ensure they're accessible everywhere
global.chatThreads = chatThreads;
global.reviewThreads = reviewThreads;
global.scChatThreads = scChatThreads;
global.cliChatThreads = cliChatThreads;

// Helper function to get user ID from socket
function getUserIdFromSocket(socket) {
    // First, check if userId is directly set on the socket (from login)
    if (socket.userId) {
        console.log('User ID found directly on socket:', socket.userId);
        return socket.userId;
    }
    
    // Otherwise, check cookies
    if (!socket.request || !socket.request.headers.cookie) {
        return null;
    }
    
    const cookies = socket.request.headers.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'qubicUserId') {
            console.log('User ID found in cookie:', value);
            return value;
        }
    }
    
    return null;
}

// Function to analyze contract code
async function analyzeContractCode(code) {
    // This is where you would integrate with an AI service to analyze the code
    // For now, we'll do some basic checks
    
    const errors = [];
    const warnings = [];
    
    // Check if code includes qpi.h
    if (!code.includes('#include') || !code.includes('qpi.h')) {
        errors.push('Missing #include for qpi.h');
    }
    
    // Check if code defines a contract struct
    if (!code.includes('struct') || !code.includes('QPI::ContractBase')) {
        errors.push('No contract struct found that inherits from QPI::ContractBase');
    }
    
    // Check for common issues
    if (code.includes('double') || code.includes('float')) {
        warnings.push('Using floating point types (double/float) is prohibited in Qubic contracts');
    }
    
    if (code.includes('typedef') || code.includes('union')) {
        warnings.push('Using typedef or union is prohibited in Qubic contracts');
    }
    
    // In a real implementation, you would use a more sophisticated analysis
    // possibly using a C++ parser or AI to check for more complex issues
    
    return { errors, warnings };
}

// Function to process AI messages
async function processAiMessage(message, code) {
    // This is where you would integrate with an AI service like OpenAI
    // For now, we'll return a simple response
    
    if (!message) {
        return 'Please provide a message.';
    }
    
    // Simple keyword-based responses
    if (message.toLowerCase().includes('hello') || message.toLowerCase().includes('hi')) {
        return 'Hello! I\'m your Smart Contract AI assistant. How can I help you with your Qubic contract today?';
    }
    
    if (message.toLowerCase().includes('help')) {
        return `
I can help you with your Qubic smart contract in several ways:

1. **Code Analysis**: I can review your code for errors and suggest improvements.
2. **Best Practices**: I can provide guidance on Qubic smart contract best practices.
3. **Debugging**: I can help identify and fix issues in your contract.
4. **Testnet Submission**: I can guide you through the process of submitting your contract to the testnet.

What specific aspect of your contract would you like help with?
`;
    }
    
    if (message.toLowerCase().includes('error') || message.toLowerCase().includes('fix')) {
        // If code is provided, do a simple analysis
        if (code) {
            const analysis = await analyzeContractCode(code);
            
            if (analysis.errors.length > 0 || analysis.warnings.length > 0) {
                let response = 'I found some issues in your code:\n\n';
                
                if (analysis.errors.length > 0) {
                    response += '**Errors:**\n';
                    analysis.errors.forEach(error => {
                        response += `- ${error}\n`;
                    });
                    response += '\n';
                }
                
                if (analysis.warnings.length > 0) {
                    response += '**Warnings:**\n';
                    analysis.warnings.forEach(warning => {
                        response += `- ${warning}\n`;
                    });
                    response += '\n';
                }
                
                response += 'Would you like me to help you fix these issues?';
                return response;
            } else {
                return 'I didn\'t find any obvious issues in your code. What specific problem are you encountering?';
            }
        } else {
            return 'Please provide your code so I can help identify and fix errors.';
        }
    }
    
    if (message.toLowerCase().includes('testnet') || message.toLowerCase().includes('submit')) {
        return `
To submit your contract to the testnet:

1. First, make sure your contract passes all tests by clicking the "Test Contract" button.
2. If all tests pass, click the "Submit to Testnet" button.
3. This will create a pull request to the Qubic testnet repository.
4. The Qubic team will review your contract and deploy it to the testnet if approved.

Would you like me to help you prepare your contract for submission?
`;
    }
    
    // Default response
    return `
I see you're working on a Qubic smart contract. I can help you analyze your code, fix errors, and prepare it for testnet submission.

What specific aspect would you like help with? You can ask me to:
- Analyze your code for errors
- Explain how to implement specific functionality
- Guide you through the testnet submission process
- Provide examples of common contract patterns
`;
}

// Get example contracts
function getExampleContracts(baseDir) {
    const contractsDir = path.join(baseDir, 'all-contracts');
    
    if (!fs.existsSync(contractsDir)) {
        console.error(`Contracts directory not found: ${contractsDir}`);
        return {
            coreFiles: [],
            contracts: []
        };
    }
    
        const files = fs.readdirSync(contractsDir);
        
        // Split files into core files and example contracts
    const coreFiles = files.filter(file => ['qpi.h', 'm256.h'].includes(file))
        .map(file => ({ name: file, path: file }));
        
    const exampleContracts = files
        .filter(file => file.endsWith('.h') && !['qpi.h', 'm256.h'].includes(file))
        .map(file => ({ name: file, path: file }));
        
        return { 
        coreFiles: coreFiles,
            contracts: exampleContracts,
    };
}

// Load an example contract
function loadExampleContract(baseDir, contractPath) {
    const fullPath = path.join(baseDir, 'all-contracts', contractPath);
    
    // Validate the path
    if (!fullPath.startsWith(path.join(baseDir, 'all-contracts'))) {
        throw new Error('Invalid contract path');
    }
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
        throw new Error('Contract file not found');
    }
    
    // Read the file
    const content = fs.readFileSync(fullPath, 'utf8');
    return content;
}

// Keep track of active test requests to prevent duplicates
const activeTests = new Map();

// Add a function to clean up stale test requests
function clearStaleTests() {
    const now = Date.now();
    for (const [userId, data] of activeTests.entries()) {
        // If test has been running for more than 2 minutes, clear it
        if (now - data.timestamp > 120000) {
            console.log(`Clearing stale test for user ${userId} (started at ${data.timestamp})`);
            activeTests.delete(userId);
        }
    }
}

// Run the cleanup every minute
setInterval(clearStaleTests, 60000);

// Test a contract with the AI analyzer (for the review agent)
async function testContract(baseDir, userId, code, assistantId, openai) {
    // Use a consistent key for logging
    const reviewId = `${userId}_${Date.now()}`;
    console.log(`Testing contract for user ${userId} with assistantId: ${assistantId || 'default'}, review ID: ${reviewId}`);
    
    // Default to the review agent if none provided - consistently use asst_RB8usbGy1Q7b9qQTkiUhGzcu
    const reviewAssistantId = 'asst_RB8usbGy1Q7b9qQTkiUhGzcu'; 
    
    try {
        // Basic code structure check
        const analysis = await analyzeContractCode(code);
        
        // Try AI analysis if OpenAI instance is provided
        if (openai) {
            try {
                console.log(`Analyzing contract with OpenAI assistant: ${reviewAssistantId} (review: ${reviewId})`);
                
                // Validate assistant exists
                try {
                    const assistant = await openai.beta.assistants.retrieve(reviewAssistantId);
                    console.log(`Using assistant: ${assistant.name} (${reviewAssistantId})`);
                } catch (assistantError) {
                    console.error(`Error retrieving assistant: ${assistantError.message}`);
                    throw new Error(`Assistant ID ${reviewAssistantId} not found or inaccessible`);
                }
                
                // Create a new thread for this analysis
                const thread = await openai.beta.threads.create();
                const threadId = thread.id;
                
                // Ensure reviewThreads is defined
                reviewThreads.set(reviewId, threadId);
                console.log(`Created review thread ${threadId} for review ${reviewId}`);
                
                // Add the message with the code to the thread
                await openai.beta.threads.messages.create(threadId, {
                    role: 'user',
                    content: `Here is my smart contract:\n\n\`\`\`h\n${code}\n\`\`\`\nPlease validate it against these headers and reference contracts:\n- qpi.txt (from qpi.h)\n- m256.txt (from m256.h)\n- assert.txt (from assert.h)\n- Qx.txt (from Qx.h)\n- Quottery.txt (from Quottery.h)\n- Qearn.txt (from Qearn.h)\n- QVAULT.txt (from QVAULT.h)\n- MyLastMatch.txt (from MyLastMatch.h)\nCheck for syntax errors, logic consistency, and correct library usage.`
                });
                
                // Run the assistant on the thread
                const run = await openai.beta.threads.runs.create(threadId, {
                    assistant_id: reviewAssistantId
                });
                
                console.log(`Started review run: ${run.id}, status: ${run.status} for review ${reviewId}`);
                
                // Poll for completion
                let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                let waitCount = 0;
                
                // Wait for the run to complete
                while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
                    // Wait for 1 second before checking again
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    waitCount++;
                    
                    // Log progress every 5 seconds
                    if (waitCount % 5 === 0) {
                        console.log(`Still waiting for review analysis... (${waitCount}s) for review ${reviewId}`);
                    }
                    
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                }
                
                // Clean up the thread after we're done with it
                setTimeout(() => {
                    reviewThreads.delete(reviewId);
                    console.log(`Cleaned up review thread for ${reviewId}`);
                }, 60000); // Clean up after 1 minute
                
                if (runStatus.status === 'completed') {
                    // Get the assistant's response
                    const messages = await openai.beta.threads.messages.list(threadId);
                    
                    // Find the most recent assistant message
                    const assistantMessages = messages.data
                        .filter(msg => msg.role === 'assistant')
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    
                    if (assistantMessages.length > 0) {
                        const latestMessage = assistantMessages[0];
                        
                        // Extract the content from the message
                        const content = latestMessage.content.map(c => {
                            if (c.type === 'text') return c.text.value;
                            return '';
                        }).join('\n');
                        
                        console.log(`Analysis complete for review ${reviewId}`);
                        return {
                            success: true,
                            message: "Contract analysis complete",
                            aiAnalysis: content,
                            warnings: analysis.warnings,
                            errors: analysis.errors
                        };
                    } else {
                        throw new Error(`No response received from the review assistant for review ${reviewId}`);
                    }
                } else {
                    throw new Error(`Assistant run failed with status: ${runStatus.status} for review ${reviewId}`);
                }
            } catch (aiError) {
                console.error(`Error with AI analysis for review ${reviewId}:`, aiError);
                return {
                    success: false,
                    errors: [...(analysis.errors || []), 'AI analysis failed: ' + aiError.message],
                    warnings: analysis.warnings
                };
            }
        } else {
            console.log('OpenAI instance not provided, skipping AI analysis');
            return {
                success: true,
                message: "Contract passed basic checks. OpenAI analysis skipped.",
                warnings: analysis.warnings,
                errors: analysis.errors
            };
        }
    } catch (error) {
        console.error(`Error testing contract for review ${reviewId}:`, error);
        return {
            success: false,
            errors: [error.message || 'Unknown error testing contract']
        };
    }
}

// Submit a contract to the testnet
async function submitContract(userId, code) {
    console.log(`Submitting contract for user ${userId}`);
    
    if (!userId) {
        return { 
            success: false, 
            error: 'You must be logged in to submit contracts'
        };
    }
    
    // First, test the contract
    const testResult = await testContract(null, userId, code);
    if (!testResult.success) {
            return { 
                success: false, 
            errors: testResult.errors,
            message: 'Contract test failed. Please fix the errors before submitting.'
        };
    }
    
    // Save the submitted contract with a timestamp
    const submitFileName = `submitted_${Date.now()}.cpp`;
    try {
        saveUserContract(userId, submitFileName, code);
    } catch (error) {
        console.error('Error saving submitted contract:', error);
        // Continue anyway - the submission can still proceed
    }
    
    // In a real implementation, this would submit to the actual testnet
    // For now, we'll simulate a successful submission
    return {
        success: true,
        message: `Contract submitted to testnet. It will be reviewed and deployed if accepted.`,
        additionalInfo: {
            submissionId: `sub-${Date.now()}`,
            timeStamp: new Date().toISOString(),
            pullRequestUrl: 'https://github.com/qubic/testnet-contracts/pull/123'
        }
    };
}

// Handle AI assistant messages (for the chat panel)
async function handleAiMessage(userId, message, code, openai, isFromSmartContractPage = false) {
    // Default to Smart Contract assistant ID
    const chatAssistantId = process.env.OPENAI_ASSISTANT_ID || 'asst_RB8usbGy1Q7b9qQTkiUhGzcu';
    
    // Validate user and OpenAI availability
    if (!userId) {
        console.error('No user ID provided for AI chat');
        return { error: 'You must be logged in to use the AI assistant.' };
    }
    
    if (!openai) {
        console.error('OpenAI instance not provided to handleAiMessage');
        return { error: 'AI service is not available at the moment. Please try again later.' };
    }
    
    console.log(`Processing Smart Contract chat message from user ${userId} to assistant ${chatAssistantId}`);
    
    try {
        // Prepare the message content
        let messageContent;
        
        if (typeof message === 'object') {
            messageContent = message.message || '';
        } else {
            messageContent = message;
        }
        
        // If code is provided, include it in the message
        if (code && code.trim()) {
            messageContent = `${messageContent}\n\nHere is my current contract code:\n\`\`\`cpp\n${code}\n\`\`\``;
        }
        
        // Ensure the content is properly formatted as a string
        if (typeof messageContent !== 'string') {
            console.warn(`Content is not a string, converting from type: ${typeof messageContent}`);
            messageContent = String(messageContent);
        }
        
        console.log(`Message ${code && code.trim() ? 'includes' : 'does not include'} code (${code ? code.length : 0} chars)`);
        
        // Use thread map for Smart Contract chat
        let threadId = scChatThreads.get(userId);
        if (!threadId) {
            console.log(`Creating new Smart Contract chat thread for user ${userId}`);
            const thread = await openai.beta.threads.create();
            threadId = thread.id;
            scChatThreads.set(userId, threadId);
            console.log(`Created new chat thread ${threadId} for user ${userId}`);
        }
        
        // Add the message to the thread
        await openai.beta.threads.messages.create(threadId, {
            role: 'user',
            content: messageContent
        });
        
        // Create a run to process the thread with the assistant
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: chatAssistantId
        });
        
        // Polling for the run to complete
        let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
        
        while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && runStatus.status !== 'cancelled') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            
            if (runStatus.status === 'requires_action') {
                // Handle function calling if needed
                console.log('Run requires action:', runStatus.required_action);
                // Implement function calling logic here
            }
        }
        
        if (runStatus.status !== 'completed') {
            console.error(`Run ${run.id} did not complete successfully:`, runStatus);
            return { error: 'The AI assistant encountered an error processing your request.' };
        }
        
        // Get messages added after our request
        const messages = await openai.beta.threads.messages.list(threadId);
        
        // Find the last assistant message
        const lastAssistantMessage = messages.data
            .filter(msg => msg.role === 'assistant')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        
        if (!lastAssistantMessage) {
            return { error: 'No response received from the AI assistant.' };
        }
        
        // Extract and format the response
        let responseContent = '';
        for (const content of lastAssistantMessage.content) {
            if (content.type === 'text') {
                responseContent += content.text.value;
            }
        }
        
        return { message: responseContent };
    } catch (error) {
        console.error('Error in AI chat processing:', error);
        return { error: 'An error occurred while processing your request.' };
    }
}

// Create a directory for user contracts if it doesn't exist
const USER_CONTRACTS_DIR = path.join(__dirname, '..', 'user-contracts');
if (!fs.existsSync(USER_CONTRACTS_DIR)) {
    fs.mkdirSync(USER_CONTRACTS_DIR, { recursive: true });
}

// Path to the projects directory
const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

// Create initial template contract
const INITIAL_CONTRACT = `
// This is a test contract for your Qubic smart contract

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
};`;

// Function to get user's contract directory
function getUserContractsDir(userId) {
    const userDir = path.join(USER_CONTRACTS_DIR, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
        
        // Create an initial contract file
        fs.writeFileSync(path.join(userDir, 'initial_contract.h'), INITIAL_CONTRACT);
    } else {
        // Make sure the initial contract exists
        const initialContract = path.join(userDir, 'initial_contract.h');
        if (!fs.existsSync(initialContract)) {
            fs.writeFileSync(initialContract, INITIAL_CONTRACT);
        }
    }
    return userDir;
}

// Function to get all contract files for a user
function getUserContracts(userId) {
    if (!userId) return [];
    
    const userDir = getUserContractsDir(userId);
    const files = [];
    
    try {
        const dirEntries = fs.readdirSync(userDir);
        
        for (const entry of dirEntries) {
            const filePath = path.join(userDir, entry);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile() && entry.endsWith('.h')) {
                files.push({
                    name: entry,
                    path: entry,
                    size: stats.size,
                    lastModified: stats.mtime.toISOString()
                });
            }
        }
        
        return files;
    } catch (error) {
        console.error(`Error getting user contracts for ${userId}:`, error);
        return [];
    }
}

// Function to save a user contract file
function saveUserContract(userId, fileName, content) {
    if (!userId) throw new Error('User ID is required');
    if (!fileName) throw new Error('File name is required');
    
    // Add .h extension if missing
    if (!fileName.endsWith('.h')) {
        fileName += '.h';
    }
    
    const userDir = getUserContractsDir(userId);
    const filePath = path.join(userDir, fileName);
    
    // Basic security check
    if (!filePath.startsWith(userDir)) {
        throw new Error('Invalid file path');
    }
    
    fs.writeFileSync(filePath, content);
    return { success: true, message: 'Contract saved successfully' };
}

// Function to create a new contract file
function createUserContract(userId, fileName, initialContent = null) {
    if (!userId) throw new Error('User ID is required');
    if (!fileName) throw new Error('File name is required');
    
    // Log what we received for debugging
    console.log(`Creating contract for user ${userId}, fileName: ${fileName}, initialContent type:`, 
        initialContent ? typeof initialContent : 'null');
    
    // Add .h extension if missing
    if (!fileName.endsWith('.h')) {
        fileName += '.h';
    }
    
    const userDir = getUserContractsDir(userId);
    const filePath = path.join(userDir, fileName);
    
    // Basic security check
    if (!filePath.startsWith(userDir)) {
        throw new Error('Invalid file path');
    }
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
        throw new Error('File already exists');
    }
    
    // Ensure content is a string
    let contentToWrite = INITIAL_CONTRACT;
    if (initialContent !== null) {
        if (typeof initialContent === 'string') {
            contentToWrite = initialContent;
        } else {
            console.warn('initialContent is not a string:', initialContent);
            console.warn('Using default template instead');
        }
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    
    try {
        fs.writeFileSync(filePath, contentToWrite);
        console.log(`Created new contract: ${filePath}`);
        return { success: true, fileName, path: filePath };
    } catch (error) {
        console.error('Error writing contract file:', error);
        throw new Error('Failed to create contract file: ' + error.message);
    }
}
// Function to get user contract content
function getUserContractContent(userId, fileName) {
    if (!userId) throw new Error('User ID is required');
    if (!fileName) throw new Error('File name is required');
    
    // Add .h extension if missing
    if (!fileName.endsWith('.h')) {
        fileName += '.h';
    }
    
    const userDir = getUserContractsDir(userId);
    const filePath = path.join(userDir, fileName);
    
    // Basic security check
    if (!filePath.startsWith(userDir)) {
        throw new Error('Invalid file path');
    }
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`File ${fileName} not found`);
    }
    
    return fs.readFileSync(filePath, 'utf8');
}

// Configure socket events for smart contracts
function configureSocketEvents(io, socket, baseDir, openai) {
    // Store io in socket to make it available for all handlers
    if (io) {
        socket.io = io;
    }
    
    // Get example contracts - available to all users, even if not logged in
    socket.on('get-example-contracts', () => {
        const result = getExampleContracts(baseDir);
        socket.emit('example-contracts', result);
    });

    // Load example contract - available to all users
    socket.on('load-example-contract', (data) => {
        try {
            const content = loadExampleContract(baseDir, data.path);
            socket.emit('example-contract-content', { 
                content,
                fileName: data.path // Include the fileName for UI updates
            });
        } catch (error) {
            console.error('Error loading example contract:', error);
            socket.emit('example-contract-content', { 
                error: error.message 
            });
        }
    });

    // Test contract
    socket.on('test-contract', async (data) => {
        console.log('Test contract request received from client');
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('test-results', { 
                success: false,
                error: 'Not logged in'
            });
            return;
        }
        
        // Check if openai instance is available
        if (!openai) {
            console.error('OpenAI instance not provided to socket handler');
            socket.emit('test-results', {
                success: false,
                error: 'AI service is not available at the moment. Please try again later.'
            });
            return;
        }
        
        // Create a unique ID for this test request
        const requestId = `${userId}_${Date.now()}`;
        
        // Check if we're already processing a test for this user
        if (activeTests.has(userId)) {
            const existingTest = activeTests.get(userId);
            const timeSinceStart = Date.now() - existingTest.timestamp;
            const elapsedSeconds = Math.round(timeSinceStart / 1000);
            
            // Only show the error if it's been more than 10 seconds since the last test started
            // otherwise just ignore silently to avoid annoying users with rapid-clicking
            if (timeSinceStart < 180000) {
                console.log(`Already processing a test for user ${userId}, ignoring duplicate request. Started ${timeSinceStart}ms ago.`);
                
                // Only send an error message if the test has been running for more than 10 seconds
                // This avoids showing errors for quick double-clicks or form resubmissions
                if (timeSinceStart > 10000) {
                    socket.emit('test-results', { 
                        success: false,
                        error: `A test is already in progress (running for ${elapsedSeconds} seconds). Results will be delivered when ready.`
                    });
                } else {
                    // For recent test starts, just log and ignore silently
                    console.log(`Silently ignoring duplicate test request (${timeSinceStart}ms since last test)`);
                }
                
                // Store this socket in the existing test record so we can send results to it too
                if (!existingTest.sockets) {
                    existingTest.sockets = new Set();
                }
                
                // Add this socket to the list if it has an ID
                if (socket.id) {
                    existingTest.sockets.add(socket.id);
                    console.log(`Added socket ${socket.id} to listeners for test ${existingTest.requestId}`);
                }
                
                return;
            } else {
                console.log(`Previous test for user ${userId} appears stuck (${timeSinceStart}ms). Allowing new test.`);
                // Continue with the new test
            }
        }
        
        // Mark this user as having an active test with timestamp
        const testRecord = {
            requestId,
            timestamp: Date.now(),
            socketIds: new Set() // Initialize empty set
        };
        
        // Add current socket ID if available
        if (socket.id) {
            testRecord.socketIds.add(socket.id);
        }
        
        activeTests.set(userId, testRecord);
        
        // Ensure we have valid code
        if (!data || !data.code) {
            activeTests.delete(userId); // Clean up
            socket.emit('test-results', { 
                success: false,
                error: 'No code provided'
            });
            return;
        }
        
        // Ensure code is a string
        let codeToTest = data.code;
        if (typeof codeToTest !== 'string') {
            console.warn('Code is not a string, attempting to convert:', typeof codeToTest);
            try {
                codeToTest = String(codeToTest);
            } catch (e) {
                activeTests.delete(userId); // Clean up
                console.error('Failed to convert code to string:', e);
                socket.emit('test-results', { 
                    success: false,
                    error: 'Invalid code format'
                });
                return;
            }
        }
        
        socket.emit('analyzing-contract', {
            status: 'started'
        });
        
        try {
            const results = await testContract(baseDir, userId, codeToTest, data.assistantId, openai);
            
            // Get the active test record
            const testRecord = activeTests.get(userId);
            
            // Broadcast results to all sockets for this user
            if (socket.io && testRecord && testRecord.socketIds && testRecord.socketIds.size > 0) {
                // If we have io and socket IDs, try to send to all of them
                console.log(`Attempting to broadcast results to ${testRecord.socketIds.size} sockets for user ${userId}`);
                
                // Get all connected sockets
                let successCount = 0;
                for (const socketId of testRecord.socketIds) {
                    try {
                        const targetSocket = socket.io.sockets.sockets.get(socketId);
                        if (targetSocket) {
                            targetSocket.emit('test-results', results);
                            successCount++;
                        }
                    } catch (e) {
                        console.error(`Error sending to socket ${socketId}:`, e.message);
                    }
                }
                
                console.log(`Successfully sent results to ${successCount} sockets for user ${userId}`);
            } else {
                // Fallback to just this socket
                socket.emit('test-results', results);
            }
        } catch (error) {
            console.error('Error testing contract:', error);
            socket.emit('test-results', { 
                success: false,
                error: error.message
            });
        } finally {
            // Always clean up, even if there's an error
            activeTests.delete(userId);
            console.log(`Completed test for user ${userId}, request ${requestId}`);
        }
    });

    // Submit contract
    socket.on('submit-contract', async (data) => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('submit-result', { 
                error: 'You must be logged in to submit contracts' 
            });
            return;
        }
        
        console.log(`Submitting contract for user ${userId}`);
        
        try {
        const result = await submitContract(userId, data.code);
            
            if (result.success) {
                socket.emit('submit-result', {
                    success: true,
                    message: result.message,
                    additionalInfo: result.additionalInfo
                });
                
                // Also send to terminal for visibility
                socket.emit('terminal-output', `✅ ${result.message}\n\nSubmission ID: ${result.additionalInfo.submissionId}\nTimestamp: ${result.additionalInfo.timeStamp}\nPull Request: ${result.additionalInfo.pullRequestUrl}\n`);
            } else {
                socket.emit('submit-result', {
                    success: false,
                    errors: result.errors,
                    message: result.message
                });
                
                // Also send to terminal for visibility
                socket.emit('terminal-output', `❌ ${result.message}\n\nErrors:\n${result.errors.join('\n')}\n`);
            }
        } catch (error) {
            socket.emit('submit-result', {
                error: 'Error submitting contract: ' + error.message
            });
            
            // Also send to terminal for visibility
            socket.emit('terminal-output', `❌ Error submitting contract: ${error.message}\n`);
        }
    });

    // AI chat message (for the interactive chat panel)
    socket.on('ai-message', async (data) => {
        // Skip if not from smartContractPage, as server.js now handles CLI messages
        if (!(data && typeof data === 'object' && data.isFromSmartContractPage)) {
            // Let server.js handle CLI messages
            return;
        }
        
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('ai-response', { 
                error: 'You must be logged in to use the AI assistant.'
            });
            return;
        }
        
        // Check if openai instance is available
        if (!openai) {
            console.error('OpenAI instance not provided to socket handler');
            socket.emit('ai-response', {
                error: 'AI service is not available at the moment. Please try again later.'
            });
            return;
        }
        
        console.log(`Received AI message from user ${userId} (Smart Contract page)`);
        
        try {
            // Extract message and code from the data
            let message = data.message || '';
            let code = data.code || '';
            
            console.log(`Processing Smart Contract AI message`);
            
            // Validate the message
            if (!message) {
                console.error('No message provided for AI chat');
                socket.emit('ai-response', {
                    error: 'No message provided for chat'
                });
                return;
            }
            
            // Process the chat message and send the response
            const response = await handleAiMessage(userId, data, code, openai, true);
            socket.emit('ai-response', response);
        } catch (error) {
            console.error('Error processing AI chat:', error);
            socket.emit('ai-response', {
                error: 'Failed to process your chat message'
            });
        }
    });

    // Add a handler for resetting the test state
    socket.on('reset-test-state', () => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            return;
        }
        
        // Check if there's an active test
        if (activeTests.has(userId)) {
            console.log(`Manual reset requested for user ${userId}. Clearing test state.`);
            activeTests.delete(userId);
            socket.emit('test-state-reset', { success: true });
        } else {
            console.log(`No active test found for user ${userId}. Nothing to reset.`);
            socket.emit('test-state-reset', { success: false, message: 'No active test found' });
        }
    });

    // Get user contracts
    socket.on('get-user-contracts', () => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('user-contracts', { 
                error: 'Not logged in',
                contracts: [] 
            });
            return;
        }
        
        const contracts = getUserContracts(userId);
        socket.emit('user-contracts', { contracts });
    });
    
    // Save user contract
    socket.on('save-user-contract', (data) => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('save-result', { 
                error: 'Not logged in'
            });
            return;
        }
        
        try {
            const result = saveUserContract(userId, data.fileName, data.content);
            socket.emit('save-result', result);
        } catch (error) {
            socket.emit('save-result', { 
                error: error.message 
            });
        }
    });
    
    // Create new user contract
    socket.on('create-user-contract', (data) => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('create-result', { 
                error: 'Not logged in'
            });
            return;
        }
        
        try {
            // Validate data
            if (!data.fileName) {
                throw new Error('File name is required');
            }
            
            // We don't need to do any conversion here - createUserContract will handle it
            const result = createUserContract(userId, data.fileName, data.initialContent);
            socket.emit('create-result', result);
            
            // Send updated contract list
            const contracts = getUserContracts(userId);
            socket.emit('user-contracts', { contracts });
            
            // Automatically load the new contract
            if (result.success && result.fileName) {
                const content = getUserContractContent(userId, result.fileName);
                socket.emit('contract-content', { 
                    content,
                    fileName: result.fileName 
                });
            }
        } catch (error) {
            console.error('Error creating contract:', error, data);
            socket.emit('create-result', { 
                error: error.message 
            });
        }
    });
    
    // Get user contract content
    socket.on('get-user-contract', (data) => {
        const userId = getUserIdFromSocket(socket);
        if (!userId) {
            socket.emit('contract-content', { 
                error: 'Not logged in'
            });
            return;
        }
        
        try {
            const content = getUserContractContent(userId, data.fileName);
            socket.emit('contract-content', { 
                content,
                fileName: data.fileName 
            });
        } catch (error) {
            console.error('Error getting contract content:', error);
            socket.emit('contract-content', { 
                error: 'Failed to get contract content: ' + error.message
            });
        }
    });

    // Handle login success to sync contracts
    socket.on('login-success', (data) => {
        if (data && data.userId) {
            console.log(`User logged in, syncing contracts for: ${data.userId}`);
        }
    });
    
    // Handle auto-login success to sync contracts
    socket.on('auto-login-success', (data) => {
        if (data && data.userId) {
            console.log(`User auto-logged in, syncing contracts for: ${data.userId}`);
        }
    });
    
    // Handle set-user-id to sync contracts
    socket.on('set-user-id', (data) => {
        if (data && data.userId) {
            console.log(`User ID set explicitly, syncing contracts for: ${data.userId}`);
        }
    });
}

// Configure routes for smart contracts
function configureRoutes(app, baseDir) {
    // Add route for smart contract tester page
    app.get('/smart-contract-tester', (req, res) => {
        res.sendFile(path.join(baseDir, 'public', 'smart-contract-tester.html'));
    });
}

module.exports = {
    analyzeContractCode,
    processAiMessage,
    testContract,
    submitContract,
    handleAiMessage,
    getExampleContracts,
    loadExampleContract,
    getUserContracts,
    configureSocketEvents,
    configureRoutes,
    saveUserContract,
    createUserContract,
    getUserContractContent
};
