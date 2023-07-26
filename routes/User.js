require('dotenv').config()
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const authenticateToken = require('../middleware/authenticateToken')
const {
    findStartDate,
    findOrder,
    findPostType,
    findInitialPostAttributesWithAccess,
    findFullPostAttributes,
    findPostWhere,
    findPostInclude,
    totalUserPosts,
} = require('../Helpers')
const {
    Space,
    User,
    Post,
    Reaction,
    Link,
    Image,
    Event,
    GlassBeadGame,
    GlassBead,
    Weave,
    Poll,
    PollAnswer,
} = require('../models')

// GET
router.get('/all-users', (req, res) => {
    const { timeRange, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    function findFirstAttributes() {
        let firstAttributes = ['id']
        if (sortBy === 'Posts') {
            firstAttributes.push([
                sequelize.literal(`(
            SELECT COUNT(*)
                FROM Posts
                WHERE Posts.state = 'visible'
                AND Posts.creatorId = User.id
                AND Posts.type IN ('text', 'url', 'image', 'audio', 'event', 'poll', 'glass-bead-game')
            )`),
                'totalPosts',
            ])
        }
        if (sortBy === 'Comments') {
            firstAttributes.push([
                sequelize.literal(`(
            SELECT COUNT(*)
                FROM Comments
                WHERE Comments.creatorId = User.id
            )`),
                'totalComments',
            ])
        }
        return firstAttributes
    }

    let startDate = findStartDate(timeRange)
    let order = findOrder(sortBy, sortOrder)
    let firstAttributes = findFirstAttributes()

    User.findAll({
        where: {
            state: 'active',
            emailVerified: true,
            createdAt: { [Op.between]: [startDate, Date.now()] },
            [Op.or]: [
                { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { bio: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            ],
        },
        order,
        limit: Number(limit),
        offset: Number(offset),
        attributes: firstAttributes,
        subQuery: false,
    })
        .then((users) => {
            User.findAll({
                where: { id: users.map((user) => user.id) },
                attributes: [
                    'id',
                    'handle',
                    'name',
                    'bio',
                    'flagImagePath',
                    'coverImagePath',
                    'createdAt',
                    [
                        sequelize.literal(`(
                    SELECT COUNT(*)
                        FROM Posts
                        WHERE Posts.state = 'visible'
                        AND Posts.type IN ('text', 'url', 'images', 'audio', 'event', 'string', 'glass-bead-game', 'prism')
                        AND Posts.creatorId = User.id
                    )`),
                        'totalPosts',
                    ],
                    [
                        sequelize.literal(`(
                    SELECT COUNT(*)
                        FROM Comments
                        WHERE Comments.creatorId = User.id
                    )`),
                        'totalComments',
                    ],
                ],
                order,
                // include: []
            }).then((data) => {
                res.json(data)
            })
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/user-data', async (req, res) => {
    const { userHandle } = req.query
    const user = await User.findOne({
        where: { handle: userHandle, state: { [Op.not]: 'deleted' } },
        attributes: [
            'id',
            'handle',
            'name',
            'bio',
            'flagImagePath',
            'coverImagePath',
            'createdAt',
            totalUserPosts,
        ],
    })
    if (user) res.status(200).json(user)
    else res.status(404).json({ message: 'User not found' })
})

router.get('/user-posts', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userId, timeRange, postType, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    const startDate = findStartDate(timeRange)
    const type = findPostType(postType)
    const order = findOrder(sortBy, sortOrder)
    const where = findPostWhere('user', userId, startDate, type, searchQuery)
    const initialAttributes = findInitialPostAttributesWithAccess(sortBy, accountId)
    const fullAttributes = findFullPostAttributes('Post', accountId)

    // Double query used to prevent results being effected by top level where clause and reduce data load on joins.
    // Intial query used to find correct posts with pagination and sorting applied.
    // Second query used to return all related data and models.
    // todo: more testing to see if more effecient approaches available
    const emptyPosts = await Post.findAll({
        subQuery: false,
        where,
        order,
        limit: Number(limit),
        offset: Number(offset),
        attributes: initialAttributes,
        having: { ['access']: 1 },
        include: [
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic'],
            },
        ],
    })

    const postsWithData = await Post.findAll({
        where: { id: emptyPosts.map((post) => post.id) },
        attributes: fullAttributes,
        order,
        include: findPostInclude(accountId),
    })

    res.status(200).json(postsWithData)
})

// POST
router.post('/find-people', (req, res) => {
    const { query, spaceId, blacklist } = req.body
    let where = {
        state: 'active',
        [Op.or]: [{ handle: { [Op.like]: `%${query}%` } }, { name: { [Op.like]: `%${query}%` } }],
    }
    if (blacklist && blacklist.length) where[Op.not] = [{ id: blacklist }]
    let include = []
    if (spaceId) {
        where['$FollowedSpaces.id$'] = spaceId
        include.push({
            model: Space,
            as: 'FollowedSpaces',
            attributes: [],
            through: { where: { state: 'active', relationship: 'follower' }, attributes: [] },
        })
    }
    User.findAll({
        where,
        include,
        limit: 20,
        order: [
            [sequelize.literal(`User.handle = '${query}'`), 'DESC'],
            [sequelize.literal(`User.name = '${query}'`), 'DESC'],
            [sequelize.literal(`User.name LIKE '%${query}%'`), 'DESC'],
            [sequelize.literal(`POSITION('${query}' IN User.name)`), 'ASC'],
            // [sequelize.literal(`totalLikes`), 'DESC'],
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
        ],
        attributes: ['id', 'handle', 'name', 'flagImagePath', 'coverImagePath'],
        subQuery: false,
    }).then((users) => res.send(users))
})

module.exports = router
