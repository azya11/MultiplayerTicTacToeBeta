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

function updateFriendStatuses(username) {
    const friends = getFriends(username);

    friends.forEach(friend => {
        const friendSocket = findSocketByUsername(friend);
        if (friendSocket) {
            friendSocket.emit('friend_status_update', {
                friend: username,
                isOnline: onlineUsers.has(username)
            });
        }
    });
}

let rooms = {};  // roomCode => [player1Socket, player2Socket]
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // ==== GAME ROOM LOGIC ====
    socket.on('manual_logout', () => {
        const username = nicknames[socket.id];
        if (username) {
            onlineUsers.delete(username);
            updateFriendStatuses(username);
        }
    });

    socket.on('timeout', ({ room }) => {
        socket.to(room).emit('timeout_win');
        socket.emit('timeout_lose');
    });

    

    socket.on('create_room', () => {
        const roomCode = Math.random().toString(36).substring(2, 8);
        rooms[roomCode] = [socket];
        socket.join(roomCode);
        socket.emit('room_created', { roomCode });
    });

    socket.on('join_room', ({ roomCode }) => {
        if (rooms[roomCode] && rooms[roomCode].length === 1) {
            const player1 = rooms[roomCode][0];
            const player2 = socket;

            rooms[roomCode].push(player2);
            socket.join(roomCode);

            io.to(roomCode).emit('start', {
                room: roomCode,
                players: [
                    { id: player1.id, name: nicknames[player1.id] || "Player 1" },
                    { id: player2.id, name: nicknames[player2.id] || "Player 2" }
                ]
            });
        } else {
            socket.emit('join_error', { message: 'Room not found or full.' });
        }
    });

    socket.on('move', ({ room, board }) => {
        socket.to(room).emit('update', board);
    });

    socket.on('restart', ({ room }) => {
        io.to(room).emit('restart');
    });


    // ==== GLOBAL CHAT ====
    socket.on('chat', ({ sender, message }) => {
        if (sender && message?.trim()) {
            io.emit('chat', { sender, message: message.trim() });
        }
    });

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
