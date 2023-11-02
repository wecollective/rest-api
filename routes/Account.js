require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const { Op } = sequelize
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const multer = require('multer')
const authenticateToken = require('../middleware/authenticateToken')
const ScheduledTasks = require('../ScheduledTasks')
const {
    Space,
    User,
    Notification,
    SpaceUser,
    UserUser,
    UserPost,
    Post,
    Comment,
    Stream,
    StreamSource,
    UserEvent,
    Link,
    Reaction,
    GlassBeadGame,
    Url,
    Image,
    ToyBoxRow,
    ToyBoxItem,
} = require('../models')
const {
    totalSpaceFollowers,
    totalSpaceComments,
    totalSpaceLikes,
    totalSpacePosts,
    totalUserPosts,
    totalUserComments,
    findStartDate,
    findPostOrder,
    findPostType,
    findInitialPostAttributes,
    findFullPostAttributes,
    findPostThrough,
    findPostInclude,
    multerParams,
    noMulterErrors,
    getToyboxItem,
} = require('../Helpers')

// GET
router.get('/account-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({
            where: { id: accountId },
            attributes: ['id', 'name', 'handle', 'bio', 'email', 'flagImagePath', 'emailsDisabled'],
        })
        const mutedUsers = await user.getMutedUsers({
            where: { state: 'active' },
            through: { where: { relationship: 'muted', state: 'active' } },
            attributes: ['id'],
        })
        const mutedUserIds = mutedUsers.map((u) => u.id)
        const where = { seen: false }
        if (mutedUsers.length) where[Op.not] = { userId: mutedUserIds }
        const unseenNotifications = await user.countNotifications({ where })
        res.status(200).json({ ...user.dataValues, mutedUsers: mutedUserIds, unseenNotifications })
    }
})

// router.get('/toybar-data', authenticateToken, async (req, res) => {
//     const accountId = req.user ? req.user.id : null
//     if (!accountId) res.status(401).json({ message: 'Unauthorized' })
//     else {
//         const user = await User.findOne({
//             where: { id: accountId },
//             include: {
//                 model: Stream,
//                 as: 'Streams',
//                 where: { state: 'active' },
//                 attributes: ['id', 'name', 'image'],
//                 required: false,
//             },
//         })
//         const spaces = await user.getFollowedSpaces({
//             where: { state: 'active' },
//             through: { where: { relationship: 'follower', state: 'active' } },
//             attributes: ['id', 'handle', 'name', 'flagImagePath'],
//             limit: 10,
//         })
//         const users = await user.getFollowedUsers({
//             where: { state: 'active' },
//             through: { where: { relationship: 'follower', state: 'active' } },
//             attributes: ['id', 'handle', 'name', 'flagImagePath'],
//             limit: 10,
//         })
//         res.json({ streams: user.Streams, spaces, users })
//     }
// })

router.get('/toybox-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { rowIndex } = req.query
        const row = await ToyBoxRow.findOne({
            where: { userId: accountId, index: +rowIndex, state: 'active' },
            attributes: ['id', 'index', 'name', 'image'],
            include: {
                model: ToyBoxItem,
                as: 'ToyBoxItems',
                where: { state: 'active' },
                attributes: ['index', 'itemType', 'itemId'],
                order: [['index', 'ASC']],
                required: false,
            },
            order: [[{ model: ToyBoxItem, as: 'ToyBoxItems' }, 'index', 'ASC']],
        })
        const items = row
            ? await Promise.all(row.ToyBoxItems.map((i) => getToyboxItem(i.itemType, i.itemId)))
            : []
        // if no row, return empty object with row index from query
        res.json({ row: row || { index: +rowIndex }, items })
    }
})

router.get('/streams', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const streams = await Stream.findAll({
            where: { ownerId: accountId, state: 'active' },
            attributes: ['id', 'name', 'image'],
        })
        res.json(streams)
    }
})

router.get('/stream-sources', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { type, id } = req.query
        if (type === 'custom') {
            const stream = await Stream.findOne({
                where: { id, ownerId: accountId, state: 'active' },
                attributes: ['id', 'name', 'image'],
            })
            if (!stream) res.status(404).json({ message: 'Stream not found' })
            else {
                const spaces = await stream.getSourceSpaces({
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    through: { where: { state: 'active', sourceType: 'space' }, attributes: [] },
                    includeIgnoreAttributes: false,
                    // limit: 10,
                })
                const users = await stream.getSourceUsers({
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    through: { where: { state: 'active', sourceType: 'user' }, attributes: [] },
                    includeIgnoreAttributes: false,
                    // limit: 10,
                })
                res.json({ stream, spaces, users })
            }
        } else {
            const user = await User.findOne({ where: { id: accountId }, attributes: ['id'] })
            const options = {
                where: { state: 'active' },
                through: { where: { relationship: 'follower', state: 'active' }, attributes: [] },
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                includeIgnoreAttributes: false,
                // limit: 10,
            }
            const spaces = ['all', 'spaces'].includes(type)
                ? await user.getFollowedSpaces(options)
                : []
            const users = ['all', 'people'].includes(type)
                ? await user.getFollowedUsers(options)
                : []
            res.json({ spaces, users })
        }
    }
})

router.get('/muted-users', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({ where: { id: accountId }, attributes: ['id'] })
        const mutedUsers = await user.getMutedUsers({
            where: { state: 'active' },
            through: { where: { relationship: 'muted', state: 'active' } },
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        })
        res.status(200).json(mutedUsers)
    }
})

// POST
router.post('/account-notifications', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { offset, includeSeen, mutedUsers } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const where = { ownerId: accountId }
        if (!includeSeen) where.seen = false
        if (mutedUsers.length) where[Op.not] = { userId: mutedUsers }
        Notification.findAll({
            where,
            order: [
                ['createdAt', 'DESC'],
                ['id', 'DESC'],
            ],
            limit: 10,
            offset: +offset,
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
                            model: User,
                            as: 'Creator',
                            attributes: ['name', 'flagImagePath'],
                        },
                        {
                            model: Space,
                            as: 'DirectSpaces',
                            required: false,
                            attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
                            through: {
                                where: { relationship: 'direct', type: 'post' },
                                attributes: [],
                            },
                        },
                        {
                            model: Url,
                            where: { state: 'active' },
                            attributes: ['url', 'image', 'title', 'description', 'domain'],
                            limit: 1,
                            required: false,
                        },
                        {
                            model: Image,
                            attributes: ['id', 'index', 'url', 'caption'],
                            limit: 6,
                            required: false,
                        },
                        {
                            model: GlassBeadGame,
                            attributes: ['topicImage', 'state'],
                            required: false,
                        },
                        {
                            model: Post,
                            as: 'CardSides',
                            attributes: ['id'],
                            through: {
                                where: { type: 'card-post', state: ['visible', 'account-deleted'] },
                                attributes: [],
                            },
                            include: {
                                model: Image,
                                attributes: ['id', 'url'],
                                required: false,
                            },
                            required: false,
                        },
                    ],
                },
                {
                    model: Comment,
                    as: 'relatedComment',
                    include: {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'flagImagePath'],
                    },
                },
            ],
        })
            .then((notifications) => res.send(notifications))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/toggle-emails-disabled', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { emailsDisabled } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ emailsDisabled: !emailsDisabled }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json(error))
    }
})

router.post('/followed-spaces', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { offset } = req.body
        const user = await User.findOne({ where: { id: accountId } })
        const followedSpaces = await user.getFollowedSpaces({
            where: { state: 'active' },
            through: { where: { relationship: 'follower', state: 'active' } },
            attributes: [
                'id',
                'handle',
                'name',
                'description',
                'flagImagePath',
                'coverImagePath',
                'privacy',
                totalSpaceFollowers,
                totalSpaceComments,
                totalSpaceLikes,
                totalSpacePosts,
            ],
            limit: 10,
            offset,
        })
        res.status(200).json(followedSpaces)
    }
})

router.post('/followed-people', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { offset } = req.body
        const user = await User.findOne({ where: { id: accountId } })
        const followedPeople = await user.getFollowedUsers({
            where: { state: 'active' },
            through: { where: { relationship: 'follower', state: 'active' } },
            attributes: [
                'id',
                'handle',
                'name',
                'bio',
                'flagImagePath',
                'coverImagePath',
                totalUserPosts,
                totalUserComments,
            ],
            limit: 10,
            offset,
        })
        res.status(200).json(followedPeople)
    }
})

router.post('/stream-posts', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const {
        type,
        id,
        filter,
        timeRange,
        postType,
        sortBy,
        depth,
        searchQuery,
        offset,
        mutedUsers,
    } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // get sources
        let spaces
        let users
        let streamFound = false
        if (type === 'custom') {
            const stream = await Stream.findOne({
                where: { id, ownerId: accountId, state: 'active' },
                attributes: ['id'],
            })
            if (!stream) res.status(404).json({ message: 'Stream not found' })
            else {
                streamFound = true
                spaces = await stream.getSourceSpaces({
                    attributes: ['id'],
                    through: { where: { state: 'active', sourceType: 'space' }, attributes: [] },
                    includeIgnoreAttributes: false,
                })
                users = await stream.getSourceUsers({
                    attributes: ['id'],
                    through: { where: { state: 'active', sourceType: 'user' }, attributes: [] },
                    includeIgnoreAttributes: false,
                })
            }
        } else {
            const user = await User.findOne({ where: { id: accountId }, attributes: ['id'] })
            const options = {
                where: { state: 'active' },
                through: { where: { relationship: 'follower', state: 'active' }, attributes: [] },
                attributes: ['id'],
                includeIgnoreAttributes: false,
            }
            spaces = ['all', 'spaces'].includes(type) ? await user.getFollowedSpaces(options) : []
            users = ['all', 'people'].includes(type) ? await user.getFollowedUsers(options) : []
        }
        if (streamFound || type !== 'custom') {
            // set up post options
            const order = findPostOrder(filter, sortBy)
            const include = spaces.length
                ? {
                      model: Space,
                      as: 'AllPostSpaces',
                      attributes: [],
                      through: findPostThrough(depth),
                  }
                : null
            const where = {
                state: 'visible',
                type: findPostType(postType),
                createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
            }
            if (mutedUsers.length) where[Op.not] = { creatorId: mutedUsers }
            if (spaces.length && users.length) {
                where[Op.or] = [
                    { creatorId: users.map((p) => p.id) },
                    { '$AllPostSpaces.id$': spaces.map((s) => s.id) },
                ]
            } else if (users.length) where.creatorId = users.map((p) => p.id)
            else if (spaces.length) where['$AllPostSpaces.id$'] = spaces.map((s) => s.id)
            // return empty array if no followed items
            if (!users.length && !spaces.length) res.status(200).json([])
            else {
                // get posts
                const emptyPosts = await Post.findAll({
                    where,
                    include,
                    attributes: findInitialPostAttributes(sortBy),
                    order,
                    subQuery: false,
                    limit: 10,
                    offset,
                    group: ['id'],
                })
                const postsWithData = await Post.findAll({
                    where: { id: emptyPosts.map((post) => post.id) },
                    attributes: findFullPostAttributes('Post', accountId),
                    order,
                    include: findPostInclude(accountId),
                })
                res.status(200).json(postsWithData)
            }
        }
    }
})

router.post('/create-stream', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        multer(multerParams('stream-image', accountId)).single('file')(req, res, async (error) => {
            const { file, body } = req
            if (noMulterErrors(error, res)) {
                const { name, spaceIds, userIds } = JSON.parse(body.data)
                // todo: if not already following, follow users and spaces
                const newStream = await Stream.create({
                    ownerId: accountId,
                    name,
                    image: file ? file.location : null,
                    state: 'active',
                })
                const createSpaceSources = await Promise.all(
                    spaceIds.map((id) =>
                        StreamSource.create({
                            streamId: newStream.id,
                            sourceType: 'space',
                            sourceId: id,
                            state: 'active',
                        })
                    )
                )
                const createUserSources = await Promise.all(
                    userIds.map((id) =>
                        StreamSource.create({
                            streamId: newStream.id,
                            sourceType: 'user',
                            sourceId: id,
                            state: 'active',
                        })
                    )
                )
                Promise.all([createSpaceSources, createUserSources])
                    .then(() => res.status(200).json(newStream))
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            }
        })
    }
})

router.post('/edit-stream', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        multer(multerParams('stream-image', accountId)).single('file')(req, res, async (error) => {
            const { file, body } = req
            if (noMulterErrors(error, res)) {
                const { streamId, name, spaceIds, userIds } = JSON.parse(body.data)
                const update = { name }
                if (file) update.image = file.location
                const updatedStream = await Stream.update(update, {
                    where: { id: streamId, ownerId: accountId },
                })
                if (!updatedStream) res.status(401).json({ message: 'Unauthorized' })
                else {
                    const removeOldSources = await StreamSource.update(
                        { state: 'deleted' },
                        { where: { streamId } }
                    )
                    // todo: if not already following, follow users and spaces
                    const createSpaceSources = await Promise.all(
                        spaceIds.map((id) =>
                            StreamSource.create({
                                streamId: streamId,
                                sourceType: 'space',
                                sourceId: id,
                                state: 'active',
                            })
                        )
                    )
                    const createUserSources = await Promise.all(
                        userIds.map((id) =>
                            StreamSource.create({
                                streamId: streamId,
                                sourceType: 'user',
                                sourceId: id,
                                state: 'active',
                            })
                        )
                    )
                    Promise.all([removeOldSources, createSpaceSources, createUserSources])
                        .then(() => res.status(200).json({ message: 'Success' }))
                        .catch((error) => res.status(500).json({ message: 'Error', error }))
                }
            }
        })
    }
})

router.post('/delete-stream', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { streamId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Stream.update({ state: 'deleted' }, { where: { id: streamId, ownerId: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/liked-posts', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { offset } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const likes = await Reaction.findAll({
            where: { creatorId: accountId, type: 'like', itemType: 'post', state: 'active' },
            attributes: ['itemId'],
            order: findPostOrder('New', 'Date Created'),
            subQuery: false,
            limit: 10,
            offset,
        })
        const posts = await Post.findAll({
            where: { id: likes.map((like) => like.itemId) },
            attributes: findFullPostAttributes('Post', accountId),
            include: findPostInclude(accountId),
        })
        // order posts by reaction date
        const orderedPosts = []
        likes.forEach((like) => {
            const post = posts.find((p) => p.id === like.itemId)
            orderedPosts.push(post)
        })
        res.status(200).json(orderedPosts)
    }
})

router.post('/update-account-name', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { name } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ name }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/update-account-bio', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { bio } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        User.update({ bio }, { where: { id: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: go through verification process before updating
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

router.post('/toggle-notification-seen', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { id, seen } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Notification.update({ seen }, { where: { id, ownerId: accountId }, silent: true })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/save-muted-users', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userIds } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({ where: { id: accountId }, attributes: ['id'] })
        const mutedUsers = await user.getMutedUsers({
            where: { state: 'active' },
            through: { where: { relationship: 'muted', state: 'active' } },
            attributes: ['id'],
        })
        const mutedUserIds = mutedUsers.map((u) => u.id)
        const unmutedUsers = mutedUserIds.filter((id) => !userIds.includes(id))
        const newlyMutedUsers = userIds.filter((id) => !mutedUserIds.includes(id))
        const unmuteUsers = await Promise.all(
            unmutedUsers.map((userId) =>
                UserUser.update(
                    { state: 'removed' },
                    {
                        where: {
                            relationship: 'muted',
                            state: 'active',
                            userAId: accountId,
                            userBId: userId,
                        },
                    }
                )
            )
        )
        const muteUsers = await Promise.all(
            newlyMutedUsers.map((userId) =>
                UserUser.create({
                    relationship: 'muted',
                    state: 'active',
                    userAId: accountId,
                    userBId: userId,
                })
            )
        )
        Promise.all([unmuteUsers, muteUsers])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: handle stat updates
router.post('/delete-account', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const removeAccountData = await User.update(
            {
                handle: null,
                name: null,
                email: null,
                password: null,
                bio: null,
                flagImagePath: null,
                coverImagePath: null,
                emailVerified: false,
                emailToken: null,
                passwordResetToken: null,
                accountVerified: null,
                state: 'deleted',
            },
            { where: { id: accountId } }
        )

        const removePosts = await Post.update(
            {
                state: 'account-deleted',
                text: null,
                url: null,
                urlImage: null,
                urlDomain: null,
                urlTitle: null,
                urlDescription: null,
                color: null,
            },
            { where: { creatorId: accountId } }
        )

        const removeComments = await Comment.update(
            {
                state: 'account-deleted',
                text: null,
            },
            { where: { creatorId: accountId } }
        )

        const removeLinks = await Link.update(
            { state: 'account-deleted', description: null },
            { where: { creatorId: accountId } }
        )

        // remove reposts? (would need to remove SpacePosts as well...)
        const removeReactions = await Reaction.update(
            { state: 'account-deleted', value: null },
            { where: { userId: accountId } }
        )

        // need to add creatorId to events so easily updateable
        // const removeEvents = await Event.update({
        //     state: 'deleted',
        //     title: null,
        // }, { where: { creatorId: accountId } })

        const removeUserEvents = await UserEvent.update(
            { state: 'account-deleted' },
            { where: { userId: accountId } }
        )

        Promise.all([
            removeAccountData,
            removePosts,
            removeComments,
            removeLinks,
            removeReactions,
            removeUserEvents,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/help-message', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { message, email } = req.body

    if (accountId) {
        const user = await User.findOne({
            where: { id: accountId },
            attributes: ['id', 'name', 'handle', 'email'],
        })
        sgMail
            .sendMultiple({
                to: ['james@weco.io', 'l.currie.clark@protonmail.com'],
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'Help request',
                text: `
                    Help request sent from ${user.name}: https://${config.appURL}/u/${user.handle} (email: ${user.email})
                    Message: "${message}"
                `,
                html: `
                    <div>
                        <p>Help request sent from <a href='${config.appURL}/u/${user.handle}'>${user.name}</a> (email: ${user.email})</p>
                        <p>Message:</p>
                        <p>"${message}"</p>
                    </div>
                `,
            })
            .then(() => res.status(200).json({ message: 'success' }))
    } else {
        sgMail
            .sendMultiple({
                to: ['james@weco.io', 'l.currie.clark@protonmail.com'],
                from: { email: 'admin@weco.io', name: 'we { collective }' },
                subject: 'Help request',
                text: `
                    Help request sent from anonymous user with email: ${email}
                    Message: "${message}"
                `,
                html: `
                    <div>
                        <p>Help request sent from anonymous user with email: ${email}</p>
                        <p>Message:</p>
                        <p>"${message}"</p>
                    </div>
                `,
            })
            .then(() => res.status(200).json({ message: 'success' }))
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
            { where: { id: notificationId }, silent: true }
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

router.post('/respond-to-gbg-invite', authenticateToken, async (req, res) => {
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
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    },
                    {
                        model: GlassBeadGame,
                        // attributes: ['state', 'moveTimeWindow'],
                    },
                    {
                        model: User,
                        as: 'Players',
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                        through: {
                            where: { type: 'glass-bead-game' },
                            attributes: ['index', 'state'],
                        },
                    },
                ],
            })

            if (post && post.GlassBeadGame.state !== 'cancelled') {
                const players = post.Players.sort((a, b) => a.UserPost.index - b.UserPost.index)
                const respondingPlayer = post.Players.find((p) => p.id === accountId)
                const otherPlayers = post.Players.filter((p) => p.id !== accountId)
                // if player rejected: update weave state, notify other players
                if (response === 'rejected') {
                    const updateWeaveState = await GlassBeadGame.update(
                        { state: 'cancelled' },
                        { where: { postId } }
                    )
                    const notifyOtherPlayers = await Promise.all(
                        otherPlayers.map(
                            (p) =>
                                new Promise(async (resolve) => {
                                    const notifyPlayer = await Notification.create({
                                        type: 'gbg-rejected',
                                        ownerId: p.id,
                                        userId: accountId,
                                        postId: postId,
                                        seen: false,
                                    })
                                    const emailPlayer = p.emailsDisabled
                                        ? null
                                        : await sgMail.send({
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
                        type: 'gbg-accepted',
                        ownerId: post.Creator.id,
                        userId: accountId,
                        postId: postId,
                        seen: false,
                    })
                    const emailGameCreator = post.Creator.emailsDisabled
                        ? null
                        : await sgMail.send({
                              to: post.Creator.email,
                              from: { email: 'admin@weco.io', name: 'we { collective }' },
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
                            const deadline = post.GlassBeadGame.moveTimeWindow
                                ? new Date(
                                      new Date().getTime() +
                                          post.GlassBeadGame.moveTimeWindow * 60 * 1000
                                  )
                                : null
                            const updateWeaveState = await GlassBeadGame.update(
                                { state: 'active', nextMoveDeadline: deadline },
                                { where: { postId } }
                            )
                            const notifyFirstPlayer = await Notification.create({
                                type: 'gbg-move',
                                ownerId: players[0].id,
                                postId: postId,
                                seen: false,
                            })
                            const emailFirstPlayer = players[0].emailsDisabled
                                ? null
                                : await sgMail.send({
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
                            const scheduleGBGMoveJobs = post.GlassBeadGame.moveTimeWindow
                                ? ScheduledTasks.scheduleGBGMoveJobs(
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
                                scheduleGBGMoveJobs,
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

router.post('/add-toybox-item', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { rowId, rowIndex, itemIndex, itemType, itemId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // if existing row: increment items > new item index
        // 0,1,2,3,4,5 --> 0,1,[6],2,3,4,5 (2-5)
        const incrementIndexes = rowId
            ? await ToyBoxItem.increment('index', {
                  where: {
                      userId: accountId,
                      rowId,
                      state: 'active',
                      index: { [Op.gte]: itemIndex },
                  },
              })
            : null
        // otherwise create new row
        const newRow = rowId
            ? null
            : await ToyBoxRow.create({
                  userId: accountId,
                  index: rowIndex,
                  state: 'active',
              })
        // add the new item
        const addItem = await ToyBoxItem.create({
            userId: accountId,
            rowId: rowId || newRow.id,
            index: itemIndex,
            itemType,
            itemId,
            state: 'active',
        })
        Promise.all([incrementIndexes, addItem])
            .then(() => res.status(200).json({ newRow }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/move-toybox-item', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { rowId, oldIndex, newIndex } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // store moved item to reposition after index updates
        const movedItem = await ToyBoxItem.findOne({
            where: {
                userId: accountId,
                rowId,
                state: 'active',
                index: oldIndex,
            },
            attributes: ['id'],
        })
        // if new position before old position: increment items >= new position && < old position
        // move left 4 --> 2 = 0,1,2,3,[4],5 --> 0,1,[4],2,3,5 (2-3)
        const incrementIndexes =
            newIndex < oldIndex
                ? await ToyBoxItem.increment('index', {
                      where: {
                          userId: accountId,
                          rowId,
                          state: 'active',
                          index: { [Op.between]: [newIndex, oldIndex] },
                      },
                  })
                : null
        // if new position after old position: decrement items > old position && <= new position
        // move right: 2 --> 4 = 0,1,[2],3,4,5 --> 0,1,3,4,[2],5 (3-4)
        const decrementIndexes =
            newIndex > oldIndex
                ? await ToyBoxItem.decrement('index', {
                      where: {
                          userId: accountId,
                          rowId,
                          state: 'active',
                          index: { [Op.between]: [oldIndex + 1, newIndex] },
                      },
                  })
                : null
        // update moved item index
        const moveItem = await movedItem.update(
            { index: newIndex },
            {
                where: {
                    userId: accountId,
                    rowId,
                    state: 'active',
                    index: oldIndex,
                },
            }
        )
        Promise.all([decrementIndexes, incrementIndexes, moveItem])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/delete-toybox-item', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { rowId, index } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // delete old item
        const deleteItem = await ToyBoxItem.update(
            { state: 'removed' },
            {
                where: {
                    userId: accountId,
                    rowId,
                    index,
                    state: 'active',
                },
            }
        )
        // decrement items > deleted items position (3-5)
        // 0,1,[2],3,4,5 --> 0,1,3,4,5
        const deccrementIndexes = await ToyBoxItem.decrement('index', {
            where: { userId: accountId, rowId, state: 'active', index: { [Op.gte]: index } },
        })
        Promise.all([deccrementIndexes, deleteItem])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/edit-toybox-row', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        multer(multerParams('toybox-row-image', accountId)).single('file')(
            req,
            res,
            async (error) => {
                const { file, body } = req
                if (noMulterErrors(error, res)) {
                    const { rowId, rowIndex, name } = JSON.parse(body.data)
                    const data = { name }
                    if (file) data.image = file.location
                    if (rowId) {
                        // update row
                        ToyBoxRow.update(data, { where: { id: rowId } })
                            .then(() => res.status(200).json({ message: 'Success' }))
                            .catch((error) => res.status(500).json({ message: 'Error', error }))
                    } else {
                        // create new row
                        ToyBoxRow.create({
                            ...data,
                            userId: accountId,
                            index: rowIndex,
                            state: 'active',
                        })
                            .then((newRow) => res.status(200).json({ newRow }))
                            .catch((error) => res.status(500).json({ message: 'Error', error }))
                    }
                }
            }
        )
    }
})

module.exports = router
