'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const {
    createUser,
    validateLogin,
    getUserId,
    getUsernameById,
    addFriend,
    getFriends
} = require('./db');

const app = express();
app.set('port', process.env.PORT || 3000);
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

// === Session State ===
let nicknames = {};         // socket.id -> username
let onlineUsers = new Set(); // username

function findSocketByUsername(username) {
    const id = Object.keys(nicknames).find(key => nicknames[key] === username);
    return id ? io.sockets.sockets.get(id) : null;
}

function updateFriendStatuses(user) {
    const userFriends = getFriends(user);
    userFriends.forEach(friend => {
        const friendSocket = findSocketByUsername(friend);
        if (friendSocket) {
            friendSocket.emit('friend_status_update', {
                friend: user,
                isOnline: onlineUsers.has(user)
            });
        }
    });
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('signup', ({ username, password }) => {
        const result = createUser(username, password);
        if (result.success) {
            nicknames[socket.id] = username;
            onlineUsers.add(username);
            socket.emit('auth_success', { username });
        } else {
            socket.emit('auth_error', { message: result.message });
        }
    });

    socket.on('login', ({ username, password }) => {
        const result = validateLogin(username, password);
        if (result.success) {
            nicknames[socket.id] = username;
            onlineUsers.add(username);
            socket.emit('auth_success', { username });

            // Send friend list on login
            const friends = getFriends(username);
            socket.emit('friend_list_update', { friends });
            updateFriendStatuses(username);
        } else {
            socket.emit('auth_error', { message: result.message });
        }
    });

    socket.on('friend_request', ({ from, to }) => {
        const toSocket = findSocketByUsername(to);
        if (toSocket) {
            toSocket.emit('friend_request_received', { from });
        }
    });

    socket.on('friend_response', ({ from, to, accept }) => {
        if (accept) {
            addFriend(from, to);
        }

        const fromFriends = getFriends(from);
        const toFriends = getFriends(to);

        const fromSocket = findSocketByUsername(from);
        const toSocket = findSocketByUsername(to);

        if (fromSocket) fromSocket.emit('friend_list_update', { friends: fromFriends });
        if (toSocket) toSocket.emit('friend_list_update', { friends: toFriends });

        updateFriendStatuses(from);
        updateFriendStatuses(to);
    });

    socket.on('request_friend_status', () => {
        const username = nicknames[socket.id];
        const userFriends = getFriends(username);
        userFriends.forEach(friend => {
            const isOnline = onlineUsers.has(friend);
            socket.emit('friend_status_update', { friend, isOnline });
        });
    });

    socket.on('disconnect', () => {
        const username = nicknames[socket.id];
        if (username) {
            onlineUsers.delete(username);
            updateFriendStatuses(username);
        }
        delete nicknames[socket.id];
        console.log(`Disconnected: ${socket.id}`);
    });
});

server.listen(app.get('port'), () => {
    console.log(`Server running at http://localhost:${app.get('port')}`);
});
