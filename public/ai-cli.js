/**
 * AI Assistant for CLI Interface
 * Handles all AI chat functionality for the CLI page
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[AI-CLI] Initializing CLI AI Assistant');
    
    // Try to access the editor instance periodically
    let editorCheckInterval = null;
    
    const checkForEditor = () => {
        // Check if the editor is available in the window object
        if (window.editor) {
            console.log('[AI-CLI] Found editor instance via window.editor');
            clearInterval(editorCheckInterval);
        } else {
            // Try to access editor directly through Monaco
            if (window.monaco && window.monaco.editor) {
                const editors = window.monaco.editor.getEditors();
                if (editors && editors.length > 0) {
                    window.editor = editors[0]; // Store the first editor in window object
                    console.log('[AI-CLI] Found Monaco editor instance:', window.editor);
                    clearInterval(editorCheckInterval);
                }
            }
        }
    };
    
    // Start checking for editor
    editorCheckInterval = setInterval(checkForEditor, 500);
    checkForEditor(); // Check immediately once
    
    // Connect to socket.io server
    const socket = io();
    
    // Debug socket connection status
    socket.on('connect', () => {
        console.log('[AI-CLI] Connected to server socket.io instance with ID:', socket.id);
        console.log('[AI-CLI] Ready to communicate with server.js AI handler');
    });
    
    socket.on('connect_error', (error) => {
        console.error('[AI-CLI] Connection error with server:', error);
    });
    
    // Cache DOM elements
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send');
    const aiMessages = document.getElementById('ai-messages');
    const expandConversation = document.getElementById('expand-conversation');
    const messageModal = document.getElementById('message-modal');
    const modalClose = document.getElementById('modal-close');
    const modalConversationContent = document.getElementById('modal-conversation-content');
    const includeCodeCheckbox = document.getElementById('include-code-checkbox');
    const aiAssistant = document.querySelector('.ai-assistant');
    const toggleAiAssistant = document.getElementById('toggle-ai-assistant');
    const toggleAssistant = document.getElementById('toggle-assistant');
    
    // Assistant ID for the CLI assistant
    // Both server.js and smartOperations.js use the same OpenAI integration,
    // but with different assistant IDs to get different behavior
    const ASSISTANT_ID = 'asst_m7lG2GdsPJKQLOcdiDInUGeM';
    
    // Initialize include code checkbox
    if (includeCodeCheckbox) {
        // Load saved preference
        const savedIncludeCode = localStorage.getItem('includeCodeInAI');
        includeCodeCheckbox.checked = savedIncludeCode === 'true';
        
        // Save preference when changed
        includeCodeCheckbox.addEventListener('change', () => {
            localStorage.setItem('includeCodeInAI', includeCodeCheckbox.checked);
        });
    }
    
    // Toggle AI assistant panel
    if (toggleAiAssistant) {
        toggleAiAssistant.addEventListener('click', () => {
            console.log('[AI-CLI] Toggle floating button clicked');
            if (aiAssistant) {
                aiAssistant.classList.toggle('show');
            }
        });
    }
    
    // Alternative toggle from menu if exists
    if (toggleAssistant) {
        toggleAssistant.addEventListener('click', () => {
            console.log('[AI-CLI] Toggle menu button clicked');
            if (aiAssistant) {
                aiAssistant.classList.toggle('show');
            }
        });
    }
    
    // Send AI message function
    function sendAiMessage() {
        console.log('[AI-CLI] sendAiMessage called');
        const message = aiInput.value.trim();
        if (!message) return;
        
        // Truncate message if too long
        const displayMessage = message.length > 500 
            ? message.substring(0, 500) + '...' 
            : message;
        
        // Add user message
        const userMessageEl = document.createElement('div');
        userMessageEl.className = 'ai-message user';
        userMessageEl.textContent = displayMessage;
        aiMessages.appendChild(userMessageEl);
        
        // Get current editor content if checkbox is checked
        let code = '';
        if (includeCodeCheckbox && includeCodeCheckbox.checked) {
            try {
                // Try multiple approaches to get the editor content
                let editorContent = null;
                
                // Try approach 0: Via the exported global function
                if (window.getCodeEditor && typeof window.getCodeEditor === 'function') {
                    const globalEditor = window.getCodeEditor();
                    if (globalEditor && typeof globalEditor.getValue === 'function') {
                        editorContent = globalEditor.getValue();
                        console.log('[AI-CLI] Got code from window.getCodeEditor()', editorContent.length, 'chars');
                    }
                }
                // Try approach 1: Direct window.editor reference
                else if (window.editor && typeof window.editor.getValue === 'function') {
                    editorContent = window.editor.getValue();
                    console.log('[AI-CLI] Got code from window.editor', editorContent.length, 'chars');
                } 
                // Try approach 2: Via Monaco API
                else if (window.monaco && window.monaco.editor) {
                    const editors = window.monaco.editor.getEditors();
                    if (editors && editors.length > 0) {
                        const firstEditor = editors[0];
                        if (typeof firstEditor.getValue === 'function') {
                            editorContent = firstEditor.getValue();
                            console.log('[AI-CLI] Got code from monaco.editor.getEditors()', editorContent.length, 'chars');
                        }
                    }
                }
                // Try approach 3: Look for models
                else if (window.monaco && window.monaco.editor && window.monaco.editor.getModels) {
                    const models = window.monaco.editor.getModels();
                    if (models && models.length > 0) {
                        editorContent = models[0].getValue();
                        console.log('[AI-CLI] Got code from monaco.editor.getModels()', editorContent.length, 'chars');
                    }
                }
                
                // Set the code if we got content
                if (editorContent) {
                    code = editorContent;
                    
                    // Add code indicator to the message
                    const codeIndicator = document.createElement('div');
                    codeIndicator.className = 'code-included-indicator';
                    codeIndicator.innerHTML = '<i class="fas fa-code"></i> Code included (' + code.length + ' chars)';
                    userMessageEl.appendChild(codeIndicator);
                } else {
                    console.warn('[AI-CLI] Could not get editor content');
                }
            } catch (err) {
                console.error('[AI-CLI] Error getting editor content:', err);
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
        
        // Send to server
        console.log('[AI-CLI] Sending message to chat assistant with ID:', ASSISTANT_ID);
        console.log('[AI-CLI] Including code:', includeCodeCheckbox && includeCodeCheckbox.checked);
        console.log('[AI-CLI] Code size:', code ? code.length : 0, 'chars');
        
        if (code) {
            console.log('[AI-CLI] First 100 chars of code:', code.substring(0, 100) + '...');
        }
        
        try {
            socket.emit('ai-message', { 
                message: message,
                code: code,
                assistantId: ASSISTANT_ID,
                isFromCliPage: true  // Explicitly flag these messages as from CLI page
                // Server checks for absence of isFromSmartContractPage, but this flag 
                // helps with debugging and future-proofing
            });
            console.log('[AI-CLI] Message sent successfully');
        } catch (error) {
            console.error('[AI-CLI] Error sending message:', error);
            thinkingEl.textContent = 'Error sending message. Please try again.';
            thinkingEl.className = 'ai-message assistant error';
        }
    }
    
    // Format AI message with markdown-like syntax
    function formatAiMessage(message) {
        if (!message) return '';
        
        // Convert code blocks
        message = message.replace(/```(\w*)([\s\S]*?)```/g, function(match, language, code) {
            return `<pre><code class="${language}">${escapeHtml(code.trim())}</code></pre>`;
        });
        
        // Convert inline code
        message = message.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Convert bold
        message = message.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Convert italic
        message = message.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Convert lists
        message = message.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
        message = message.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
        
        // Convert line breaks
        message = message.replace(/\n/g, '<br>');
        
        return message;
    }
    
    // Utility function to escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Event listeners
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', (e) => {
            console.log('[AI-CLI] Send button clicked');
            sendAiMessage();
        });
    }
    
    if (aiInput) {
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                console.log('[AI-CLI] Enter key pressed');
                sendAiMessage();
            }
        });
    }
    
    // Handle AI responses from server
    socket.on('ai-response', (data) => {
        console.log('[AI-CLI] Received AI response from server.js OpenAI handler:', data);
        
        // Remove thinking message if it exists
        const thinkingMessage = document.querySelector('.ai-message.thinking');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
        
        if (data.status === 'thinking') {
            // Update thinking message
            const thinkingMsg = document.querySelector('.ai-message.thinking') || document.createElement('div');
            thinkingMsg.className = 'ai-message thinking';
            thinkingMsg.textContent = data.message || 'Still thinking...';
            
            if (!thinkingMsg.parentNode) {
                aiMessages.appendChild(thinkingMsg);
            }
            
            // Scroll to bottom
            aiMessages.scrollTop = aiMessages.scrollHeight;
            return;
        }
        
        // If we have a complete message
        if (data.message) {
            const messageEl = document.createElement('div');
            messageEl.className = 'ai-message assistant';
            messageEl.innerHTML = formatAiMessage(data.message);
            aiMessages.appendChild(messageEl);
            
            // Scroll to bottom
            aiMessages.scrollTop = aiMessages.scrollHeight;
        }
        
        // If there's an error
        if (data.error) {
            const errorEl = document.createElement('div');
            errorEl.className = 'ai-message assistant error';
            errorEl.textContent = data.error;
            aiMessages.appendChild(errorEl);
            
            // Scroll to bottom
            aiMessages.scrollTop = aiMessages.scrollHeight;
        }
    });
    
    // Expand conversation modal
    if (expandConversation) {
        expandConversation.addEventListener('click', () => {
            // Clone the conversation content for the modal
            const conversationClone = aiMessages.cloneNode(true);
            modalConversationContent.innerHTML = '';
            modalConversationContent.appendChild(conversationClone);
            
            // Show the modal
            messageModal.classList.add('show');
        });
    }
    
    // Modal close button
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            messageModal.classList.remove('show');
        });
    }
    
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && messageModal.classList.contains('show')) {
            messageModal.classList.remove('show');
        }
    });
    
    // Click outside modal to close
    messageModal.addEventListener('click', (e) => {
        if (e.target === messageModal) {
            messageModal.classList.remove('show');
        }
    });
    
    // Information about how this client-side code integrates with server.js
    console.log('[AI-CLI] Integration details:');
    console.log('[AI-CLI] - Sends "ai-message" events to server.js with isFromCliPage=true');
    console.log('[AI-CLI] - Server.js processes messages not flagged as isFromSmartContractPage');
    console.log('[AI-CLI] - Uses CLI assistant ID:', ASSISTANT_ID);
    console.log('[AI-CLI] - Receives "ai-response" events from server.js with OpenAI responses');
    
    // Note about terminal fitting error that might appear in console
    console.log('[AI-CLI] Note: The "Error fitting terminal" message in the console is from script.js and is unrelated to AI functionality');
    
    console.log('[AI-CLI] AI CLI Assistant initialized and ready');
});
