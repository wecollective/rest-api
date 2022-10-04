require('dotenv').config()
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const authenticateToken = require('../middleware/authenticateToken')
const {
    defaultPostAttributes,
    findStartDate,
    findOrder,
    findPostType,
    findInitialPostAttributes,
    findPostWhere,
    findPostReactions,
    findAccountReactions,
    findPostInclude,
} = require('../Helpers')
const {
    Space,
    User,
    Post,
    Reaction,
    Link,
    PostImage,
    Event,
    GlassBeadGame,
    GlassBead,
    Weave,
    Inquiry,
    InquiryAnswer,
} = require('../models')

// GET
router.get('/all-users', (req, res) => {
    const { accountId, timeRange, userType, sortBy, sortOrder, searchQuery, limit, offset } =
        req.query

    function findFirstAttributes() {
        let firstAttributes = ['id']
        if (sortBy === 'Posts') {
            firstAttributes.push([
                sequelize.literal(`(
            SELECT COUNT(*)
                FROM Posts
                WHERE Posts.state = 'visible'
                AND Posts.creatorId = User.id
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
        .catch((err) => console.log(err))
})

router.get('/user-data', (req, res) => {
    const { userHandle } = req.query
    User.findOne({
        where: { handle: userHandle },
        attributes: ['id', 'handle', 'name', 'bio', 'flagImagePath', 'coverImagePath', 'createdAt'],
    })
        .then((user) => res.status(200).json(user))
        .catch((error) => res.status(200).json({ message: 'Error', error }))
})

router.get('/user-posts', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userId, timeRange, postType, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    let startDate = findStartDate(timeRange)
    let type = findPostType(postType)
    let order = findOrder(sortBy, sortOrder)
    let firstAttributes = findInitialPostAttributes(sortBy, accountId)
    let where = findPostWhere('user', userId, startDate, type, searchQuery)

    // Double query required to to prevent results and pagination being effected by top level where clause.
    // Intial query used to find correct posts with calculated stats and pagination applied.
    // Second query used to return related models.
    // Final function used to replace SpacePosts object with a simpler array.
    Post.findAll({
        subQuery: false,
        where,
        order,
        limit: Number(limit),
        offset: Number(offset),
        attributes: firstAttributes,
        having: { ['access']: 1 },
        include: [
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic'],
            },
        ],
    })
        .then((posts) => {
            return Post.findAll({
                where: { id: posts.map((post) => post.id) },
                attributes: [
                    ...defaultPostAttributes,
                    ...findPostReactions('Post'),
                    ...findAccountReactions('Post', accountId),
                ],
                order,
                include: findPostInclude(accountId),
            }).then((posts) => {
                posts.forEach((post) => {
                    post.DirectSpaces.forEach((space) => {
                        space.setDataValue('type', space.dataValues.SpacePost.type)
                        delete space.dataValues.SpacePost
                    })
                    post.IndirectSpaces.forEach((space) => {
                        space.setDataValue('type', space.dataValues.SpacePost.type)
                        delete space.dataValues.SpacePost
                    })
                    // convert SQL numeric booleans to JS booleans
                    post.setDataValue('accountLike', !!post.dataValues.accountLike)
                    post.setDataValue('accountRating', !!post.dataValues.accountRating)
                    post.setDataValue('accountRepost', !!post.dataValues.accountRepost)
                    post.setDataValue('accountLink', !!post.dataValues.accountLink)
                })
                return posts
            })
        })
        .then((data) => {
            res.json(data)
        })
        .catch((err) => console.log(err))
})

// POST
router.post('/find-people', (req, res) => {
    const { query, blacklist, spaceId } = req.body
    let where = {
        state: 'active',
        [Op.not]: [{ id: [0, ...blacklist] }],
        [Op.or]: [{ handle: { [Op.like]: `%${query}%` } }, { name: { [Op.like]: `%${query}%` } }],
    }
    let include = []
    if (spaceId) {
        where['$FollowedSpaces.id$'] = spaceId
        include.push({
            model: Space,
            as: 'FollowedSpaces',
            attributes: [],
            through: { where: { state: 'active' }, attributes: [] },
        })
    }
    User.findAll({
        where,
        include,
        limit: 20,
        attributes: ['id', 'handle', 'name', 'flagImagePath'],
        subQuery: false,
    }).then((users) => res.send(users))
})

module.exports = router
