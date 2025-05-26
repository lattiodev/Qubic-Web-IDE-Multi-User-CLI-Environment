/**
 * Authentication Modal
 * Reusable script for login and registration functionality
 */

// Create and show the login/register modal
function showAuthModal(socket) {
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
    modalStyle.id = 'auth-modal-style';
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
            background-color: var(--bg-color, #1e1e1e);
            padding: 25px;
            border-radius: 5px;
            width: 350px;
            position: relative;
            border: 1px solid var(--border-color, #454545);
            color: var(--text-color, #cccccc);
        }
        
        .modal-tabs {
            display: flex;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--border-color, #454545);
        }
        
        .modal-tab {
            padding: 8px 15px;
            background: none;
            border: none;
            color: var(--text-color, #cccccc);
            cursor: pointer;
            opacity: 0.7;
            font-size: 14px;
        }
        
        .modal-tab.active {
            opacity: 1;
            font-weight: bold;
            border-bottom: 2px solid var(--primary-color, #007acc);
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
            color: var(--text-color, #cccccc);
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
            background-color: var(--primary-color, #007acc);
            color: white;
            border: none;
        }
        
        .cancel-button {
            background-color: transparent;
            border: 1px solid #555;
            color: var(--text-color, #cccccc);
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
        closeAuthModal();
    });
    
    document.getElementById('cancel-register-btn').addEventListener('click', () => {
        closeAuthModal();
    });
    
    // Add socket event handlers for login/register responses
    const loginSuccessHandler = (data) => {
        console.log('Login success:', data);
        // Set cookie directly here to ensure it happens
        document.cookie = `qubicUserId=${data.userId}; path=/; max-age=86400`;
        
        // Set socket.userId on the client side to match server
        if (socket) {
            socket.userId = data.userId;
        }
        
        closeAuthModal();
        
        // Signal success to the main script
        document.dispatchEvent(new CustomEvent('auth:login-success', { detail: data }));
    };
    
    const loginErrorHandler = (data) => {
        console.log('Login error:', data);
        document.getElementById('modal-login-error').textContent = data.error;
    };
    
    const registerSuccessHandler = (data) => {
        console.log('Register success:', data);
        
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
            closeAuthModal();
        });
    };
    
    const registerErrorHandler = (data) => {
        console.log('Register error:', data);
        document.getElementById('modal-register-error').textContent = data.error;
    };
    
    // Attach socket event handlers
    socket.on('login-success', loginSuccessHandler);
    socket.on('login-error', loginErrorHandler);
    socket.on('register-success', registerSuccessHandler);
    socket.on('register-error', registerErrorHandler);
    
    // Store handlers for cleanup
    modal.authHandlers = {
        loginSuccess: loginSuccessHandler,
        loginError: loginErrorHandler,
        registerSuccess: registerSuccessHandler,
        registerError: registerErrorHandler
    };
    
    return modal;
}

// Close the auth modal and clean up
function closeAuthModal() {
    const modal = document.querySelector('.modal');
    const modalStyle = document.getElementById('auth-modal-style');
    
    if (modal) {
        // Remove socket event listeners if they were stored
        if (modal.authHandlers) {
            const socket = window.authSocket;
            if (socket) {
                socket.off('login-success', modal.authHandlers.loginSuccess);
                socket.off('login-error', modal.authHandlers.loginError);
                socket.off('register-success', modal.authHandlers.registerSuccess);
                socket.off('register-error', modal.authHandlers.registerError);
            }
        }
        document.body.removeChild(modal);
    }
    
    if (modalStyle) {
        document.head.removeChild(modalStyle);
    }
}

// Handle successful login (to be used by the main script)
function handleLoginSuccess(data, updateUICallback) {
    // Set cookie
    document.cookie = `qubicUserId=${data.userId}; path=/; max-age=86400`;
    
    // Call the callback to update the UI
    if (typeof updateUICallback === 'function') {
        updateUICallback(data);
    }
}

// Set the user ID on the socket explicitly
function setSocketUserId(socket, userId) {
    if (socket && userId) {
        console.log('Setting socket.userId explicitly:', userId);
        socket.userId = userId;
        
        // Emit an event to the server to set the userId there as well
        socket.emit('set-user-id', { userId });
    }
}

// Export functions for use in other scripts
window.AuthModal = {
    show: showAuthModal,
    close: closeAuthModal,
    handleLoginSuccess: handleLoginSuccess,
    setSocketUserId: setSocketUserId
}; 