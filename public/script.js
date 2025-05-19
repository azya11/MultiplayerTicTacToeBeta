const socket = io();
let nickname = '';
let isLoggedIn = false;

function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) return alert("Enter username and password");
    socket.emit('login', { username, password });
}

function signup() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) return alert("Enter username and password");
    socket.emit('signup', { username, password });
}

function logout() {
    nickname = '';
    isLoggedIn = false;
    document.getElementById('auth').style.display = 'block';
    document.getElementById('logoutButton').style.display = 'none';
    document.getElementById('friendList').innerHTML = '';
    document.getElementById('requestList').innerHTML = '';
}

socket.on('auth_success', ({ username }) => {
    nickname = username;
    isLoggedIn = true;
    document.getElementById('auth').style.display = 'none';
    document.getElementById('logoutButton').style.display = 'block';
    socket.emit('request_friend_status');
});

socket.on('auth_error', ({ message }) => {
    alert(message);
});

function sendFriendRequest() {
    const target = document.getElementById('friendInput').value.trim();
    if (!target || !nickname || !isLoggedIn) return;
    socket.emit('friend_request', { from: nickname, to: target });
}

function respondFriend(from, accept) {
    socket.emit('friend_response', { from, to: nickname, accept });
    const el = document.getElementById(`request-${from}`);
    if (el) el.remove();
}

socket.on('friend_request_received', ({ from }) => {
    const list = document.getElementById('requestList');
    const li = document.createElement('li');
    li.id = `request-${from}`;
    li.innerHTML = `${from} 
    <button onclick="respondFriend('${from}', true)">Accept</button>
    <button onclick="respondFriend('${from}', false)">Reject</button>`;
    list.appendChild(li);
});

socket.on('friend_list_update', ({ friends }) => {
    const list = document.getElementById('friendList');
    list.innerHTML = '';
    friends.forEach(f => {
        const li = document.createElement('li');
        li.id = `friend-${f}`;
        li.innerHTML = `${f} <span id="status-${f}" style="color: gray;">(unknown)</span>`;
        list.appendChild(li);
    });
});

socket.on('friend_status_update', ({ friend, isOnline }) => {
    const statusSpan = document.getElementById(`status-${friend}`);
    if (statusSpan) {
        statusSpan.textContent = isOnline ? "(online)" : "(offline)";
        statusSpan.style.color = isOnline ? "green" : "red";
    }
});

// Periodically refresh friend statuses
setInterval(() => {
    if (nickname && isLoggedIn) {
        socket.emit('request_friend_status');
    }
}, 5000);
