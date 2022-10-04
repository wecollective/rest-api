require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const { v4: uuidv4 } = require('uuid')
const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const authenticateToken = require('../middleware/authenticateToken')
const {
    Space,
    SpaceParent,
    SpaceAncestor,
    SpaceUser,
    User,
    Post,
    Link,
    Notification,
    GlassBeadGame,
    Event,
    PostImage,
} = require('../models')
const {
    defaultPostAttributes,
    totalSpaceFollowers,
    totalSpaceComments,
    totalSpaceReactions,
    totalSpaceLikes,
    totalSpaceRatings,
    totalSpacePosts,
    totalSpaceChildren,
    totalUserPosts,
    totalUserComments,
    asyncForEach,
    findStartDate,
    findOrder,
    findPostType,
    findInitialPostAttributes,
    findPostThrough,
    findPostWhere,
    findPostReactions,
    findAccountReactions,
    findPostInclude,
} = require('../Helpers')

const spaceAttributes = [
    'id',
    'handle',
    'name',
    'description',
    'privacy',
    'flagImagePath',
    'coverImagePath',
    'createdAt',
    totalSpaceFollowers,
    totalSpaceComments,
    totalSpaceReactions,
    totalSpaceLikes,
    totalSpaceRatings,
    totalSpacePosts,
    totalSpaceChildren,
]

const userAttributes = [
    'id',
    'handle',
    'name',
    'bio',
    'flagImagePath',
    'coverImagePath',
    'createdAt',
    totalUserPosts,
    totalUserComments,
]

const firstGenLimit = 7
const secondGenLimit = 3
const thirdGenLimit = 3
const fourthGenLimit = 3

function findSpaceFirstAttributes(sortBy) {
    let firstAttributes = ['id']
    if (sortBy === 'Followers') firstAttributes.push(totalSpaceFollowers)
    if (sortBy === 'Posts') firstAttributes.push(totalSpacePosts)
    if (sortBy === 'Comments') firstAttributes.push(totalSpaceComments)
    if (sortBy === 'Reactions') firstAttributes.push(totalSpaceReactions)
    if (sortBy === 'Likes') firstAttributes.push(totalSpaceLikes)
    if (sortBy === 'Ratings') firstAttributes.push(totalSpaceRatings)
    return firstAttributes
}

function findSpaceWhere(spaceId, depth, timeRange, searchQuery) {
    let where
    if (depth === 'All Contained Spaces') {
        where = {
            '$SpaceAncestors.id$': spaceId,
            state: 'active',
            createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
            [Op.or]: [
                { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { description: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            ],
        }
    }
    if (depth === 'Only Direct Descendants') {
        where = {
            '$DirectParentSpaces.id$': spaceId,
            state: 'active',
            createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
            [Op.or]: [
                { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { description: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            ],
        }
    }
    return where
}

function findSpaceInclude(depth) {
    let include
    if (depth === 'All Contained Spaces') {
        include = [
            {
                model: Space,
                as: 'SpaceAncestors',
                attributes: [],
                through: { attributes: [], where: { state: 'open' } },
            },
        ]
    }
    if (depth === 'Only Direct Descendants') {
        include = [
            {
                model: Space,
                as: 'DirectParentSpaces',
                attributes: [],
                through: { attributes: [], where: { state: 'open' } },
            },
        ]
    }
    return include
}

function findUserFirstAttributes(sortBy) {
    let firstAttributes = ['id']
    if (sortBy === 'Posts') firstAttributes.push(totalUserPosts)
    if (sortBy === 'Comments') firstAttributes.push(totalUserComments)
    return firstAttributes
}

function findTotalSpaceResults(depth, searchQuery, timeRange) {
    function formatDate(date) {
        const d = new Date(date).toISOString().split(/[-T:.]/)
        return `${d[0]}-${d[1]}-${d[2]} ${d[3]}:${d[4]}:${d[5]}`
    }
    const startDate = formatDate(findStartDate(timeRange))
    const now = formatDate(new Date())

    if (depth === 'All Contained Spaces') {
        return [
            sequelize.literal(`(
            SELECT COUNT(*)
                FROM Spaces s
                WHERE s.id != Space.id
                AND s.id IN (
                    SELECT SpaceAncestors.spaceBId
                    FROM SpaceAncestors
                    RIGHT JOIN Spaces
                    ON SpaceAncestors.spaceBId = Spaces.id
                    WHERE SpaceAncestors.spaceAId = Space.id
                    AND SpaceAncestors.state = 'open'
                ) AND (
                    s.handle LIKE '%${searchQuery}%'
                    OR s.name LIKE '%${searchQuery}%'
                    OR s.description LIKE '%${searchQuery}%'
                ) AND s.createdAt BETWEEN '${startDate}' AND '${now}'
            )`),
            'totalResults',
        ]
    } else {
        return [
            sequelize.literal(`(
            SELECT COUNT(*)
                FROM Spaces s
                WHERE s.id IN (
                    SELECT vhr.spaceBId
                    FROM SpaceParents vhr
                    RIGHT JOIN Spaces
                    ON vhr.spaceAId = Space.id
                    WHERE vhr.state = 'open'
                ) AND (
                    s.handle LIKE '%${searchQuery}%'
                    OR s.name LIKE '%${searchQuery}%'
                    OR s.description LIKE '%${searchQuery}%'
                ) AND s.createdAt BETWEEN '${startDate}' AND '${now}'
            )`),
            'totalResults',
        ]
    }
}

// GET
router.get('/homepage-highlights', async (req, res) => {
    const totals = Space.findOne({
        where: { id: 1 },
        attributes: [
            [
                sequelize.literal(`(SELECT COUNT(*) FROM Posts WHERE Posts.state = 'visible')`),
                'totalPosts',
            ],
            [
                sequelize.literal(`(SELECT COUNT(*) FROM Spaces WHERE Spaces.state = 'active')`),
                'totalSpaces',
            ],
            [
                sequelize.literal(
                    `(SELECT COUNT(*) FROM Users WHERE Users.emailVerified = true AND Users.state = 'active')`
                ),
                'totalUsers',
            ],
        ],
    })

    const posts = Post.findAll({
        where: {
            state: 'visible',
            urlImage: { [Op.ne]: null },
        },
        attributes: ['urlImage'],
        order: [['createdAt', 'DESC']],
        limit: 3,
    })

    const spaces = Space.findAll({
        where: {
            state: 'active',
            flagImagePath: { [Op.ne]: null },
        },
        attributes: ['flagImagePath'],
        order: [['createdAt', 'DESC']],
        limit: 3,
    })

    const users = User.findAll({
        where: {
            state: 'active',
            emailVerified: true,
            flagImagePath: { [Op.ne]: null },
        },
        attributes: ['flagImagePath'],
        order: [['createdAt', 'DESC']],
        limit: 3,
    })

    Promise.all([totals, posts, spaces, users]).then((data) =>
        res.send({
            totals: data[0],
            posts: data[1].map((p) => p.urlImage),
            spaces: data[2].map((s) => s.flagImagePath),
            users: data[3].map((u) => u.flagImagePath),
        })
    )
})

router.get('/db-update', authenticateToken, async (req, res) => {
    const invalidToken = !req.user
    const accountId = invalidToken ? null : req.user.id
    console.log('db-update!', accountId)
    res.status(200).json({ message: 'Success' })
    // test descendents
    // const childId = 45 // 'holonics'
    // const descendants = await Space.findAll({
    //     attributes: ['id'],
    //     where: {
    //         [Op.or]: {
    //             id: childId,
    //             '$SpaceAncestors.id$': childId,
    //         },
    //         state: 'active',
    //     },
    //     include: {
    //         model: Space,
    //         as: 'SpaceAncestors',
    //         attributes: ['id'],
    //         // op.or open/closed
    //         through: { attributes: ['state'], where: { state: 'open' } },
    //     },
    // })
    // res.status(200).send(descendants)

    // convert old 'closed' ancestors to 'removed'
    // SpaceAncestor.update({ state: 'removed' }, { where: { state: 'closed' } })
    //     .then(() => {
    //         res.status(200).json({ message: 'Success' })
    //     })
    //     .catch((error) => res.status(500).json({ message: 'Error', error }))

    // remove self matching spaceAncestors:
    // SpaceAncestor.findAll().then((ancestors) => {
    //     Promise.all(
    //         ancestors.map(
    //             async (a) =>
    //                 await new Promise((resolve) => {
    //                     if (a.spaceAId === a.spaceBId) {
    //                         SpaceAncestor.update({ state: 'removed' }, { where: { id: a.id } })
    //                             .then(() => resolve())
    //                             .catch((error) => {
    //                                 console.log(error)
    //                                 resolve()
    //                             })
    //                     } else resolve()
    //                 })
    //         )
    //     )
    //         .then(() => {
    //             res.status(200).json({ message: 'Success' })
    //         })
    //         .catch((error) => res.status(500).json({ message: 'Error', error }))
    // })
})

// todo: clean up like post routes
router.get('/space-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { handle } = req.query

    const totalSpaces = [
        sequelize.literal(`(
        SELECT COUNT(*)
            FROM Spaces
            WHERE Spaces.handle != Space.handle
            AND Spaces.state = 'active'
            AND Spaces.id IN (
                SELECT SpaceAncestors.spaceBId
                FROM SpaceAncestors
                RIGHT JOIN Spaces
                ON SpaceAncestors.spaceBId = Spaces.id
                WHERE SpaceAncestors.spaceAId = Space.id
            )
        )`),
        'totalSpaces',
    ]
    const totalPosts = [
        sequelize.literal(`(
        SELECT COUNT(*)
            FROM Posts
            WHERE Posts.state = 'visible'
            AND Posts.id IN (
                SELECT SpacePosts.postId
                FROM SpacePosts
                RIGHT JOIN Posts
                ON SpacePosts.postId = Posts.id
                WHERE SpacePosts.spaceId = Space.id
            )
        )`),
        'totalPosts',
    ]
    const totalUsers = [
        handle === 'all'
            ? sequelize.literal(
                  `(SELECT COUNT(*) FROM Users WHERE Users.emailVerified = true AND Users.state = 'active')`
              )
            : sequelize.literal(`(
                SELECT COUNT(*)
                    FROM Users
                    WHERE Users.emailVerified = true
                    AND Users.state = 'active'
                    AND Users.id IN (
                        SELECT SpaceUsers.userId
                        FROM SpaceUsers
                        RIGHT JOIN Users
                        ON SpaceUsers.userId = Users.id
                        WHERE SpaceUsers.spaceId = Space.id
                        AND SpaceUsers.state = 'active'
                    )
                )`),
        'totalUsers',
    ]
    const spaceAccess = [
        // checks direct access to space
        sequelize.literal(`(
            SELECT SpaceUsers.state
            FROM SpaceUsers
            WHERE SpaceUsers.userId = ${accountId}
            AND (SpaceUsers.relationship = 'access' OR SpaceUsers.relationship = 'pending')
            AND SpaceUsers.state = 'active'
            AND SpaceUsers.spaceId = Space.id
        )`),
        'spaceAccess',
    ]
    const ancestorAccess = [
        // checks number of private ancestors = number of those ancestors user has access to
        // todo: find more efficient query
        sequelize.literal(`(
            (SELECT COUNT(*)
                FROM Spaces
                    WHERE Spaces.state = 'active'
                    AND Spaces.privacy = 'private'
                    AND Spaces.id IN (
                        SELECT SpaceAncestors.spaceAId
                        FROM SpaceAncestors
                        RIGHT JOIN Spaces
                        ON SpaceAncestors.spaceBId = Space.id
                    )
            )
            = 
            (SELECT COUNT(*)
                FROM SpaceUsers
                WHERE SpaceUsers.userId = ${accountId}
                AND SpaceUsers.state = 'active'
                AND SpaceUsers.relationship = 'access'
                AND SpaceUsers.spaceId IN (
                    SELECT Spaces.id
                    FROM Spaces
                    WHERE Spaces.state = 'active'
                    AND Spaces.privacy = 'private'
                    AND Spaces.id IN (
                        SELECT SpaceAncestors.spaceAId
                        FROM SpaceAncestors
                        RIGHT JOIN Spaces
                        ON SpaceAncestors.spaceBId = Space.id
                    )
                )
            )
        )`),
        'ancestorAccess',
    ]
    const spaceData = await Space.findOne({
        where: { handle: handle, state: 'active' },
        attributes: [
            'id',
            'privacy',
            'handle',
            'name',
            'description',
            'flagImagePath',
            'coverImagePath',
            'createdAt',
            totalSpaces,
            totalPosts,
            totalUsers,
            spaceAccess,
            ancestorAccess,
        ],
        include: [
            // todo: remove DirectParentSpaces and retrieve seperately where needed
            {
                model: Space,
                as: 'DirectParentSpaces',
                attributes: [
                    'id',
                    'handle',
                    'name',
                    'description',
                    'flagImagePath',
                    totalSpaceChildren,
                ],
                through: { where: { state: 'open' }, attributes: [] },
            },
            // todo: remove and retrieve on about page
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            // todo: remove and retrieve on necissary pages/modals
            {
                model: User,
                as: 'Moderators',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        ],
    })

    if (!spaceData) res.status(404).send({ message: 'Space not found' })
    else {
        // check user access
        const { privacy, spaceAccess, ancestorAccess } = spaceData.dataValues
        let access = 'blocked'
        if (privacy === 'public') access = ancestorAccess ? 'granted' : 'blocked-by-ancestor'
        else if (spaceAccess) access = spaceAccess === 'active' ? 'granted' : 'pending'
        spaceData.setDataValue('access', access)
        delete spaceData.dataValues.spaceAccess
        delete spaceData.dataValues.ancestorAccess
        // todo: retreive after space data has loaded and only when side bar nav visible or needed in modals
        // child spaces retrieved seperately so limit and order can be applied (not allowed for M:M includes in Sequelize)
        const childSpaces = await Space.findAll({
            where: { '$DirectParentSpaces.id$': spaceData.id, state: 'active' },
            attributes: [
                'id',
                'handle',
                'name',
                'flagImagePath',
                totalSpaceLikes,
                totalSpaceChildren,
            ],
            order: [
                [sequelize.literal(`totalLikes`), 'DESC'],
                ['createdAt', 'DESC'],
            ],
            limit: 50,
            subQuery: false,
            include: [
                {
                    model: Space,
                    as: 'DirectParentSpaces',
                    attributes: ['id'],
                    through: { attributes: [], where: { state: 'open' } },
                },
            ],
        })
        spaceData.setDataValue('DirectChildSpaces', childSpaces)
        res.status(200).send(spaceData)
    }
})

router.get('/space-posts', authenticateToken, async (req, res) => {
    // todo: potentially merge with user posts: get('/posts')
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, postType, sortBy, sortOrder, depth, searchQuery, limit, offset } =
        req.query

    const startDate = findStartDate(timeRange)
    const type = findPostType(postType)
    const order = findOrder(sortBy, sortOrder)
    const firstAttributes = findInitialPostAttributes(sortBy, accountId)
    const through = findPostThrough(depth)
    const where = findPostWhere('space', spaceId, startDate, type, searchQuery)

    // Double query used to prevent results being effected by top level where clause and reduce data load on joins.
    // Intial query used to find correct posts with pagination and sorting applied.
    // Second query used to return all related data and models.
    // todo: more testing to see if more effecient approaches available
    const emptyPosts = await Post.findAll({
        where,
        order,
        limit: Number(limit),
        offset: Number(offset),
        subQuery: false,
        attributes: firstAttributes,
        having: { ['access']: 1 },
        include: [
            {
                model: Space,
                as: 'AllPostSpaces',
                attributes: [],
                through,
            },
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic'],
            },
        ],
    })

    const postsWithData = await Post.findAll({
        where: { id: emptyPosts.map((post) => post.id) },
        attributes: [
            ...defaultPostAttributes,
            ...findPostReactions('Post'),
            ...findAccountReactions('Post', accountId),
        ],
        order,
        include: findPostInclude(accountId),
    })

    res.status(200).json(postsWithData)
})

router.get('/post-map-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, postType, sortBy, sortOrder, depth, searchQuery, limit, offset } =
        req.query

    const startDate = findStartDate(timeRange)
    const type = findPostType(postType)
    const order = findOrder(sortBy, sortOrder)
    const firstAttributes = findInitialPostAttributes(sortBy, accountId)
    const through = findPostThrough(depth)
    const where = findPostWhere('space', spaceId, startDate, type, searchQuery)

    const totalMatchingPosts = await Post.count({
        subQuery: false,
        where,
        order,
        attributes: firstAttributes,
        include: [
            {
                model: Space,
                as: 'AllPostSpaces',
                attributes: [],
                through,
            },
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic', 'topicGroup'],
            },
        ],
    })

    // Double query used to prevent results being effected by top level where clause and reduce data load on joins.
    // Intial query used to find correct posts with pagination and sorting applied.
    // Second query used to return all related data and models.
    // todo: more testing to see if more effecient approaches available
    const emptyPosts = await Post.findAll({
        where,
        order,
        limit: Number(limit),
        offset: Number(offset),
        subQuery: false,
        attributes: firstAttributes,
        having: { ['access']: 1 },
        include: [
            {
                model: Space,
                as: 'AllPostSpaces',
                attributes: [],
                through,
            },
            {
                model: GlassBeadGame,
                required: false,
                attributes: ['topic', 'topicGroup'],
            },
        ],
    })

    const postsWithData = await Post.findAll({
        where: { id: emptyPosts.map((post) => post.id) },
        attributes: [
            ...defaultPostAttributes,
            ...findPostReactions('Post'),
            ...findAccountReactions('Post', accountId),
        ],
        order,
        include: [
            {
                model: Link,
                as: 'OutgoingLinks',
                attributes: ['id', 'description'],
                where: { state: 'visible' },
                required: false,
                include: [
                    {
                        model: Post,
                        as: 'PostB',
                        attributes: ['id'],
                    },
                ],
            },
            {
                model: Link,
                as: 'IncomingLinks',
                attributes: ['id'],
                where: { state: 'visible' },
                required: false,
                include: [
                    {
                        model: Post,
                        as: 'PostA',
                        attributes: ['id'],
                    },
                ],
            },
            {
                model: PostImage,
                required: false,
                attributes: ['url'],
                limit: 1,
                order: [['index', 'ASC']],
            },
        ],
        required: false,
    })

    res.status(200).json({ totalMatchingPosts, posts: postsWithData })
})

router.get('/space-spaces', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, sortBy, sortOrder, depth, searchQuery, limit, offset } = req.query

    // todo: apply privacy rules

    // Double query required to to prevent results and pagination being effected by top level where clause.
    // Intial query used to find correct posts with calculated stats and pagination applied.
    // Second query used to return related models.
    Space.findAll({
        where: findSpaceWhere(spaceId, depth, timeRange, searchQuery),
        order: findOrder(sortBy, sortOrder),
        attributes: findSpaceFirstAttributes(sortBy),
        include: findSpaceInclude(depth),
        limit: Number(limit) || null,
        offset: Number(offset),
        subQuery: false,
    })
        .then((spaces) => {
            Space.findAll({
                where: { id: spaces.map((space) => space.id) },
                order: findOrder(sortBy, sortOrder),
                attributes: spaceAttributes,
            }).then((data) => {
                res.json(data)
            })
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-people', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    User.findAll({
        where: {
            '$FollowedSpaces.id$': spaceId,
            state: 'active',
            emailVerified: true,
            createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
            [Op.or]: [
                { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { bio: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            ],
        },
        order: findOrder(sortBy, sortOrder),
        limit: Number(limit),
        offset: Number(offset),
        attributes: findUserFirstAttributes(sortBy),
        subQuery: false,
        include: [
            {
                model: Space,
                as: 'FollowedSpaces',
                attributes: [],
                through: { where: { state: 'active' }, attributes: [] },
            },
        ],
    })
        .then((users) => {
            User.findAll({
                where: { id: users.map((user) => user.id) },
                order: findOrder(sortBy, sortOrder),
                attributes: userAttributes,
            }).then((data) => {
                res.json(data)
            })
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-events', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceHandle, year, month } = req.query

    const startTime = new Date(`${year}-${month < 10 ? '0' : ''}${month}-01`)
    const endTime = new Date(`${year}-${+month + 1 < 10 ? '0' : ''}${+month + 1}-01`)

    Post.findAll({
        subQuery: false,
        where: {
            '$DirectSpaces.handle$': spaceHandle,
            '$Event.startTime$': { [Op.between]: [startTime, endTime] },
            state: 'visible',
            type: ['event', 'glass-bead-game'],
        },
        attributes: ['id', 'type'],
        include: [
            {
                model: Space,
                as: 'DirectSpaces',
                where: { state: 'active' },
            },
            {
                model: Event,
                attributes: ['id', 'title', 'startTime'],
            },
            {
                model: GlassBeadGame,
                attributes: ['topic', 'topicGroup', 'topicImage'],
            },
        ],
    })
        .then((data) => res.json(data))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-map-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, offset, sortBy, sortOrder, timeRange, depth, searchQuery } = req.query

    // todo:
    // apply all filters only on first generation? at least not 'sort by' or 'sort order'
    // apply depth 'all contained' spaces only on first generation?
    // apply search only on first generation?
    // apply time range only on first generation?

    async function findNextGeneration(generation, parent, limit, offsetAmount) {
        const genOffset = Number(offsetAmount)
        const childAttributes = [
            ...spaceAttributes,
            findTotalSpaceResults(depth, searchQuery, timeRange),
        ]
        parent.children = []
        if (
            !parent.isExpander &&
            parent.totalResults > 0 &&
            (generation === 1 || parent.privacy !== 'private')
        ) {
            const nextGeneration = await Space.findAll({
                where: findSpaceWhere(parent.id, depth, timeRange, searchQuery),
                attributes: childAttributes,
                limit,
                offset: genOffset > 0 ? genOffset : null,
                order: findOrder(sortBy, sortOrder),
                include: findSpaceInclude(depth),
                subQuery: false,
            })
            nextGeneration.forEach((rawChild) => {
                const child = rawChild.toJSON()
                child.uuid = uuidv4()
                parent.children.push(child)
            })
        }
        // if hidden spaces, replace last space with expander
        if (parent.children.length) {
            if (generation === 1) {
                if (parent.totalResults > genOffset + parent.children.length) {
                    parent.children.splice(-1, 1)
                    const remainingChildren =
                        parent.totalResults - parent.children.length - genOffset
                    parent.children.push({
                        isExpander: true,
                        id: uuidv4(),
                        uuid: uuidv4(),
                        name: `${remainingChildren} more spaces`,
                    })
                }
            } else {
                if (parent.totalResults > limit) {
                    parent.children.splice(-1, 1)
                    const remainingChildren = parent.totalResults - parent.children.length
                    parent.children.push({
                        isExpander: true,
                        id: uuidv4(),
                        uuid: uuidv4(),
                        name: `${remainingChildren} more spaces`,
                    })
                }
            }
        }
    }

    const rootAttributes = [
        ...spaceAttributes,
        findTotalSpaceResults(depth, searchQuery, timeRange),
    ]
    const findRoot = await Space.findOne({
        where: { id: spaceId },
        attributes: rootAttributes,
        include: [
            {
                model: Space,
                as: 'DirectParentSpaces',
                attributes: spaceAttributes,
                through: { attributes: [], where: { state: 'open' } },
            },
        ],
    })
    const root = findRoot.toJSON()
    root.uuid = uuidv4()
    const findFirstGeneration = await findNextGeneration(1, root, firstGenLimit, offset)
    const findSecondGeneration = await asyncForEach(root.children, async (child) => {
        await findNextGeneration(2, child, secondGenLimit, 0)
    })
    const findThirdGeneration = await asyncForEach(root.children, async (child) => {
        await asyncForEach(child.children, async (child2) => {
            await findNextGeneration(3, child2, thirdGenLimit, 0)
        })
    })
    const findFourthGeneration = await asyncForEach(root.children, async (child) => {
        await asyncForEach(child.children, async (child2) => {
            await asyncForEach(child2.children, async (child3) => {
                await findNextGeneration(4, child3, fourthGenLimit, 0)
            })
        })
    })

    Promise.all([
        findFirstGeneration,
        findSecondGeneration,
        findThirdGeneration,
        findFourthGeneration,
    ]).then(() => {
        if (offset > 0) res.send(root.children)
        else res.send(root)
    })
})

router.get('/suggested-space-handles', (req, res) => {
    const { searchQuery } = req.query
    Space.findAll({
        where: { state: 'active', handle: { [Op.like]: `%${searchQuery}%` } },
        attributes: ['handle'],
    })
        .then((handles) => {
            res.json(handles)
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/validate-space-handle', (req, res) => {
    const { searchQuery } = req.query
    Space.findAll({
        where: { handle: searchQuery, state: 'active' },
        attributes: ['handle'],
    })
        .then((spaces) => {
            if (spaces.length > 0) {
                res.send('success')
            } else {
                res.send('fail')
            }
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/parent-space-blacklist', async (req, res) => {
    const { spaceId } = req.query
    // block descendants to prevent loops
    const descendants = await Space.findAll({
        attributes: ['id'],
        where: { '$SpaceAncestors.id$': spaceId, state: 'active' },
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: [],
            through: { attributes: [], where: { state: 'open' } },
        },
    })
    const blacklist = [1, spaceId, ...descendants.map((s) => s.id)]
    res.status(200).send(blacklist)
})

router.get('/users-with-access', async (req, res) => {
    const { spaceId } = req.query
    Space.findOne({
        where: { id: spaceId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'UsersWithAccess',
                attributes: ['id'],
                through: { where: { relationship: 'access', state: 'active' }, attributes: [] },
            },
        ],
    })
        .then((space) => {
            res.status(200).send(space.UsersWithAccess.map((u) => u.id))
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// POST
router.post('/find-spaces', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { query, blacklist, spaceId } = req.body
    let where = {
        state: 'active',
        '$SpaceAncestors.id$': spaceId || 1,
        [Op.or]: [{ handle: { [Op.like]: `%${query}%` } }, { name: { [Op.like]: `%${query}%` } }],
    }
    if (blacklist) where[Op.not] = [{ id: blacklist }]

    Space.findAll({
        where,
        include: [
            {
                model: Space,
                as: 'SpaceAncestors',
                attributes: [],
                through: { where: { state: 'open' }, attributes: [] },
            },
        ],
        limit: 20,
        attributes: [
            'id',
            'handle',
            'name',
            'flagImagePath',
            [
                // checks number of private ancestors = number of those ancestors user has access to
                // todo: find more efficient query
                sequelize.literal(`(
                    (SELECT COUNT(*)
                        FROM Spaces
                        WHERE Spaces.state = 'active'
                        AND Spaces.privacy = 'private'
                        AND Spaces.id IN (
                            SELECT SpaceAncestors.spaceAId
                            FROM SpaceAncestors
                            RIGHT JOIN Spaces
                            ON SpaceAncestors.spaceBId = Space.id
                        )
                    ) = (
                        SELECT COUNT(*)
                        FROM SpaceUsers
                        WHERE SpaceUsers.userId = ${accountId}
                        AND SpaceUsers.state = 'active'
                        AND SpaceUsers.relationship = 'access'
                        AND SpaceUsers.spaceId IN (
                            SELECT Spaces.id
                            FROM Spaces
                            WHERE Spaces.state = 'active'
                            AND Spaces.privacy = 'private'
                            AND Spaces.id IN (
                                SELECT SpaceAncestors.spaceAId
                                FROM SpaceAncestors
                                RIGHT JOIN Spaces
                                ON SpaceAncestors.spaceBId = Space.id
                            )
                        )
                    )

                )`),
                'access',
            ],
        ],
        having: { ['access']: 1 },
        subQuery: false,
    })
        .then((spaces) => res.status(200).json(spaces))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/create-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const {
        accountName,
        accountHandle,
        parentId,
        authorizedToAttachParent,
        handle,
        name,
        description,
        private,
    } = req.body

    const handleTaken = await Space.findOne({ where: { handle, state: 'active' } })

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else if (handleTaken) res.status(409).json({ message: 'handle-taken' })
    else {
        const newSpace = await Space.create({
            creatorId: accountId,
            handle,
            name,
            description,
            state: 'active',
            privacy: private ? 'private' : 'public',
        })

        const createModRelationship = SpaceUser.create({
            relationship: 'moderator',
            state: 'active',
            spaceId: newSpace.id,
            userId: accountId,
        })

        const createFollowerRelationship = SpaceUser.create({
            relationship: 'follower',
            state: 'active',
            spaceId: newSpace.id,
            userId: accountId,
        })

        const createAccessRelationship = private
            ? SpaceUser.create({
                  relationship: 'access',
                  state: 'active',
                  spaceId: newSpace.id,
                  userId: accountId,
              })
            : null

        Promise.all([
            createModRelationship,
            createFollowerRelationship,
            createAccessRelationship,
        ]).then(async () => {
            if (authorizedToAttachParent) {
                const createParentRelationship = await SpaceParent.create({
                    spaceAId: parentId, // parent
                    spaceBId: newSpace.id, // child
                    state: 'open',
                })

                // todo move parent and ancestors array out of promise and just use promise.all
                const createAncestorRelationships = await new Promise(async (resolve) => {
                    const parentSpace = await Space.findOne({
                        where: { id: parentId },
                        attributes: ['id'],
                        include: {
                            model: Space,
                            as: 'SpaceAncestors',
                            attributes: ['id'],
                            through: { attributes: [], where: { state: 'open' } },
                        },
                    })
                    const ancestors = [parentSpace, ...parentSpace.SpaceAncestors]
                    Promise.all(
                        ancestors.map(
                            async (ancestor) =>
                                await SpaceAncestor.create({
                                    spaceAId: ancestor.id, // ancestor
                                    spaceBId: newSpace.id, // descendent
                                    state: 'open',
                                })
                        )
                    )
                        .then(() => resolve())
                        .catch((error) => resolve(error))
                })

                Promise.all([createParentRelationship, createAncestorRelationships])
                    .then(() => res.status(200).json({ spaceId: newSpace.id, message: 'success' }))
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            } else {
                // if not authorized to attach to parent
                const attachToRoot = await SpaceParent.create({
                    spaceAId: 1, // parent
                    spaceBId: newSpace.id, // child
                    state: 'open',
                })

                const creatAncestorRelationship = await SpaceAncestor.create({
                    spaceAId: 1, // ancestor
                    spaceBId: newSpace.id, // descendent
                    state: 'open',
                })

                const parentSpace = await Space.findOne({
                    where: { id: parentId },
                    attributes: ['id', 'handle', 'name'],
                    include: {
                        model: User,
                        as: 'Moderators',
                        attributes: ['id', 'handle', 'name', 'email'],
                        through: {
                            where: { relationship: 'moderator', state: 'active' },
                            attributes: [],
                        },
                    },
                })

                const notifyMods = await Promise.all(
                    parentSpace.Moderators.map(
                        (mod) =>
                            new Promise(async (resolve) => {
                                const createNotification = await Notification.create({
                                    ownerId: mod.id,
                                    type: 'parent-space-request',
                                    state: 'pending',
                                    spaceAId: newSpace.id,
                                    spaceBId: parentSpace.id,
                                    userId: accountId,
                                    seen: false,
                                })
                                const sendEmail = await sgMail.send({
                                    to: mod.email,
                                    from: {
                                        email: 'admin@weco.io',
                                        name: 'we { collective }',
                                    },
                                    subject: 'New notification',
                                    text: `
                                        Hi ${mod.name}, ${accountName} wants to make ${name} a child space of ${parentSpace.name} on weco.
                                        Log in and go to your notification to accept or reject the request.
                                    `,
                                    html: `
                                        <p>
                                            Hi ${mod.name},
                                            <br/>
                                            <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                                            wants to make
                                            <a href='${config.appURL}/s/${handle}'>${name}</a>
                                            a child space of
                                            <a href='${config.appURL}/s/${parentSpace.handle}'>${parentSpace.name}</a>
                                            on weco.
                                            <br/>
                                            Log in and go to your
                                            <a href='${config.appURL}/u/${mod.handle}/notifications'>notifications</a>
                                            to accept or reject the request.
                                        </p>
                                    `,
                                })
                                Promise.all([createNotification, sendEmail])
                                    .then(() => resolve())
                                    .catch((error) => resolve(error))
                            })
                    )
                )

                Promise.all([attachToRoot, creatAncestorRelationship, notifyMods])
                    .then(() =>
                        res
                            .status(200)
                            .json({ spaceId: newSpace.id, message: 'pending-acceptance' })
                    )
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            }
        })
    }
})

async function isAuthorizedModerator(accountId, spaceId) {
    // checks the logged in account is the mod of the space (is this actually required? is there a way for hackers to change the request payload?)
    // todo: try to get this info directly from the db, rather than having to calculate it server side
    return await User.findOne({
        where: { id: accountId },
        include: [
            {
                model: Space,
                as: 'ModeratedSpaces',
                attributes: ['id'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        ],
    }).then((user) => {
        return user.ModeratedSpaces.find((space) => space.id === spaceId) ? true : false
    })
}

router.post('/update-space-handle', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, payload } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        Space.findOne({ where: { handle: payload } }).then((handleTaken) => {
            if (handleTaken) res.send('handle-taken')
            else {
                Space.update({ handle: payload }, { where: { id: spaceId } })
                    .then(res.send('success'))
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            }
        })
    }
})

router.post('/update-space-name', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, payload } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        Space.update({ name: payload }, { where: { id: spaceId } })
            .then(res.send('success'))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/update-space-description', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, payload } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        Space.update({ description: payload }, { where: { id: spaceId } })
            .then(res.send('success'))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/invite-space-users', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, spaceId, spaceHandle, spaceName, userIds } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const invitedUsers = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'name', 'email'],
        })

        Promise.all(
            invitedUsers.map(
                (user) =>
                    new Promise(async (resolve) => {
                        const createNotification = await Notification.create({
                            ownerId: user.id,
                            type: 'space-invite',
                            state: 'pending',
                            seen: false,
                            spaceAId: spaceId,
                            userId: accountId,
                        })
                        const sendEmail = await sgMail.send({
                            to: user.email,
                            from: {
                                email: 'admin@weco.io',
                                name: 'we { collective }',
                            },
                            subject: 'New notification',
                            text: `
                                Hi ${user.name}, ${accountName} just invited you to join ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
                                Log in and go to your notifications to accept the request.
                            `,
                            html: `
                                <p>
                                    Hi ${user.name},
                                    <br/>
                                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                                    just invited you to join
                                    <a href='${config.appURL}/s/${spaceHandle}'>${spaceName}</a>
                                    on weco.
                                    <br/>
                                    Log in and go to your notifications to accept the request.
                                </p>
                            `,
                        })
                        Promise.all([createNotification, sendEmail])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-space-invite', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const {
        accountHandle,
        accountName,
        notificationId,
        spaceId,
        spaceHandle,
        spaceName,
        userId,
        response,
    } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const grantAccess =
            response === 'accepted'
                ? await SpaceUser.create({
                      relationship: 'access',
                      state: 'active',
                      spaceId,
                      userId: accountId,
                  })
                : null

        const followSpace =
            response === 'accepted'
                ? await SpaceUser.create({
                      relationship: 'follower',
                      state: 'active',
                      spaceId,
                      userId: accountId,
                  })
                : null

        const updateNotification = await Notification.update(
            { state: response, seen: true },
            { where: { id: notificationId } }
        )

        const notifyInviteCreator = await new Promise(async (resolve) => {
            const inviteCreator = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'name', 'email'],
            })
            const createNotification = await Notification.create({
                ownerId: inviteCreator.id,
                type: 'space-invite-response',
                state: response,
                seen: false,
                spaceAId: spaceId,
                userId: accountId,
            })
            const sendEmail = await sgMail.send({
                to: inviteCreator.email,
                from: {
                    email: 'admin@weco.io',
                    name: 'we { collective }',
                },
                subject: 'New notification',
                text: `
                    Hi ${inviteCreator.name}, ${accountName} just ${response} your invite to join ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
                `,
                html: `
                    <p>
                        Hi ${inviteCreator.name},
                        <br/>
                        <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                        just ${response} your invite to join
                        <a href='${config.appURL}/s/${spaceHandle}'>${spaceName}</a>
                        on weco.
                        <br/>
                    </p>
                `,
            })
            Promise.all([createNotification, sendEmail])
                .then(() => resolve())
                .catch((error) => resolve(error))
        })

        Promise.all([grantAccess, followSpace, updateNotification, notifyInviteCreator])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/request-space-access', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, spaceId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const space = await Space.findOne({
            where: { id: spaceId },
            attributes: ['handle', 'name'],
            include: {
                model: User,
                as: 'Moderators',
                attributes: ['id', 'name', 'email'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        })

        const createAccessRealtionship = await SpaceUser.create({
            relationship: 'access',
            state: 'pending',
            spaceId,
            userId: accountId,
        })

        const notifyMods = await Promise.all(
            space.Moderators.map(
                (mod) =>
                    new Promise(async (resolve) => {
                        const createNotification = await Notification.create({
                            ownerId: mod.id,
                            type: 'space-access-request',
                            state: 'pending',
                            seen: false,
                            spaceAId: spaceId,
                            userId: accountId,
                        })
                        const sendEmail = await sgMail.send({
                            to: mod.email,
                            from: {
                                email: 'admin@weco.io',
                                name: 'we { collective }',
                            },
                            subject: 'New notification',
                            text: `
                                Hi ${mod.name}, ${accountName} just requested access to ${space.name}: ${config.appURL}/s/${space.handle} on weco.
                                Log in and go to your notifications to respond to the request.
                            `,
                            html: `
                                <p>
                                    Hi ${mod.name},
                                    <br/>
                                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                                    just requested access to
                                    <a href='${config.appURL}/s/${space.handle}'>${space.name}</a>
                                    on weco.
                                    <br/>
                                    Log in and go to your notifications to respond to the request.
                                </p>
                            `,
                        })
                        Promise.all([createNotification, sendEmail])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )

        Promise.all([createAccessRealtionship, notifyMods])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-space-access-request', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const {
        accountHandle,
        accountName,
        notificationId,
        spaceId,
        spaceHandle,
        spaceName,
        userId,
        response,
    } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updateAccess = await SpaceUser.update(
            { state: response === 'accepted' ? 'active' : 'removed' },
            { where: { relationship: 'access', state: 'pending', spaceId, userId } }
        )

        const followSpace =
            response === 'accepted'
                ? await SpaceUser.create({
                      relationship: 'follower',
                      state: 'active',
                      spaceId,
                      userId,
                  })
                : null

        const updateNotification = await Notification.update(
            { state: response, seen: true },
            { where: { id: notificationId } }
        )

        const notifyRequestCreator = await new Promise(async (resolve) => {
            const requestCreator = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'name', 'email'],
            })
            const createNotification = await Notification.create({
                ownerId: requestCreator.id,
                type: 'space-access-response',
                state: response,
                seen: false,
                spaceAId: spaceId,
                userId: accountId,
            })
            const sendEmail = await sgMail.send({
                to: requestCreator.email,
                from: {
                    email: 'admin@weco.io',
                    name: 'we { collective }',
                },
                subject: 'New notification',
                text: `
                    Hi ${requestCreator.name}, ${accountName} just ${response} your invite to join ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
                `,
                html: `
                    <p>
                        Hi ${requestCreator.name},
                        <br/>
                        <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                        just ${response} your invite to join
                        <a href='${config.appURL}/s/${spaceHandle}'>${spaceName}</a>
                        on weco.
                        <br/>
                    </p>
                `,
            })
            Promise.all([createNotification, sendEmail])
                .then(() => resolve())
                .catch((error) => resolve(error))
        })

        Promise.all([updateAccess, followSpace, updateNotification, notifyRequestCreator])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/invite-space-moderator', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, spaceHandle, spaceName, accountName, accountHandle, userHandle } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({
            where: { handle: userHandle },
            attributes: ['id', 'name', 'email'],
        })

        const notifyUser = await Notification.create({
            ownerId: user.id,
            type: 'mod-invite',
            state: 'pending',
            seen: false,
            spaceAId: spaceId,
            userId: accountId,
        })

        const emailUser = await sgMail.send({
            to: user.email,
            from: {
                email: 'admin@weco.io',
                name: 'we { collective }',
            },
            subject: 'New notification',
            text: `
                Hi ${user.name}, ${accountName} just invited you to moderate ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
                Log in and go to your notifications to accept the request.
            `,
            html: `
                <p>
                    Hi ${user.name},
                    <br/>
                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                    just invited you to moderate
                    <a href='${config.appURL}/s/${spaceHandle}'>${spaceName}</a>
                    on weco.
                    <br/>
                    Log in and go to your notifications to accept the request.
                </p>
            `,
        })

        Promise.all([notifyUser, emailUser])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-space-moderator', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, spaceHandle, spaceName, accountName, accountHandle, userHandle } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({
            where: { handle: userHandle },
            attributes: ['id', 'name', 'email'],
        })

        const removeModRelationship = await SpaceUser.update(
            { state: 'removed' },
            { where: { relationship: 'moderator', userId: user.id, spaceId } }
        )

        const notifyUser = await Notification.create({
            ownerId: user.id,
            type: 'mod-removed',
            state: null,
            seen: false,
            spaceAId: spaceId,
            userId: accountId,
        })

        const emailUser = await sgMail.send({
            to: user.email,
            from: {
                email: 'admin@weco.io',
                name: 'we { collective }',
            },
            subject: 'New notification',
            text: `
                Hi ${user.name}, ${accountName} just removed you from moderating ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
            `,
            html: `
                <p>
                    Hi ${user.name},
                    <br/>
                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                    just removed you from moderating
                    <a href='${config.appURL}/s/${spaceHandle}'>${spaceName}</a>
                    on weco.
                    <br/>
                </p>
            `,
        })

        Promise.all([removeModRelationship, notifyUser, emailUser])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/toggle-join-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, isFollowing } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updateState = isFollowing
            ? await SpaceUser.update(
                  { state: 'removed' },
                  {
                      where: {
                          userId: accountId,
                          spaceId,
                          relationship: 'follower',
                          state: 'active',
                      },
                  }
              )
            : await SpaceUser.create({
                  userId: accountId,
                  spaceId,
                  relationship: 'follower',
                  state: 'active',
              })

        updateState
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/join-spaces', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const spaceIds = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Promise.all(
            spaceIds.map((spaceId) =>
                SpaceUser.create({
                    userId: accountId,
                    spaceId,
                    relationship: 'follower',
                    state: 'active',
                })
            )
        )
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/viable-parent-spaces', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, query, blacklist } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        Space.findAll({
            limit: 20,
            where: {
                state: 'active',
                [Op.not]: [{ id: blacklist }],
                [Op.or]: [
                    { handle: { [Op.like]: `%${query}%` } },
                    { name: { [Op.like]: `%${query}%` } },
                ],
            },
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
            include: {
                model: User,
                as: 'Moderators',
                attributes: ['id'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        })
            .then((spaces) => res.status(200).send(spaces))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/send-parent-space-request', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, childId, childName, childHandle, parentId } = req.body
    const authorized = await isAuthorizedModerator(accountId, childId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        const parent = await Space.findOne({
            where: { id: parentId },
            attributes: ['id', 'handle', 'name'],
            include: {
                model: User,
                as: 'Moderators',
                attributes: ['id', 'handle', 'name', 'email'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        })

        Promise.all(
            parent.Moderators.map(
                async (mod) =>
                    await new Promise(async (resolve) => {
                        const createNotification = await Notification.create({
                            ownerId: mod.id,
                            type: 'parent-space-request',
                            state: 'pending',
                            spaceAId: childId,
                            spaceBId: parent.id,
                            userId: accountId,
                            seen: false,
                        })

                        const sendEmail = await sgMail.send({
                            to: mod.email,
                            from: {
                                email: 'admin@weco.io',
                                name: 'we { collective }',
                            },
                            subject: 'New notification',
                            text: `
                                Hi ${mod.name}, ${accountName} wants to make ${childName} a child space of ${parent.name} on weco.
                                Log in and navigate to your notifications to accept or reject the request.
                            `,
                            html: `
                                <p>
                                    Hi ${mod.name},
                                    <br/>
                                    <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                                    wants to make
                                    <a href='${config.appURL}/s/${childHandle}'>${childName}</a>
                                    a child space of
                                    <a href='${config.appURL}/s/${parent.handle}'>${parent.name}</a>
                                    on weco.
                                    <br/>
                                    Log in and navigate to your
                                    <a href='${config.appURL}/u/${mod.handle}/notifications'>notifications</a>
                                    to accept or reject the request.
                                </p>
                            `,
                        })

                        Promise.all([createNotification, sendEmail])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

async function attachParentSpace(childId, parentId) {
    // remove old parent relationship with root if present to reduce clutter
    const removeRoot = await SpaceParent.update(
        { state: 'closed' },
        { where: { spaceAId: 1, spaceBId: childId, state: 'open' } }
    )

    const createNewParentRelationship = await SpaceParent.create({
        spaceAId: parentId,
        spaceBId: childId,
        state: 'open',
    })

    const parent = await Space.findOne({
        where: { id: parentId },
        attributes: ['id'],
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: ['id'],
            through: { attributes: [], where: { state: 'open' } },
        },
    })

    const descendants = await Space.findAll({
        attributes: ['id'],
        where: {
            [Op.or]: {
                id: childId,
                '$SpaceAncestors.id$': childId,
            },
            state: 'active',
        },
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: ['id'],
            through: { attributes: [], where: { state: 'open' } },
        },
    })

    // check the new parents ancestors against each of the decendents ancestors and add if not already present
    const addNewAncestorsToDescendants = await Promise.all(
        descendants.map((descendent) =>
            Promise.all(
                [parent, ...parent.SpaceAncestors].map(
                    (ancestor) =>
                        new Promise((resolve) => {
                            const match = descendent.SpaceAncestors.find(
                                (a) => a.id === ancestor.id
                            )
                            if (match) resolve()
                            else {
                                SpaceAncestor.create({
                                    spaceAId: ancestor.id,
                                    spaceBId: descendent.id,
                                    state: 'open',
                                })
                                    .then(() => resolve())
                                    .catch((error) => resolve(error))
                            }
                        })
                )
            )
        )
    )

    return Promise.all([removeRoot, createNewParentRelationship, addNewAncestorsToDescendants])
}

async function removeAncestors(childId, parentId, ancestorIds) {
    // Recursive promise used to remove the correct ancestors from a space when one of its parents is detached and then apply the same logic to each of its descendants.
    // Recursion required in order to confirm that the ancestors being removed at each level are not still present via other pathways up the tree.
    // The child spaces other parents (excluding the parent passed in with parentId) are gathered at each level to check for matching ancestors.
    // If a match is found, that ancestor is skipped and its id is no longer passed down to the next recursive function.
    // If a match is not found, that ancestor is removed from the space and its id is passed on to the next recursive function.

    return new Promise(async (resolve) => {
        const child = await Space.findOne({
            where: { id: childId },
            include: [
                {
                    model: Space,
                    as: 'SpaceAncestors',
                    attributes: ['id'],
                    through: { attributes: [], where: { state: 'open' } },
                },
                {
                    model: Space,
                    as: 'DirectParentSpaces',
                    attributes: ['id'],
                    where: { id: { [Op.not]: parentId } },
                    through: { attributes: [], where: { state: 'open' } },
                    include: {
                        model: Space,
                        as: 'SpaceAncestors',
                        attributes: ['id'],
                        through: { attributes: [], where: { state: 'open' } },
                    },
                    required: false,
                },
                {
                    model: Space,
                    as: 'DirectChildSpaces',
                    attributes: ['id'],
                    through: { attributes: [], where: { state: 'open' } },
                },
            ],
        })
        // gather the childs other parents ancestors (include the root id to prevent its removal)
        let otherParentsAncestors = [1]
        child.DirectParentSpaces.forEach((parent) =>
            otherParentsAncestors.push(parent.id, ...parent.SpaceAncestors.map((s) => s.id))
        )
        // remove duplicates
        otherParentsAncestors = [...new Set(otherParentsAncestors)]
        // filter out otherParentsAncestors from ancestorIds to remove
        const ancestorsToRemove = ancestorIds.filter((id) => !otherParentsAncestors.includes(id))
        if (ancestorsToRemove.length) {
            // remove ancestor relationships
            Promise.all(
                ancestorsToRemove.map(
                    async (ancestorId) =>
                        await SpaceAncestor.update(
                            { state: 'removed' },
                            { where: { spaceAId: ancestorId, spaceBId: childId, state: 'open' } }
                        )
                )
            )
                .then(() => {
                    // re-run recurisve function for each child space
                    Promise.all(
                        child.DirectChildSpaces.map(
                            async (child) =>
                                await removeAncestors(child.id, childId, ancestorsToRemove)
                        )
                    )
                        .then(() => resolve())
                        .catch((error) => resolve(error))
                })
                .catch((error) => resolve(error))
        } else resolve()
    })
}

async function detachParentSpace(childId, parentId) {
    // todo: send notifications? (if initiated from child, send notification to parent mods, else to child mods)

    const parent = await Space.findOne({
        where: { id: parentId },
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: ['id'],
            through: { attributes: [], where: { state: 'open' } },
        },
    })

    const child = await Space.findOne({
        where: { id: childId },
        include: {
            model: Space,
            as: 'DirectParentSpaces',
            attributes: ['id'],
            through: { attributes: [], where: { state: 'open' } },
        },
    })

    const ancestorIds = [parentId, ...parent.SpaceAncestors.map((s) => s.id)]
    const updateDescendantsAncestors = await removeAncestors(childId, parentId, ancestorIds)

    // if the parent being removed is the only parent of the child, attach the child to the root space
    const attachRoot =
        child.DirectParentSpaces.length === 1
            ? await SpaceParent.create({
                  state: 'open',
                  spaceAId: 1,
                  spaceBId: childId,
              })
            : null

    const removeOldParentRelationship = await SpaceParent.update(
        { state: 'closed' },
        { where: { spaceAId: parentId, spaceBId: childId, state: 'open' } }
    )

    return Promise.all([updateDescendantsAncestors, attachRoot, removeOldParentRelationship])
}

router.post('/add-parent-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { childId, parentId } = req.body
    const authorized = await isAuthorizedModerator(accountId, parentId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        attachParentSpace(childId, parentId)
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/respond-to-parent-space-request', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { requestorId, childId, parentId, response } = req.body
    const authorized = await isAuthorizedModerator(accountId, parentId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        const attachSpace =
            response === 'accepted' ? await attachParentSpace(childId, parentId) : null

        const updateModNotifications = await Notification.update(
            { state: response },
            {
                where: {
                    type: 'parent-space-request',
                    state: 'pending',
                    spaceAId: childId,
                    spaceBId: parentId,
                },
            }
        )

        const notifyRequestor = await Notification.create({
            ownerId: requestorId,
            type: `parent-space-request-response`,
            state: response,
            spaceAId: childId,
            spaceBId: parentId,
            userId: accountId,
            seen: false,
        })

        Promise.all([attachSpace, updateModNotifications, notifyRequestor])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-parent-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { childId, parentId, fromChild } = req.body
    const authorized = await isAuthorizedModerator(accountId, fromChild ? childId : parentId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        detachParentSpace(childId, parentId)
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/delete-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId } = req.body
    const authorized = await isAuthorizedModerator(accountId, spaceId)

    if (!accountId || !authorized) res.status(401).json({ message: 'Unauthorized' })
    else {
        const space = await Space.findOne({
            where: { id: spaceId },
            include: [
                {
                    model: Space,
                    as: 'DirectParentSpaces',
                    attributes: ['id'],
                    through: { attributes: [], where: { state: 'open' } },
                },
                {
                    model: Space,
                    as: 'DirectChildSpaces',
                    attributes: ['id'],
                    through: { attributes: [], where: { state: 'open' } },
                },
            ],
        })

        const detachChildren = await Promise.all(
            space.DirectChildSpaces.map(async (child) => await detachParentSpace(child.id, spaceId))
        )

        const detachParents = await Promise.all(
            space.DirectParentSpaces.map(
                async (parent) =>
                    await SpaceParent.update(
                        { state: 'closed' },
                        {
                            where: {
                                spaceAId: parent.id,
                                spaceBId: spaceId,
                                state: 'open',
                            },
                        }
                    )
            )
        )

        Promise.all([detachChildren, detachParents])
            .then(() => {
                Space.update({ state: 'removed-by-mod' }, { where: { id: spaceId } })
                    .then(() => res.status(200).json({ message: 'Success' }))
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            })
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router
