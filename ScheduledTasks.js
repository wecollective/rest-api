const config = require('./Config')
const schedule = require('node-schedule')
const sequelize = require('sequelize')
const { Op } = sequelize
const { User, Event, UserEvent, Notification, Post, Weave, GlassBeadGame } = require('./models')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

function scheduleEventNotification(data) {
    const {
        type,
        postId,
        eventId,
        userEventId,
        startTime,
        userId,
        userName,
        userEmail,
        emailsDisabled,
    } = data
    // calculate reminder time
    const offset = 1000 * 60 * 15 // 15 minutes
    const reminderTime = new Date(new Date(startTime).getTime() - offset)
    // schedule jobs
    if (reminderTime > new Date()) {
        schedule.scheduleJob(reminderTime, async () => {
            // check event still exists and user still going or interested
            const event = await Event.findOne({ where: { id: eventId, state: 'active' } })
            const userEvent = await UserEvent.findOne({
                where: { id: userEventId, state: 'active' },
            })
            if (event && userEvent) {
                // create notification
                Notification.create({
                    ownerId: userId,
                    type: `event-${type}-reminder`,
                    seen: false,
                    postId,
                })
                // send email
                const typeText = type === 'going' ? 'going to' : 'interested in'
                if (!emailsDisabled)
                    sgMail.send({
                        to: userEmail,
                        from: { email: 'admin@weco.io', name: 'we { collective }' },
                        subject: 'New notification',
                        text: `
                        Hi ${userName}, an event you marked yourself as ${typeText} is starting in 15 minutes:
                        http://${config.appURL}/p/${postId}
                    `,
                        html: `
                        <p>
                            Hi ${userName},
                            <br/>
                            <br/>
                            An <a href='${config.appURL}/p/${postId}'>event</a> you marked yourself as ${typeText} is starting in 15 minutes.
                        </p>
                    `,
                    })
            }
        })
    }
}

async function scheduleGBGMoveJobs(postId, player, moveNumber, deadline) {
    const reminderTime = new Date(deadline.getTime() - 15 * 60 * 1000) // 15 minutes before
    // schedule reminder
    if (reminderTime > new Date()) {
        schedule.scheduleJob(reminderTime, async () => {
            const post = await Post.findOne({
                where: { id: postId, state: 'active' },
                include: [
                    {
                        model: GlassBeadGame,
                        attributes: ['state'],
                    },
                    {
                        model: Post,
                        as: 'Beads',
                        required: false,
                        through: {
                            where: { state: 'active' },
                            attributes: ['index'],
                        },
                        include: {
                            model: User,
                            as: 'Creator',
                            attributes: ['id'],
                        },
                    },
                ],
            })
            if (post) {
                const beads = post.Beads.sort((a, b) => a.Link.index - b.Link.index)
                const moveTaken = beads.length >= moveNumber
                if (post.GlassBeadGame.state === 'active' && !moveTaken) {
                    // create notification
                    Notification.create({
                        ownerId: player.id,
                        type: 'gbg-move-reminder',
                        seen: false,
                        postId,
                    })
                    // send email
                    if (!player.emailsDisabled)
                        sgMail.send({
                            to: player.email,
                            from: { email: 'admin@weco.io', name: 'we { collective }' },
                            subject: 'New notification',
                            text: `
                            Hi ${player.name}, you have 15 minutes left to complete your move on this glass bead game:
                            http://${config.appURL}/p/${postId}
                            If you fail to do this, the game ends!
                        `,
                            html: `
                            <p>
                                Hi ${player.name},
                                <br/>
                                <br/>
                                You have 15 minutes left to complete your move on this <a href='${config.appURL}/p/${postId}'>glass bead game</a>.
                                <br/>
                                <br/>
                                If you fail to do this, the game ends!
                            </p>
                        `,
                        })
                }
            }
        })
    }
    // schedule deadline
    if (deadline > new Date()) {
        schedule.scheduleJob(deadline, async () => {
            const post = await Post.findOne({
                where: { id: postId, state: 'active' },
                include: [
                    {
                        model: GlassBeadGame,
                        attributes: ['state'],
                    },
                    {
                        model: User,
                        as: 'Players',
                        attributes: ['id', 'name', 'email', 'emailsDisabled'],
                        through: {
                            where: { type: 'glass-bead-game' },
                            attributes: ['index'],
                        },
                    },
                    {
                        model: Post,
                        as: 'Beads',
                        required: false,
                        through: {
                            where: { state: 'active' },
                            attributes: ['index'],
                        },
                        include: {
                            model: User,
                            as: 'Creator',
                            attributes: ['id', 'handle', 'name', 'flagImagePath'],
                        },
                    },
                ],
            })
            if (post) {
                const beads = post.Beads.sort((a, b) => a.Link.index - b.Link.index)
                const moveTaken = beads.length >= moveNumber
                if (post.GlassBeadGame.state === 'active' && !moveTaken) {
                    // cancel game and notify other players
                    const updateGBGState = await GlassBeadGame.update(
                        { state: 'cancelled', nextMoveDeadline: null },
                        { where: { postId } }
                    )
                    const notifyPlayers = await Promise.all[
                        post.Players.map(
                            (p) =>
                                new Promise(async (resolve) => {
                                    const createNotification = await Notification.create({
                                        ownerId: p.id,
                                        type: 'gbg-cancelled',
                                        userId: player.id,
                                        postId,
                                        seen: false,
                                    })
                                    const you = p.id === player.id
                                    const sendEmail = p.emailsDisabled
                                        ? null
                                        : await sgMail.send({
                                              to: p.email,
                                              from: {
                                                  email: 'admin@weco.io',
                                                  name: 'we { collective }',
                                              },
                                              subject: 'New notification',
                                              text: `
                                            Hi ${p.name}, ${
                                                  you ? 'You' : player.name
                                              } failed to make ${
                                                  you ? 'your' : 'their'
                                              } move in time on this glass bead game:
                                            http://${config.appURL}/p/${postId}
                                            The game has now ended!
                                        `,
                                              html: `
                                            <p>
                                                Hi ${p.name},
                                                <br/>
                                                <br/>
                                                ${you ? 'You' : player.name} failed to make ${
                                                  you ? 'your' : 'their'
                                              } move in time on <a href='${
                                                  config.appURL
                                              }/p/${postId}'>this glass bead game</a>.
                                                <br/>
                                                <br/>
                                                The game has now ended!
                                            </p>
                                        `,
                                          })
                                    Promise.all([createNotification, sendEmail])
                                        .then(() => resolve())
                                        .catch((error) => resolve(error))
                                })
                        )
                    ]
                    Promise.all([updateGBGState, notifyPlayers])
                }
            }
        })
    }
}

async function initializeScheduledTasks() {
    // events
    const upcomingEvents = await Event.findAll({
        where: { startTime: { [Op.gte]: new Date() }, state: 'active' },
        include: [
            {
                model: User,
                as: 'Going',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                through: {
                    where: { relationship: 'going', state: 'active' },
                    attributes: ['id'],
                },
            },
            {
                model: User,
                as: 'Interested',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                through: {
                    where: { relationship: 'interested', state: 'active' },
                    attributes: ['id'],
                },
            },
        ],
    })
    upcomingEvents.forEach((event) => {
        event.Going.forEach((user) =>
            scheduleEventNotification({
                type: 'going',
                postId: event.postId,
                eventId: event.id,
                userEventId: user.UserEvent.id,
                startTime: event.startTime,
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                emailsDisabled: user.emailsDisabled,
            })
        )
        event.Interested.forEach((user) =>
            scheduleEventNotification({
                type: 'interested',
                postId: event.postId,
                eventId: event.id,
                userEventId: user.UserEvent.id,
                startTime: event.startTime,
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                emailsDisabled: user.emailsDisabled,
            })
        )
    })
    // weave moves
    // todo: only grab games with nextMoveDeadline
    const gbgPosts = await Post.findAll({
        where: {
            state: 'active',
            type: 'glass-bead-game',
            '$GlassBeadGame.nextMoveDeadline$': { [Op.not]: null },
        },
        attributes: ['id'],
        include: [
            {
                model: GlassBeadGame,
                attributes: [
                    // 'privacy',
                    'state',
                    'movesPerPlayer',
                    'moveTimeWindow',
                    'nextMoveDeadline',
                    'playerOrder',
                ],
            },
            {
                model: User,
                as: 'Players',
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
                through: {
                    where: { type: 'glass-bead-game' },
                    attributes: ['index'],
                },
            },
            {
                model: Post,
                as: 'Beads',
                required: false,
                through: {
                    where: { state: 'active' },
                    attributes: [],
                },
            },
        ],
    })
    gbgPosts.forEach((gbg) => {
        const { id, Beads, Players } = gbg
        const { state, movesPerPlayer, moveTimeWindow, nextMoveDeadline, playerOrder } =
            gbg.GlassBeadGame
        const movesLeft = !movesPerPlayer || Beads.length < Players.length * movesPerPlayer
        if (
            state === 'active' &&
            Players.length > 0 &&
            moveTimeWindow &&
            movesLeft &&
            new Date(nextMoveDeadline) > new Date()
        ) {
            const order = playerOrder.split(',')
            const nextPlayerId = +order[Beads.length % Players.length]
            const nextPlayer = Players.find((p) => p.id === nextPlayerId)
            const moveNumber = Beads.length + 1
            if (nextPlayer) scheduleGBGMoveJobs(id, nextPlayer, moveNumber, nextMoveDeadline)
        }
    })
}

module.exports = {
    initializeScheduledTasks,
    scheduleEventNotification,
    scheduleGBGMoveJobs,
}
