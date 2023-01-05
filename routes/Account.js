require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const authenticateToken = require('../middleware/authenticateToken')
const { Space, User, Notification, SpaceUser, UserPost, Post, Weave } = require('../models')
const ScheduledTasks = require('../ScheduledTasks')
const { unseenNotifications } = require('../Helpers')

// GET
router.get('/account-data', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.findOne({
            where: { id: accountId },
            attributes: [
                'id',
                'name',
                'handle',
                'bio',
                'email',
                'flagImagePath',
                unseenNotifications,
            ],
        })
            .then((user) => res.status(200).send(user))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.get('/account-notifications', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Notification.findAll({
            where: { ownerId: accountId },
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: User,
                    as: 'triggerUser',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
                {
                    model: Space,
                    as: 'triggerSpace',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
                {
                    model: Space,
                    as: 'secondarySpace',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
                {
                    model: Post,
                    as: 'relatedPost',
                    include: [
                        {
                            model: Weave,
                            attributes: ['state'],
                            required: false,
                        },
                    ],
                },
            ],
        })
            .then((notifications) => res.send(notifications))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// POST
router.post('/update-account-name', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { payload } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ name: payload }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/update-account-bio', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { payload } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ bio: payload }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/update-account-email', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { payload } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ email: payload }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/mark-notifications-seen', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const ids = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Notification.update({ seen: true }, { where: { id: ids, ownerId: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// move to Space routes?
router.post('/respond-to-mod-invite', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { notificationId, userId, spaceId, response } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const createModRelationship =
            response === 'accepted'
                ? await SpaceUser.create({
                      relationship: 'moderator',
                      state: 'active',
                      spaceId,
                      userId: accountId,
                  })
                : null

        const updateNotification = await Notification.update(
            { state: response, seen: true },
            { where: { id: notificationId } }
        )

        const notifyUser = await Notification.create({
            ownerId: userId,
            type: 'mod-invite-response',
            state: response,
            seen: false,
            spaceAId: spaceId,
            userId: accountId,
        })

        Promise.all([createModRelationship, updateNotification, notifyUser])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-weave-invite', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, notificationId, response } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updateUserPostState = await UserPost.update(
            { state: response },
            { where: { postId, userId: accountId } }
        )

        const updateNotification = await Notification.update(
            { state: response },
            { where: { id: notificationId } }
        )

        Promise.all([updateUserPostState, updateNotification]).then(async () => {
            const post = await Post.findOne({
                where: { id: postId, state: 'visible' },
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'handle', 'email'],
                    },
                    {
                        model: Weave,
                        attributes: ['state', 'moveTimeWindow'],
                    },
                    {
                        model: User,
                        as: 'StringPlayers',
                        attributes: ['id', 'name', 'handle', 'email'],
                        through: {
                            where: { type: 'weave' },
                            attributes: ['index', 'state'],
                        },
                    },
                ],
            })

            if (post && post.Weave.state !== 'cancelled') {
                const players = post.StringPlayers.sort(
                    (a, b) => a.UserPost.index - b.UserPost.index
                )
                const respondingPlayer = post.StringPlayers.find((p) => p.id === accountId)
                const otherPlayers = post.StringPlayers.filter((p) => p.id !== accountId)
                // if player rejected: update weave state, notify other players
                if (response === 'rejected') {
                    const updateWeaveState = await Weave.update(
                        { state: 'cancelled' },
                        { where: { postId } }
                    )
                    const notifyOtherPlayers = await Promise.all(
                        otherPlayers.map(
                            (p) =>
                                new Promise(async (resolve) => {
                                    const notifyPlayer = await Notification.create({
                                        type: 'weave-rejected',
                                        ownerId: p.id,
                                        userId: accountId,
                                        postId: postId,
                                        seen: false,
                                    })
                                    const emailPlayer = await sgMail.send({
                                        to: p.email,
                                        from: {
                                            email: 'admin@weco.io',
                                            name: 'we { collective }',
                                        },
                                        subject: 'New notification',
                                        text: `
                                        Hi ${p.name}, ${respondingPlayer.name} has rejected their invitation to weave so the game is now cancelled.
                                        https://${config.appURL}/p/${postId}
                                    `,
                                        html: `
                                        <p>
                                            Hi ${p.name},
                                            <br/>
                                            <a href='${config.appURL}/u/${respondingPlayer.handle}'>${respondingPlayer.name}</a> has rejected 
                                            their invitation to weave so <a href='${config.appURL}/p/${postId}'>the game</a> is now cancelled.
                                        </p>
                                    `,
                                    })
                                    Promise.all([notifyPlayer, emailPlayer])
                                        .then(() => resolve())
                                        .catch((error) => resolve(error))
                                })
                        )
                    )
                    Promise.all([updateWeaveState, notifyOtherPlayers])
                        .then(() => res.status(200).json({ message: 'Success' }))
                        .catch((error) => res.status(500).json({ message: 'Error', error }))
                } else {
                    // if player accepted:
                    const notifyGameCreator = await Notification.create({
                        type: 'weave-accepted',
                        ownerId: post.Creator.id,
                        userId: accountId,
                        postId: postId,
                        seen: false,
                    })
                    const emailGameCreator = await sgMail.send({
                        to: post.Creator.email,
                        from: {
                            email: 'admin@weco.io',
                            name: 'we { collective }',
                        },
                        subject: 'New notification',
                        text: `
                                Hi ${post.Creator.name}, ${respondingPlayer.name} has accepted their invitation to your Weave.
                                https://${config.appURL}/p/${postId}
                            `,
                        html: `
                            <p>
                                Hi ${post.Creator.name},
                                <br/>
                                <a href='${config.appURL}/u/${respondingPlayer.handle}'>${respondingPlayer.name}</a> has accepted 
                                their invitation to your <a href='${config.appURL}/p/${postId}'>Weave</a>.
                            </p>
                        `,
                    })
                    Promise.all([notifyGameCreator, emailGameCreator]).then(async () => {
                        // if some players still pending: return
                        if (
                            otherPlayers.find((p) =>
                                ['pending', 'rejected'].includes(p.UserPost.state)
                            )
                        ) {
                            res.status(200).json({ message: 'Success' })
                        } else {
                            // if all players ready: update weave state and notify first player
                            const deadline = post.Weave.moveTimeWindow
                                ? new Date(
                                      new Date().getTime() + post.Weave.moveTimeWindow * 60 * 1000
                                  )
                                : null
                            const updateWeaveState = await Weave.update(
                                { state: 'active', nextMoveDeadline: deadline },
                                { where: { postId } }
                            )
                            const notifyFirstPlayer = await Notification.create({
                                type: 'weave-move',
                                ownerId: players[0].id,
                                postId: postId,
                                seen: false,
                            })
                            const emailFirstPlayer = await sgMail.send({
                                to: players[0].email,
                                from: {
                                    email: 'admin@weco.io',
                                    name: 'we { collective }',
                                },
                                subject: 'New notification',
                                text: `
                                        Hi ${players[0].name}, it's your move!
                                        Add a new bead to the weave on weco: https://${config.appURL}/p/${postId}
                                    `,
                                html: `
                                        <p>
                                            Hi ${players[0].name},
                                            <br/>
                                            It's your move!
                                            <br/>
                                            Add a new bead to the <a href='${config.appURL}/p/${postId}'>weave</a> on weco.
                                        </p>
                                    `,
                            })
                            const scheduleWeaveMoveJobs = post.Weave.moveTimeWindow
                                ? ScheduledTasks.scheduleWeaveMoveJobs(
                                      postId,
                                      players[0],
                                      1,
                                      deadline
                                  )
                                : null
                            Promise.all([
                                updateWeaveState,
                                notifyFirstPlayer,
                                emailFirstPlayer,
                                scheduleWeaveMoveJobs,
                            ])
                                .then(() => res.status(200).json({ message: 'Success' }))
                                .catch((error) => res.status(500).json({ message: 'Error', error }))
                        }
                    })
                }
            } else {
                res.status(200).json({ message: 'Game already cancelled' })
            }
        })
    }
})

module.exports = router
