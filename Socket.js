const config = require('./Config')
const whitelist = [config.appURL]
if (process.env.APP_ENV === 'prod') whitelist.push(config.appURL2)
const axios = require('axios')
const socketServer = require('http').createServer()
const io = require('socket.io')(socketServer, { cors: { origin: whitelist } })

const users = []
const sockets = []
const rooms = []

// old
const gameRooms = []
const socketsToRooms = []
const maxPlayers = 10

io.on('connection', (socket) => {
    // account signals
    socket.on('log-in', (userId) => {
        console.log(999, 'connect', userId)
        if (userId) users[userId] = socket.id
        sockets[socket.id] = { id: userId, rooms: [] }
    })

    socket.on('log-out', (userId) => {
        delete users[userId]
    })

    socket.on('notification', (data) => {
        const { userId, notification } = data
        io.to(users[userId]).emit('notification', notification)
    })

    socket.on('disconnect', () => {
        const user = sockets[socket.id]
        console.log(999, 'disconnect', user)
        if (user) {
            // exit rooms
            user.rooms.forEach((roomId) => {
                io.in(roomId).emit('user-disconnected', user.id)
                rooms[roomId] = rooms[roomId].filter((u) => u.id !== user.id)
            })
            // delete records
            delete users[user.id]
            delete sockets[socket.id]
        }
    })

    // room signals
    socket.on('enter-room', (data) => {
        console.log(666, 'enter-room')
        const { roomId, user } = data
        // create room if not yet present
        if (!rooms[roomId]) rooms[roomId] = []
        // add room id to socket
        if (sockets[socket.id]) sockets[socket.id].rooms.push(roomId)
        // signal to other users in the room
        socket.to(roomId).emit('user-entering', user)
        // join the room
        socket.join(roomId)
        rooms[roomId].push(user)
        socket.emit('room-entered', rooms[roomId])
    })

    socket.on('exit-room', (data) => {
        const { roomId, userId } = data
        // notify other users
        socket.to(roomId).emit('user-exiting', userId)
        // exit room
        socket.leave(roomId)
        // remove user from room
        if (rooms[roomId]) rooms[roomId] = rooms[roomId].filter((u) => u.id !== userId)
        // remove room from socket rooms
        if (sockets[socket.id])
            sockets[socket.id].rooms = sockets[socket.id].rooms.filter((id) => id !== roomId)
    })

    // chats
    socket.on('user-started-typing', (data) => {
        const { roomId, user } = data
        // notify other users
        socket.to(roomId).emit('user-started-typing', user)
    })

    socket.on('user-stopped-typing', (data) => {
        const { roomId, user } = data
        // notify other users
        socket.to(roomId).emit('user-stopped-typing', user)
    })

    // game room signals (old)
    socket.on('outgoing-join-room', (data) => {
        const { roomId, userData } = data
        // create user object
        const user = { socketId: socket.id, userData }
        // if no room, create room
        if (!gameRooms[roomId]) gameRooms[roomId] = []
        // add user object to room
        gameRooms[roomId].push(user)
        // create socketToRoom record for use when user leaves room (is there a way to avoid this?)
        socketsToRooms[socket.id] = roomId
        // connect to room
        socket.join(roomId)
        // notify room of new user
        socket.to(roomId).emit('incoming-user-joined', user)
        // send room data back to new user
        const usersInRoom = gameRooms[roomId].filter((user) => user.socketId !== socket.id)
        socket.emit('incoming-room-joined', { socketId: socket.id, usersInRoom })
    })

    socket.on('outgoing-signal-request', (payload) => {
        io.to(payload.userToSignal).emit('incoming-signal-request', {
            signal: payload.signal,
            userSignaling: payload.userSignaling,
        })
    })

    socket.on('outgoing-signal', (payload) => {
        io.to(payload.userToSignal).emit('incoming-signal', {
            signal: payload.signal,
            id: socket.id,
        })
    })

    socket.on('outgoing-refresh-request', (payload) => {
        io.to(payload.userToSignal).emit('incoming-refresh-request', {
            signal: payload.signal,
            id: socket.id,
        })
    })

    socket.on('outgoing-comment', (data) => {
        io.in(data.roomId).emit('incoming-comment', data)
    })

    socket.on('outgoing-start-game', (data) => {
        const { userSignaling, roomId, postId } = data
        io.in(roomId).emit('incoming-start-game', data)
        const comment = {
            postId,
            text: `${userSignaling.name} started the game`,
        }
        axios
            .post(`${config.apiUrl}/glass-bead-game-comment`, comment)
            .catch((error) => console.log('error: ', error))
    })

    socket.on('outgoing-stop-game', (data) => {
        const { userSignaling, roomId, postId } = data
        io.in(roomId).emit('incoming-stop-game', data)
        const comment = { postId, text: `${userSignaling.name} stopped the game` }
        axios
            .post(`${config.apiUrl}/glass-bead-game-comment`, comment)
            .catch((error) => console.log('error: ', error))
    })

    socket.on('outgoing-save-game', (data) => {
        io.in(data.roomId).emit('incoming-save-game', data)
    })

    socket.on('outgoing-audio-bead', (data) => {
        io.in(data.roomId).emit('incoming-audio-bead', data)
    })

    socket.on('outgoing-new-topic-text', (data) => {
        io.in(data.roomId).emit('incoming-new-topic-text', data)
    })

    socket.on('outgoing-new-topic-image', (data) => {
        io.in(data.roomId).emit('incoming-new-topic-image', data)
    })

    socket.on('outgoing-new-background', (data) => {
        io.in(data.roomId).emit('incoming-new-background', data)
    })

    socket.on('outgoing-stream-disconnected', (data) => {
        io.in(data.roomId).emit('incoming-stream-disconnected', data)
    })

    socket.on('disconnecting', () => {
        // console.log('socket.rooms', socket.rooms)
    })

    // socket.on('disconnect', (data) => {
    //     // console.log(data)
    //     const roomId = socketsToRooms[socket.id]
    //     if (gameRooms[roomId]) {
    //         const user = gameRooms[roomId].find((users) => users.socketId === socket.id)
    //         io.in(roomId).emit('incoming-user-left', user)
    //         gameRooms[roomId] = gameRooms[roomId].filter((users) => users.socketId !== socket.id)
    //     }
    // })
})

socketServer.listen(5001)

module.exports = io
