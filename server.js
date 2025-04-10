// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

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
        default: () => uuidv4().substring(0, 8),
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
}, { collection: 'tracking_users' });

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
}, { collection: 'tracking_counts' });

activitySchema.index({ userId: 1, date: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Activity = mongoose.model('Activity', activitySchema);

const JWT_SECRET = process.env.JWT_SECRET;

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

const getTodayDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

const normalizeDate = (date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

app.post('/api/users/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
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

app.post('/api/users/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
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

app.get('/api/users/profile', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        
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

app.post('/api/friends/request', authenticateUser, async (req, res) => {
    try {
        const { friendCode } = req.body;
        const userId = req.user.id;
        
        const friend = await User.findOne({ friendCode });
        
        if (!friend) {
            return res.status(404).json({ message: 'User with this friend code not found' });
        }
        
        if (friend._id.toString() === userId) {
            return res.status(400).json({ message: 'Cannot add yourself as a friend' });
        }
        
        if (friend.friends.includes(userId)) {
            return res.status(400).json({ message: 'You are already friends with this user' });
        }
        
        const requestAlreadySent = friend.pendingFriendRequests.some(req => 
            req.from.toString() === userId
        );
        
        if (requestAlreadySent) {
            return res.status(400).json({ message: 'Friend request already sent' });
        }
        
        friend.pendingFriendRequests.push({ from: userId });
        await friend.save();
        
        const currentUser = await User.findById(userId);
        currentUser.sentFriendRequests.push({ to: friend._id });
        await currentUser.save();
        
        res.json({ message: 'Friend request sent successfully' });
    } catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/friends/accept', authenticateUser, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userId = req.user.id;
        
        const currentUser = await User.findById(userId);
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const requestIndex = currentUser.pendingFriendRequests.findIndex(req => 
            req._id.toString() === requestId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Friend request not found' });
        }
        
        const friendId = currentUser.pendingFriendRequests[requestIndex].from;
        
        currentUser.friends.push(friendId);
        currentUser.pendingFriendRequests.splice(requestIndex, 1);
        await currentUser.save();
        
        const friend = await User.findById(friendId);
        
        if (friend) {
            friend.friends.push(userId);
            
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

app.post('/api/friends/reject', authenticateUser, async (req, res) => {
    try {
        const { requestId } = req.body;
        const userId = req.user.id;
        
        const currentUser = await User.findById(userId);
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const requestIndex = currentUser.pendingFriendRequests.findIndex(req => 
            req._id.toString() === requestId
        );
        
        if (requestIndex === -1) {
            return res.status(404).json({ message: 'Friend request not found' });
        }
        
        const friendId = currentUser.pendingFriendRequests[requestIndex].from;
        
        currentUser.pendingFriendRequests.splice(requestIndex, 1);
        await currentUser.save();
        
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

app.get('/api/users/:userId/counts', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (req.user.id !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        
        const today = getTodayDate();
        
        const todayActivity = await Activity.findOne({
            userId,
            date: today
        });
        
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

app.post('/api/users/:userId/increment', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (req.user.id !== userId) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        
        const today = getTodayDate();
        
        const todayActivity = await Activity.findOneAndUpdate(
            { 
                userId, 
                date: today 
            }, 
            { 
                $inc: { count: 1 },
                $setOnInsert: { userId, date: today }
            }, 
            { 
                upsert: true,
                new: true
            }
        );
        
        res.json({ message: 'Count incremented successfully' });
    } catch (error) {
        console.error('Increment count error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/friends/stats', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { filter } = req.query;
        const today = getTodayDate();
        let dateFilter = {};
        
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
        
        const currentUser = await User.findById(userId).populate('friends');
        
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const friendIds = currentUser.friends.map(friend => friend._id);
        friendIds.push(userId);
        
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
        
        const userStats = await Promise.all(userList.map(async (user) => {
            const activities = await Activity.find({
                userId: user._id,
                ...dateFilter
            }).sort({ date: -1 });
            
            const totalCount = activities.reduce((sum, activity) => sum + activity.count, 0);
            
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
