// Global variables
let currentUser = null;
let authToken = null;

// DOM Elements
// Login/Register elements
const loginSection = document.getElementById('login-section');
const userDashboard = document.getElementById('user-dashboard');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');

// User dashboard elements
const userNameSpan = document.getElementById('user-name');
const todayCountSpan = document.getElementById('today-count');
const totalCountSpan = document.getElementById('total-count');
const incrementBtn = document.getElementById('increment-btn');
const friendCodeSpan = document.getElementById('friend-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const friendCodeInput = document.getElementById('friend-code-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendRequestsSection = document.getElementById('friend-requests-section');
const friendRequestsList = document.getElementById('friend-requests-list');
const logoutBtn = document.getElementById('logout-btn');

// Friends stats elements
const dateFilter = document.getElementById('date-filter');
const userStats = document.getElementById('user-stats');
const noFriendsMessage = document.getElementById('no-friends-message');

// API Endpoint (can be changed to production URL later)
const API_URL = 'https://activity-tracker-smoky.vercel.app/api';

// Helper Functions
// Set auth token in headers
const getAuthHeaders = () => {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
};

// Format date for display
const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
};

// Save user session to localStorage
const saveSession = () => {
    localStorage.setItem('activityTrackerUser', JSON.stringify(currentUser));
    localStorage.setItem('activityTrackerToken', authToken);
};

// Clear user session from localStorage
const clearSession = () => {
    localStorage.removeItem('activityTrackerUser');
    localStorage.removeItem('activityTrackerToken');
    currentUser = null;
    authToken = null;
};

// Show login form, hide dashboard
const showLoginForm = () => {
    loginSection.classList.add('active');
    loginSection.classList.remove('hidden');
    userDashboard.classList.add('hidden');
    userDashboard.classList.remove('active');
};

// Hide login form, show dashboard
const showDashboard = () => {
    loginSection.classList.add('hidden');
    loginSection.classList.remove('active');
    userDashboard.classList.add('active');
    userDashboard.classList.remove('hidden');
};

// Update the user dashboard with user info
const updateDashboard = () => {
    if (!currentUser) return;
    
    userNameSpan.textContent = currentUser.username;
    friendCodeSpan.textContent = currentUser.friendCode;
    
    // Get counts
    fetchCounts();
    
    // Get friend requests
    fetchFriendRequests();
    
    // Get friends stats
    fetchFriendsStats();
};

// API Functions
// Register a new user
const registerUser = async (username, password) => {
    try {
        const response = await fetch(`${API_URL}/users/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Registration failed');
        }
        
        return data;
    } catch (error) {
        throw error;
    }
};

// Login user
const loginUser = async (username, password) => {
    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }
        
        currentUser = data.user;
        authToken = data.token;
        saveSession();
        
        return data;
    } catch (error) {
        throw error;
    }
};

// Fetch user's profile data
const fetchUserProfile = async () => {
    try {
        const response = await fetch(`${API_URL}/users/profile`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch profile');
        }
        
        // Update current user with latest data
        currentUser = data;
        saveSession();
        
        return data;
    } catch (error) {
        throw error;
    }
};

// Fetch user's activity counts
const fetchCounts = async () => {
    try {
        const response = await fetch(`${API_URL}/users/${currentUser._id}/counts`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch counts');
        }
        
        // Update count displays
        todayCountSpan.textContent = data.todayCount;
        totalCountSpan.textContent = data.totalCount;
        
        return data;
    } catch (error) {
        console.error('Error fetching counts:', error);
    }
};

// Increment activity count
const incrementCount = async () => {
    try {
        const response = await fetch(`${API_URL}/users/${currentUser._id}/increment`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to increment count');
        }
        
        // Refresh counts after incrementing
        fetchCounts();
        
        return data;
    } catch (error) {
        console.error('Error incrementing count:', error);
    }
};

// Send friend request
const sendFriendRequest = async (friendCode) => {
    try {
        const response = await fetch(`${API_URL}/friends/request`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ friendCode })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to send friend request');
        }
        
        return data;
    } catch (error) {
        throw error;
    }
};

// Accept friend request
const acceptFriendRequest = async (requestId) => {
    try {
        const response = await fetch(`${API_URL}/friends/accept`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ requestId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to accept friend request');
        }
        
        // Refresh data after accepting
        await fetchUserProfile();
        fetchFriendsStats();
        
        return data;
    } catch (error) {
        console.error('Error accepting friend request:', error);
    }
};

// Reject friend request
const rejectFriendRequest = async (requestId) => {
    try {
        const response = await fetch(`${API_URL}/friends/reject`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ requestId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to reject friend request');
        }
        
        // Refresh data after rejecting
        await fetchUserProfile();
        
        return data;
    } catch (error) {
        console.error('Error rejecting friend request:', error);
    }
};

// Fetch friend requests
const fetchFriendRequests = async () => {
    try {
        const userData = await fetchUserProfile();
        
        // Display friend requests if any
        if (userData.pendingFriendRequests && userData.pendingFriendRequests.length > 0) {
            friendRequestsSection.classList.remove('hidden');
            
            // Clear existing requests
            friendRequestsList.innerHTML = '';
            
            // Add each request
            userData.pendingFriendRequests.forEach(request => {
                const requestItem = document.createElement('div');
                requestItem.className = 'friend-request-item';
                
                requestItem.innerHTML = `
                    <p>Friend request from <strong>${request.from.username}</strong></p>
                    <div class="request-actions">
                        <button class="accept-btn small-btn">Accept</button>
                        <button class="reject-btn small-btn">Reject</button>
                    </div>
                `;
                
                // Add event listeners for accept/reject buttons
                const acceptBtn = requestItem.querySelector('.accept-btn');
                const rejectBtn = requestItem.querySelector('.reject-btn');
                
                acceptBtn.addEventListener('click', () => acceptFriendRequest(request._id));
                rejectBtn.addEventListener('click', () => rejectFriendRequest(request._id));
                
                friendRequestsList.appendChild(requestItem);
            });
        } else {
            friendRequestsSection.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error fetching friend requests:', error);
    }
};

// Fetch friends stats
const fetchFriendsStats = async () => {
    try {
        const filter = dateFilter.value;
        
        const response = await fetch(`${API_URL}/friends/stats?filter=${filter}`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch friend stats');
        }
        
        // Clear existing stats
        userStats.innerHTML = '';
        
        // Check if user has friends
        const hasFriends = data.some(user => !user.isSelf);
        
        if (!hasFriends) {
            noFriendsMessage.classList.remove('hidden');
            userStats.classList.add('hidden');
        } else {
            noFriendsMessage.classList.add('hidden');
            userStats.classList.remove('hidden');
            
            // Sort by total count (descending)
            data.sort((a, b) => b.totalCount - a.totalCount);
            
            // Create a card for each user
            data.forEach(user => {
                const userCard = document.createElement('div');
                userCard.className = user.isSelf ? 'user-stat-card self' : 'user-stat-card';
                
                let dateStatsHTML = '';
                
                // Add date stats if available
                if (user.dateCounts && user.dateCounts.length > 0) {
                    user.dateCounts.forEach(dateCount => {
                        dateStatsHTML += `
                            <div class="date-stat">
                                <span>${formatDate(dateCount.date)}</span>
                                <span>${dateCount.count}</span>
                            </div>
                        `;
                    });
                } else {
                    dateStatsHTML = '<p>No activity recorded</p>';
                }
                
                userCard.innerHTML = `
                    <h4>
                        ${user.username}
                        ${user.isSelf ? '<span class="self-label">You</span>' : ''}
                    </h4>
                    <p><strong>Total:</strong> ${user.totalCount}</p>
                    <div class="date-stats">
                        ${dateStatsHTML}
                    </div>
                `;
                
                userStats.appendChild(userCard);
            });
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching friend stats:', error);
    }
};

// Event Listeners
// Login form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }
    
    try {
        await loginUser(username, password);
        showDashboard();
        updateDashboard();
    } catch (error) {
        alert(error.message || 'Login failed. Please try again.');
    }
});

// Register button click
registerBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }
    
    // Basic validation
    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }
    
    try {
        await registerUser(username, password);
        alert('Registration successful! You can now log in.');
    } catch (error) {
        alert(error.message || 'Registration failed. Please try again.');
    }
});

// Increment button click
incrementBtn.addEventListener('click', async () => {
    await incrementCount();
});

// Copy friend code button
copyCodeBtn.addEventListener('click', () => {
    const friendCode = friendCodeSpan.textContent;
    
    // Use clipboard API if available
    if (navigator.clipboard) {
        navigator.clipboard.writeText(friendCode)
            .then(() => alert('Friend code copied to clipboard!'))
            .catch(err => console.error('Could not copy text: ', err));
    } else {
        // Fallback for older browsers
        const tempInput = document.createElement('input');
        tempInput.value = friendCode;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('Friend code copied to clipboard!');
    }
});

// Add friend button
addFriendBtn.addEventListener('click', async () => {
    const friendCode = friendCodeInput.value.trim();
    
    if (!friendCode) {
        alert('Please enter a friend code');
        return;
    }
    
    try {
        await sendFriendRequest(friendCode);
        alert('Friend request sent successfully!');
        friendCodeInput.value = '';
    } catch (error) {
        alert(error.message || 'Failed to send friend request');
    }
});

// Logout button
logoutBtn.addEventListener('click', () => {
    clearSession();
    showLoginForm();
});

// Date filter change
dateFilter.addEventListener('change', () => {
    fetchFriendsStats();
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved session
    const savedUser = localStorage.getItem('activityTrackerUser');
    const savedToken = localStorage.getItem('activityTrackerToken');
    
    if (savedUser && savedToken) {
        currentUser = JSON.parse(savedUser);
        authToken = savedToken;
        
        // Validate token by trying to fetch profile
        fetchUserProfile()
            .then(() => {
                showDashboard();
                updateDashboard();
            })
            .catch(() => {
                // If token is invalid, clear session and show login
                clearSession();
                showLoginForm();
            });
    } else {
        showLoginForm();
    }
});
