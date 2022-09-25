require('dotenv').config()
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const authenticateToken = require('../middleware/authenticateToken')
const { postAttributes } = require('../GlobalConstants')
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

    function findStartDate() {
        let offset = undefined
        if (timeRange === 'Last Year') {
            offset = 24 * 60 * 60 * 1000 * 365
        }
        if (timeRange === 'Last Month') {
            offset = 24 * 60 * 60 * 1000 * 30
        }
        if (timeRange === 'Last Week') {
            offset = 24 * 60 * 60 * 1000 * 7
        }
        if (timeRange === 'Last 24 Hours') {
            offset = 24 * 60 * 60 * 1000
        }
        if (timeRange === 'Last Hour') {
            offset = 60 * 60 * 1000
        }
        let startDate = new Date()
        startDate.setTime(startDate.getTime() - offset)
        return startDate
    }

    function findOrder() {
        let direction, order
        if (sortOrder === 'Ascending') {
            direction = 'ASC'
        } else {
            direction = 'DESC'
        }
        if (sortBy === 'Date') {
            order = [['createdAt', direction]]
        } else {
            order = [[sequelize.literal(`total${sortBy}`), direction]]
        }
        return order
    }

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

    let startDate = findStartDate()
    let order = findOrder()
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
        include: [
            {
                model: Space,
                as: 'FollowedSpaces',
                attributes: ['handle', 'name', 'flagImagePath'],
                through: { where: { relationship: 'follower', state: 'active' }, attributes: [] },
            },
            {
                model: Space,
                as: 'ModeratedSpaces',
                attributes: ['handle', 'name', 'flagImagePath'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
            // {
            //     model: Comment,
            //     //attributes: ['creator', 'text', 'createdAt']
            // }
        ],
    })
        .then((user) => {
            res.json(user)
        })
        .catch((err) => console.log(err))
})

router.get('/user-posts', (req, res) => {
    const {
        accountId,
        userId,
        timeRange,
        postType,
        sortBy,
        sortOrder,
        searchQuery,
        limit,
        offset,
    } = req.query

    function findStartDate() {
        const hour = 60 * 60 * 1000
        const day = hour * 24
        let offset = undefined
        if (timeRange === 'Last Year') {
            offset = day * 365
        }
        if (timeRange === 'Last Month') {
            offset = day * 30
        }
        if (timeRange === 'Last Week') {
            offset = day * 7
        }
        if (timeRange === 'Last 24 Hours') {
            offset = day
        }
        if (timeRange === 'Last Hour') {
            offset = hour
        }
        var startDate = new Date()
        startDate.setTime(startDate.getTime() - offset)
        return startDate
    }

    function findType() {
        let type
        if (postType === 'All Types') {
            type = [
                'text',
                'url',
                'image',
                'audio',
                'event',
                'inquiry',
                'glass-bead-game',
                'string',
                'weave',
                'prism',
            ]
        }
        if (postType !== 'All Types') {
            type = postType.replace(/\s+/g, '-').toLowerCase()
        }
        return type
    }

    function findOrder() {
        let direction, order
        if (sortOrder === 'Ascending') {
            direction = 'ASC'
        } else {
            direction = 'DESC'
        }
        if (sortBy === 'Date') {
            order = [['createdAt', direction]]
        }
        if (sortBy === 'Reactions') {
            order = [[sequelize.literal(`totalReactions`), direction]]
        }
        if (sortBy !== 'Reactions' && sortBy !== 'Date') {
            order = [[sequelize.literal(`total${sortBy}`), direction]]
        }
        return order
    }

    function findFirstAttributes() {
        let firstAttributes = ['id']
        if (sortBy === 'Comments') {
            firstAttributes.push([
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = Post.id)`
                ),
                'totalComments',
            ])
        }
        if (sortBy === 'Reactions') {
            firstAttributes.push([
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type != 'vote' AND Reaction.state = 'active')`
                ),
                'totalReactions',
            ])
        }
        if (sortBy === 'Likes') {
            firstAttributes.push([
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
                ),
                'totalLikes',
            ])
        }
        if (sortBy === 'Ratings') {
            firstAttributes.push([
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
                ),
                'totalRatings',
            ])
        }
        if (sortBy === 'Reposts') {
            firstAttributes.push([
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'repost' AND Reaction.state = 'active')`
                ),
                'totalReposts',
            ])
        }
        return firstAttributes
    }

    function findWhere() {
        let where = {
            creatorId: userId,
            state: 'visible',
            createdAt: { [Op.between]: [startDate, Date.now()] },
            type,
        }
        if (searchQuery) {
            where[Op.or] = [
                { text: { [Op.like]: `%${searchQuery}%` } },
                { urlTitle: { [Op.like]: `%${searchQuery}%` } },
                { urlDescription: { [Op.like]: `%${searchQuery}%` } },
                { urlDomain: { [Op.like]: `%${searchQuery}%` } },
                { '$GlassBeadGame.topic$': { [Op.like]: `%${searchQuery}%` } },
            ]
        }
        return where
    }

    let startDate = findStartDate()
    let type = findType()
    let order = findOrder()
    let firstAttributes = findFirstAttributes()
    let where = findWhere()

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
        include: [
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic'],
            },
        ],
    })
        .then((posts) => {
            // Add account reaction data to post attributes
            let mainAttributes = [
                ...postAttributes,
                [
                    sequelize.literal(`(
                SELECT COUNT(*) > 0
                FROM Reactions
                AS Reaction
                WHERE Reaction.postId = Post.id
                AND Reaction.userId = ${accountId}
                AND Reaction.type = 'like'
                AND Reaction.state = 'active'
                )`),
                    'accountLike',
                ],
                [
                    sequelize.literal(`(
                SELECT COUNT(*) > 0
                FROM Reactions
                AS Reaction
                WHERE Reaction.postId = Post.id
                AND Reaction.userId = ${accountId}
                AND Reaction.type = 'rating'
                AND Reaction.state = 'active'
                )`),
                    'accountRating',
                ],
                [
                    sequelize.literal(`(
                SELECT COUNT(*) > 0
                FROM Reactions
                AS Reaction
                WHERE Reaction.postId = Post.id
                AND Reaction.userId = ${accountId}
                AND Reaction.type = 'repost'
                AND Reaction.state = 'active'
                )`),
                    'accountRepost',
                ],
                [
                    sequelize.literal(`(
                SELECT COUNT(*) > 0
                FROM Links
                AS Link
                WHERE Link.state = 'visible'
                AND Link.type != 'string-post'
                AND Link.creatorId = ${accountId}
                AND (Link.itemAId = Post.id OR Link.itemBId = Post.id)
                )`),
                    'accountLink',
                ],
            ]
            return Post.findAll({
                where: { id: posts.map((post) => post.id) },
                attributes: mainAttributes,
                order,
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                    {
                        model: Space,
                        as: 'DirectSpaces',
                        attributes: ['id', 'handle', 'name', 'state', 'flagImagePath'],
                        through: { where: { relationship: 'direct' }, attributes: ['type'] },
                    },
                    {
                        model: Space,
                        as: 'IndirectSpaces',
                        attributes: ['id', 'handle', 'name', 'state', 'flagImagePath'],
                        through: { where: { relationship: 'indirect' }, attributes: ['type'] },
                    },
                    {
                        model: PostImage,
                        required: false,
                    },
                    {
                        model: Event,
                        include: [
                            {
                                model: User,
                                as: 'Going',
                                through: { where: { relationship: 'going', state: 'active' } },
                            },
                            {
                                model: User,
                                as: 'Interested',
                                through: { where: { relationship: 'interested', state: 'active' } },
                            },
                        ],
                    },
                    {
                        model: Inquiry,
                        required: false,
                        include: [
                            {
                                model: InquiryAnswer,
                                required: false,
                                attributes: [
                                    'id',
                                    'text',
                                    'createdAt',
                                    // [
                                    //     sequelize.literal(`(
                                    // SELECT COUNT(*)
                                    // FROM Reactions
                                    // AS Reaction
                                    // WHERE Reaction.state = 'active'
                                    // AND Reaction.inquiryAnswerId = InquiryAnswer.id
                                    // )`),
                                    //     'totalVotes',
                                    // ],
                                ],
                                include: [
                                    {
                                        model: User,
                                        as: 'Creator',
                                        attributes: ['handle', 'name', 'flagImagePath'],
                                    },
                                    {
                                        model: Reaction,
                                        attributes: [
                                            'value',
                                            'state',
                                            'inquiryAnswerId',
                                            'createdAt',
                                            'updatedAt',
                                        ],
                                        required: false,
                                        include: [
                                            {
                                                model: User,
                                                as: 'Creator',
                                                attributes: [
                                                    'id',
                                                    'handle',
                                                    'name',
                                                    'flagImagePath',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        model: GlassBeadGame,
                        attributes: ['topic', 'topicGroup', 'topicImage'],
                        include: [
                            {
                                model: GlassBead,
                                order: [['index', 'ASC']],
                                include: [
                                    {
                                        model: User,
                                        as: 'user',
                                        attributes: ['handle', 'name', 'flagImagePath'],
                                    },
                                ],
                            },
                        ],
                    },
                    {
                        model: Post,
                        as: 'StringPosts',
                        attributes: [
                            'id',
                            'type',
                            'color',
                            'text',
                            'url',
                            'urlTitle',
                            'urlImage',
                            'urlDomain',
                            'urlDescription',
                            [
                                sequelize.literal(
                                    `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = StringPosts.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
                                ),
                                'totalLikes',
                            ],
                            [
                                sequelize.literal(
                                    `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = StringPosts.id)`
                                ),
                                'totalComments',
                            ],
                            [
                                sequelize.literal(
                                    `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'string-post' AND (Link.itemAId = StringPosts.id OR Link.itemBId = StringPosts.id))`
                                ),
                                'totalLinks',
                            ],
                            [
                                sequelize.literal(`(
                                SELECT COUNT(*) > 0
                                FROM Reactions
                                AS Reaction
                                WHERE Reaction.postId = StringPosts.id
                                AND Reaction.userId = ${accountId}
                                AND Reaction.type = 'like'
                                AND Reaction.state = 'active'
                                )`),
                                'accountLike',
                            ],
                            // todo: add account comment when set up
                            [
                                sequelize.literal(`(
                                SELECT COUNT(*) > 0
                                FROM Links
                                AS Link
                                WHERE Link.state = 'visible'
                                AND Link.type != 'string-post'
                                AND Link.creatorId = ${accountId}
                                AND (Link.itemAId = StringPosts.id OR Link.itemBId = StringPosts.id)
                                )`),
                                'accountLink',
                            ],
                        ],
                        through: {
                            where: { state: 'visible', type: 'string-post' },
                            attributes: ['index', 'relationship'],
                        },
                        required: false,
                        include: [
                            {
                                model: User,
                                as: 'Creator',
                                attributes: ['handle', 'name', 'flagImagePath'],
                            },
                            {
                                model: PostImage,
                                required: false,
                                attributes: ['caption', 'createdAt', 'id', 'index', 'url'],
                            },
                        ],
                    },
                    {
                        model: Weave,
                        attributes: [
                            'numberOfTurns',
                            'numberOfMoves',
                            'allowedBeadTypes',
                            'moveTimeWindow',
                            'nextMoveDeadline',
                            'audioTimeLimit',
                            'characterLimit',
                            'state',
                            'privacy',
                        ],
                        required: false,
                    },
                    {
                        model: User,
                        as: 'StringPlayers',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                        through: {
                            where: { type: 'weave' },
                            attributes: ['index', 'state', 'color'],
                        },
                        required: false,
                    },
                ],
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
