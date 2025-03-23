const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const path = require('path');

// Serve static files
app.use(express.static(__dirname));

// Handle SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://samosa:Laudalele@mine.nlznt.mongodb.net/?retryWrites=true&w=majority&appName=mine', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// User Schema with custom collection name
const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    friendCode: {
        type: String,
        default: () => uuidv4().substring(0, 8), // Generate a unique friend code
        unique: true
    },
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    pendingFriendRequests: [{
        from: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    sentFriendRequests: [{
        to: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
}, { collection: 'tracking_users' }); // Custom collection name

// Activity Count Schema with custom collection name
const activitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    count: {
        type: Number,
        default: 0
    }
}, { collection: 'tracking_counts' }); // Custom collection name

// Create indexes for efficient queries
activitySchema.index({ userId: 1, date: 1 }, { unique: true });

// Models
const User = mongoose.model('User', userSchema);
const Activity = mongoose.model('Activity', activitySchema);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'nfndsbufbjdzfausdHQ3I23U9Hlbjfaewfi238rhnlf';

// Authentication middleware
const authenticateUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

// Helper Functions
const getTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

// Routes

// Register a new user
app.post('/api/users/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Check if username already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const newUser = new User({
            username,
            password: hashedPassword
        });
        
        await newUser.save();
        
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login user
app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { id: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                _id: user._id,
                username: user.username,
                friendCode: user.friendCode,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user profile information
app.get('/api/users/profile', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user data with friend requests
        const user = await User.findById(userId)
            .populate('pendingFriendRequests.from', 'username')
            .populate('friends', 'username')
            .select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Send friend request
app.post('/api/friends/request', authenticateUser, async (req, res) => {
    try {
        const { friendCode } = req.body;
        const userId = req.user.id;
        
        // Find friend by friend code
        const friend = await User.findOne({ friendCode });
        
        if (!friend) {
            return res.status(404).json({ message: 'User with this friend code not found' });
        }
        
        // Check if trying to add self
        if (friend._id.toString() === userId) {
            return res.status(400).json({ message: 'Cannot add yourself as a friend' });
        }
        
        // Check if already friends
        if (friend.friends.includes(userId)) {
            return res.status(400).json({ message: 'You are already friends with this user' });
        }
        
        // Check if request already sent
        const requestAlreadySent = friend.pendingFriendRequests.some(req => 
            req.from.toString() === userId
        );
        
        if (requestAlreadySent) {
            return res.status(400).json({ message: 'Friend request already sent' });
        }
        
        // Add to pending requests
        friend.pendingFriendRequests.push({ from: userId });
        await friend.save();
        
        // Add to sent requests
        const currentUser = await User.findById(userId);
        currentUser.sentFriendRequests.push({ to: friend._id });
        await currentUser.save();
        
        res.json({ message: 'Friend request sent successfully' });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Accept friend request
app.post('/api/friends/accept', authenticateUser, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userId = req.user.id;
        
        // Find current user
        const currentUser = await User.findById(userId);
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Find the request
        const requestIndex = currentUser.pendingFriendRequests.findIndex(req => 
            req._id.toString() === requestId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Friend request not found' });
        }
        
        const friendId = currentUser.pendingFriendRequests[requestIndex].from;
        
        // Add to friends for both users
        currentUser.friends.push(friendId);
        
        // Remove from pending requests
        currentUser.pendingFriendRequests.splice(requestIndex, 1);
        await currentUser.save();
        
        // Update the other user
        const friend = await User.findById(friendId);
        
        if (friend) {
            friend.friends.push(userId);
            
            // Remove from sent requests
            const sentRequestIndex = friend.sentFriendRequests.findIndex(req => 
                req.to.toString() === userId
            );
            
            if (sentRequestIndex !== -1) {
                friend.sentFriendRequests.splice(sentRequestIndex, 1);
            }
            
            await friend.save();
        }
        
        res.json({ message: 'Friend request accepted' });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reject friend request
app.post('/api/friends/reject', authenticateUser, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userId = req.user.id;
        
        // Find current user
        const currentUser = await User.findById(userId);
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Find the request
        const requestIndex = currentUser.pendingFriendRequests.findIndex(req => 
            req._id.toString() === requestId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Friend request not found' });
        }
        
        const friendId = currentUser.pendingFriendRequests[requestIndex].from;
        
        // Remove from pending requests
        currentUser.pendingFriendRequests.splice(requestIndex, 1);
        await currentUser.save();
        
        // Update the other user's sent requests
        const friend = await User.findById(friendId);
        
        if (friend) {
            const sentRequestIndex = friend.sentFriendRequests.findIndex(req => 
                req.to.toString() === userId
            );
            
            if (sentRequestIndex !== -1) {
                friend.sentFriendRequests.splice(sentRequestIndex, 1);
                await friend.save();
            }
        }
        
        res.json({ message: 'Friend request rejected' });
    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user counts (today and total)
app.get('/api/users/:userId/counts', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user is accessing their own data
        if (req.user.id !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        
        const today = getTodayDate();
        
        // Get today's count
        const todayActivity = await Activity.findOne({
            userId,
            date: today
        });
        
        // Get total count
        const allActivities = await Activity.find({ userId });
        const totalCount = allActivities.reduce((sum, activity) => sum + activity.count, 0);
        
        res.json({
            todayCount: todayActivity ? todayActivity.count : 0,
            totalCount
        });
    } catch (error) {
        console.error('Get counts error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Increment user count
app.post('/api/users/:userId/increment', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Verify user is accessing their own data
        if (req.user.id !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        
        const today = getTodayDate();
        
        // Find or create today's activity record
        let todayActivity = await Activity.findOne({
            userId,
            date: today
        });
        
        if (todayActivity) {
            // Increment existing record
            todayActivity.count += 1;
            await todayActivity.save();
        } else {
            // Create new activity record for today
            todayActivity = new Activity({
                userId,
                date: today,
                count: 1
            });
            await todayActivity.save();
        }
        
        res.json({ message: 'Count incremented successfully' });
    } catch (error) {
        console.error('Increment count error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get friends stats - only friends' data will be shown
app.get('/api/friends/stats', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { filter } = req.query;
        const today = getTodayDate();
        let dateFilter = {};
        
        // Apply date filter
        if (filter === 'today') {
            dateFilter = { date: today };
        } else if (filter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            dateFilter = { date: { $gte: weekAgo } };
        } else if (filter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            dateFilter = { date: { $gte: monthAgo } };
        }
        
        // Get current user with friends
        const currentUser = await User.findById(userId).populate('friends');
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        // Get stats for the current user and their friends
        const friendIds = currentUser.friends.map(friend => friend._id);
        friendIds.push(userId); // Include the current user
        
        // Create list of users for the response
        const userList = [
            {
                _id: currentUser._id,
                username: currentUser.username,
                isSelf: true
            },
            ...currentUser.friends.map(friend => ({
                _id: friend._id,
                username: friend.username,
                isSelf: false
            }))
        ];
        
        // For each user, get their activities based on filter
        const userStats = await Promise.all(userList.map(async (user) => {
            // Get user's activities based on filter
            const activities = await Activity.find({
                userId: user._id,
                ...dateFilter
            }).sort({ date: -1 });
            
            // Calculate total count
            const totalCount = activities.reduce((sum, activity) => sum + activity.count, 0);
            
            // Format date counts for response
            const dateCounts = activities.map(activity => ({
                date: activity.date,
                count: activity.count
            }));
            
            return {
                _id: user._id,
                username: user.username,
                isSelf: user.isSelf,
                totalCount,
                dateCounts
            };
        }));
        
        res.json(userStats);
    } catch (error) {
        console.error('Get friend stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
