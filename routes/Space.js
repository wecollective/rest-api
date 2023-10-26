require('dotenv').config()
const config = require('../Config')
const express = require('express')
const router = express.Router()
const sequelize = require('sequelize')
const Op = sequelize.Op
const crypto = require('crypto')
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
    Image,
    Url,
    SpaceUserStat,
} = require('../models')
const {
    totalSpaceSpaces,
    totalSpaceChildren,
    totalUserPosts,
    totalUserComments,
    findStartDate,
    findPostOrder,
    findPostOrderNew,
    findSpaceOrder,
    findUserOrder,
    findPostType,
    findInitialPostAttributes,
    findFullPostAttributes,
    findPostThrough,
    findPostThroughNew,
    findPostWhere,
    findPostInclude,
    spaceAccess,
    ancestorAccess,
    postAccess,
    isModerator,
    isFollowingSpace,
    totalSpaceResults,
} = require('../Helpers')

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

function findUserFirstAttributes(sortBy) {
    let firstAttributes = ['id']
    if (sortBy === 'Posts') firstAttributes.push(totalUserPosts)
    if (sortBy === 'Comments') firstAttributes.push(totalUserComments)
    return firstAttributes
}

// todo: turn into recursive function to handle privacy... (i.e private space within public child being attached to public parent)
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

    // get the parent with all its ancestors
    const parent = await Space.findOne({
        where: { id: parentId },
        attributes: ['id'],
        include: {
            model: Space,
            as: 'SpaceAncestors',
            where: { state: 'active' },
            required: false,
            attributes: ['id'],
            through: { attributes: ['state'], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })

    // get the child with all its decendents (including each of their ancestors)
    const child = await Space.findOne({
        where: { id: childId },
        attributes: ['id', 'privacy'],
        include: [
            {
                model: Space,
                as: 'SpaceDescendents',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
                include: {
                    model: Space,
                    as: 'SpaceAncestors',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id'],
                    through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
                },
            },
            {
                model: Space,
                as: 'SpaceAncestors',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
            },
        ],
    })

    const descendants = [child, ...child.SpaceDescendents]
    const ancestors = [
        // parent SpaceAncestor state determined by childs privacy
        {
            id: parent.id,
            SpaceAncestor: { state: child.privacy === 'private' ? 'closed' : 'open' },
        },
        ...parent.SpaceAncestors,
    ]

    // loop through the descendents (includes child) and add any ancestors that aren't already present
    const addAncestorsToDescendants = await Promise.all(
        descendants.map((descendent) =>
            Promise.all(
                ancestors.map(
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
                                    state:
                                        child.privacy === 'private'
                                            ? 'closed'
                                            : ancestor.SpaceAncestor.state,
                                })
                                    .then(() => resolve())
                                    .catch((error) => resolve(error))
                            }
                        })
                )
            )
        )
    )

    return Promise.all([removeRoot, createNewParentRelationship, addAncestorsToDescendants])
}

async function recursivelyRemoveAncestors(childId, parentId, ancestorIds) {
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
                    through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
                },
                {
                    model: Space,
                    as: 'DirectParentSpaces',
                    attributes: ['id'],
                    where: { id: { [Op.not]: parentId } },
                    required: false,
                    through: { attributes: [], where: { state: 'open' } },
                    include: {
                        model: Space,
                        as: 'SpaceAncestors',
                        attributes: ['id'],
                        through: {
                            attributes: [],
                            where: { state: { [Op.or]: ['open', 'closed'] } },
                        },
                    },
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
                            {
                                where: {
                                    spaceAId: ancestorId,
                                    spaceBId: childId,
                                    state: { [Op.or]: ['open', 'closed'] },
                                },
                            }
                        )
                )
            )
                .then(() => {
                    // re-run recurisve function for each child space
                    Promise.all(
                        child.DirectChildSpaces.map(
                            async (child) =>
                                await recursivelyRemoveAncestors(
                                    child.id,
                                    childId,
                                    ancestorsToRemove
                                )
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
    // todo: send notifications (if initiated from child, send notification to parent mods, else to child mods)
    const parent = await Space.findOne({
        where: { id: parentId },
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: ['id'],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
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
    const updateDescendantsAncestors = await recursivelyRemoveAncestors(
        childId,
        parentId,
        ancestorIds
    )

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

async function isAuthorizedModerator(accountId, spaceId) {
    // checks the account has moderator access for the space
    return SpaceUser.count({
        where: { relationship: 'moderator', state: 'active', userId: accountId, spaceId },
    })
}

// GET
router.get('/homepage-highlights', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null

    const totals = await Space.findOne({
        where: { id: 1 },
        attributes: [
            'totalPosts',
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

    const posts = await Post.findAll({
        where: {
            state: 'visible',
            type: ['image', 'url'],
        },
        order: [['createdAt', 'DESC']],
        limit: 3,
        attributes: ['type'],
        include: [
            {
                model: Url,
                attributes: ['image'],
                limit: 1,
            },
            {
                model: Image,
                attributes: ['url'],
                limit: 1,
            },
        ],
    })

    const spaces = await Space.findAll({
        where: {
            state: 'active',
            privacy: 'public',
            flagImagePath: { [Op.ne]: null },
        },
        attributes: ['flagImagePath'], // ancestorAccess(accountId)
        // having: { ['ancestorAccess']: 1 },
        order: [['createdAt', 'DESC']],
        limit: 3,
    })

    const users = await User.findAll({
        where: {
            state: 'active',
            emailVerified: true,
            flagImagePath: { [Op.ne]: null },
        },
        attributes: ['flagImagePath'],
        order: [['createdAt', 'DESC']],
        limit: 3,
    })

    res.status(200).json({
        totals,
        posts: posts.map((p) => {
            if (p.type === 'image') return p.Images[0].url
            return p.Urls[0].image
        }),
        spaces: spaces.map((s) => s.flagImagePath),
        users: users.map((u) => u.flagImagePath),
    })
})

// todo: clean up like post routes
router.get('/space-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { handle } = req.query

    const spaceData = await Space.findOne({
        where: { handle, state: 'active' },
        attributes: [
            'id',
            'handle',
            'name',
            'description',
            'flagImagePath',
            'coverImagePath',
            'privacy',
            'inviteToken',
            'totalPosts',
            totalSpaceSpaces,
            // todo: set up tally system and display next to tabs
            // handle === 'all' ? totalUsers : totalSpaceUsers,
            spaceAccess(accountId),
            ancestorAccess(accountId),
            isModerator(accountId),
            isFollowingSpace(accountId),
        ],
        include: [
            // todo: remove DirectParentSpaces and retrieve seperately where needed
            // (Navbar, ParentSpaceRequestModal, RemoveParentSpaceModal, SpaceNavigationList, SpacePageSpaceMap)
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
            // todo: remove and retreive 'theme' as individual value (for use in defining space styles)
            {
                model: Space,
                as: 'SpaceAncestors',
                attributes: ['id'],
                through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
            },
            {
                model: User,
                as: 'Moderators',
                attributes: ['id'],
                through: { attributes: [], where: { state: 'active', relationship: 'moderator' } },
            },
        ],
    })

    if (!spaceData) res.status(404).send({ message: 'Space not found' })
    else {
        // check user access
        const { privacy, spaceAccess, ancestorAccess, isModerator, isFollowing } =
            spaceData.dataValues
        let access = 'blocked'
        if (privacy === 'public') access = ancestorAccess ? 'granted' : 'blocked-by-ancestor'
        else if (spaceAccess) access = spaceAccess === 'active' ? 'granted' : 'pending'
        spaceData.setDataValue('access', access)
        delete spaceData.dataValues.spaceAccess
        delete spaceData.dataValues.ancestorAccess
        // convert SQL booleans to JS booleans
        spaceData.setDataValue('isModerator', !!isModerator)
        spaceData.setDataValue('isFollowing', !!isFollowing)
        res.status(200).send(spaceData)
    }
})

router.get('/space-modal-data', async (req, res) => {
    const { spaceId } = req.query
    const space = await Space.findOne({
        where: { id: spaceId },
        attributes: [
            'description',
            'coverImagePath',
            'totalPostLikes',
            'totalPosts',
            'totalComments',
            'totalFollowers',
        ],
    })
    if (space) res.status(200).json(space)
    else res.status(404).json({ message: 'Space not found' })
})

router.post('/nav-list-spaces', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, offset, includeParents, includeChildren } = req.body
    const order = [
        ['totalPostLikes', 'DESC'],
        ['createdAt', 'DESC'],
    ]
    const baseAttributes = [
        'id',
        'handle',
        'name',
        'flagImagePath',
        'coverImagePath',
        'totalPostLikes',
        totalSpaceChildren,
    ]

    const parents = includeParents
        ? await Space.findAll({
              where: { '$DirectChildSpaces.id$': spaceId, state: 'active' },
              attributes: baseAttributes,
              order,
              limit: 10,
              subQuery: false,
              include: {
                  model: Space,
                  as: 'DirectChildSpaces',
                  attributes: ['id'],
                  through: { attributes: [], where: { state: 'open' } },
              },
          })
        : null

    const children = includeChildren
        ? await Space.findAndCountAll({
              where: { '$DirectParentSpaces.id$': spaceId, state: 'active' },
              attributes: [...baseAttributes, 'privacy', spaceAccess(accountId)],
              order,
              offset: +offset,
              limit: 10,
              subQuery: false,
              include: {
                  model: Space,
                  as: 'DirectParentSpaces',
                  attributes: ['id'],
                  through: { attributes: [], where: { state: 'open' } },
              },
          })
        : { rows: [], count: 0 }

    res.status(200).json({ parents, children: children.rows, totalChildren: children.count })
})

router.get('/find-child-spaces', authenticateToken, async (req, res) => {
    // const accountId = req.user ? req.user.id : null
    const { spaceId, query } = req.query

    const spaces = await Space.findAll({
        where: {
            state: 'active',
            '$DirectParentSpaces.id$': spaceId,
            [Op.or]: [
                { handle: { [Op.like]: `%${query}%` } },
                { name: { [Op.like]: `%${query}%` } },
            ],
        },
        attributes: ['id', 'handle', 'name', 'flagImagePath'],
        order: [
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ],
        subQuery: false,
        include: {
            model: Space,
            as: 'DirectParentSpaces',
            attributes: ['id'],
            through: { attributes: [], where: { state: 'open' } },
        },
    })
    if (spaces) res.status(200).json(spaces)
    else res.status(500).json({ message: 'Error' })
})

router.get('/top-contributors', async (req, res) => {
    const { spaceId, offset } = req.query

    const stats = await SpaceUserStat.findAndCountAll({
        where: { spaceId, totalPostLikes: { [Op.gt]: 0 } },
        attributes: ['totalPostLikes'],
        order: [
            ['totalPostLikes', 'DESC'],
            ['createdAt', 'ASC'],
        ],
        offset: +offset,
        limit: 10,
        include: {
            model: User,
            attributes: ['id', 'handle', 'name', 'flagImagePath', 'coverImagePath'],
        },
    })

    res.status(200).json({
        users: stats.rows.map((stat) => {
            return { ...stat.User.dataValues, totalPostLikes: stat.totalPostLikes }
        }),
        totalUsers: stats.count,
    })
})

router.get('/space-about', async (req, res) => {
    const { handle } = req.query
    const aboutData = await Space.findOne({
        where: { handle, state: 'active' },
        attributes: ['createdAt'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
    res.status(200).json(aboutData)
})

router.post('/space-posts', authenticateToken, async (req, res) => {
    // todo: potentially merge with user posts: get('/posts')
    const accountId = req.user ? req.user.id : null
    const { spaceId, limit, offset, params, mutedUsers } = req.body
    const { filter, type, sortBy, timeRange, depth, searchQuery } = params
    const startDate = findStartDate(timeRange)
    const postType = findPostType(type)
    // todo: replace findPostOrderNew & findPostThroughNew when updated globally
    const order = findPostOrderNew(filter, sortBy)
    const through = findPostThroughNew(depth)
    const where = findPostWhere('space', spaceId, startDate, postType, searchQuery, mutedUsers)
    const initialAttributes = findInitialPostAttributes(sortBy)
    const fullAttributes = findFullPostAttributes('Post', accountId)

    // todo: try getting space first then .getSpacePosts function to replace double query
    // warning: causes extreme cpu utilisation on db for some reason
    // const space = await Space.findOne({ where: { id: spaceId }, attributes: ['id'] })
    // const posts = await space.getSpacePosts({
    //     where,
    //     order,
    //     attributes: fullAttributes,
    //     limit: Number(limit),
    //     offset: Number(offset),
    //     include: [
    //         {
    //             model: Space,
    //             as: 'AllPostSpaces',
    //             attributes: ['id'],
    //             through,
    //         },
    //         ...findPostInclude(accountId),
    //     ],
    //     subQuery: false,
    // })

    // res.status(200).json(posts)

    // Double query used to prevent results being effected by top level where clause and reduce data load on joins.
    // Intial query used to find correct posts with pagination and sorting applied.
    // Second query used to return all related data and models.
    // todo: more testing to see if more effecient approaches available
    const emptyPosts = await Post.findAll({
        where,
        order,
        limit,
        offset,
        subQuery: false,
        attributes: initialAttributes,
        include: {
            model: Space,
            as: 'AllPostSpaces',
            attributes: [],
            through,
        },
    })

    const postsWithData = await Post.findAll({
        where: { id: emptyPosts.map((post) => post.id) },
        attributes: fullAttributes,
        order,
        include: findPostInclude(accountId),
    })

    res.status(200).json(postsWithData)
})

router.post('/post-map-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const {
        spaceId,
        filter,
        type,
        sortBy,
        timeRange,
        depth,
        searchQuery,
        limit,
        offset,
        mutedUsers,
    } = req.body

    const startDate = findStartDate(timeRange)
    const postType = findPostType(type)
    // const order = findPostOrder(sortBy, sortOrder)
    // const through = findPostThrough(depth)
    const order = findPostOrderNew(filter, sortBy)
    const through = findPostThroughNew(depth)
    const where = findPostWhere('space', spaceId, startDate, postType, searchQuery, mutedUsers)
    const initialAttributes = findInitialPostAttributes(sortBy)
    const fullAttributes = findFullPostAttributes('Post', accountId)

    // Double query used to prevent results being effected by top level where clause and reduce data load on joins.
    // Intial query used to find correct posts with pagination and sorting applied.
    // Second query used to return all related data and models.
    // todo: more testing to see if more effecient approaches available
    const emptyPosts = await Post.findAndCountAll({
        where,
        order,
        limit,
        offset,
        subQuery: false,
        attributes: initialAttributes,
        include: {
            model: Space,
            as: 'AllPostSpaces',
            attributes: [],
            through,
        },
    })

    const postsWithData = await Post.findAll({
        where: { id: emptyPosts.rows.map((post) => post.id) },
        attributes: fullAttributes,
        order,
        include: [
            {
                model: Link,
                as: 'OutgoingPostLinks',
                attributes: ['id', 'description'],
                where: { state: 'visible', type: 'post-post' },
                required: false,
                include: [
                    {
                        model: Post,
                        as: 'OutgoingPost',
                        attributes: ['id'],
                    },
                ],
            },
            {
                model: Image,
                required: false,
                attributes: ['url'],
                limit: 1,
                order: [['index', 'ASC']],
            },
        ],
        required: false,
    })

    res.status(200).json({ totalMatchingPosts: emptyPosts.count, posts: postsWithData })
})

router.get('/space-spaces', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, sortBy, sortOrder, depth, searchQuery, limit, offset } = req.query
    const search = searchQuery || ''

    // build where
    const where = {
        state: 'active',
        createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
        [Op.or]: [
            { handle: { [Op.like]: `%${search}%` } },
            { name: { [Op.like]: `%${search}%` } },
            { description: { [Op.like]: `%${search}%` } },
        ],
    }
    if (depth === 'All Contained Spaces') where['$SpaceAncestors.id$'] = spaceId
    else where['$DirectParentSpaces.id$'] = spaceId

    // build include
    const state = depth === 'All Contained Spaces' ? { [Op.or]: ['open', 'closed'] } : 'open'
    const include = {
        model: Space,
        as: depth === 'All Contained Spaces' ? 'SpaceAncestors' : 'DirectParentSpaces',
        attributes: [],
        through: { attributes: [], where: { state } },
    }

    Space.findAll({
        where,
        attributes: [
            'id',
            'handle',
            'name',
            'description',
            'flagImagePath',
            'coverImagePath',
            'privacy',
            'totalPostLikes',
            'totalPosts',
            'totalComments',
            'totalFollowers',
        ],
        include,
        order: findSpaceOrder(sortBy, sortOrder),
        limit: Number(limit) || null,
        offset: Number(offset),
        group: ['id'],
        subQuery: false,
    })
        .then((spaces) => res.status(200).json(spaces))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-people', authenticateToken, (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, timeRange, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    User.findAll({
        where: {
            '$FollowedSpaces.id$': spaceId,
            state: { [Op.or]: ['active', 'unclaimed'] },
            // emailVerified: true,
            createdAt: { [Op.between]: [findStartDate(timeRange), Date.now()] },
            [Op.or]: [
                { handle: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { name: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
                { bio: { [Op.like]: `%${searchQuery ? searchQuery : ''}%` } },
            ],
        },
        order: findUserOrder(sortBy, sortOrder),
        limit: Number(limit),
        offset: Number(offset),
        attributes: findUserFirstAttributes(sortBy),
        subQuery: false,
        include: {
            model: Space,
            as: 'FollowedSpaces',
            attributes: [],
            through: { where: { relationship: 'follower', state: 'active' }, attributes: [] },
        },
    })
        .then((users) => {
            User.findAll({
                where: { id: users.map((user) => user.id) },
                order: findUserOrder(sortBy, sortOrder),
                attributes: userAttributes,
            }).then((data) => res.status(200).json(data))
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
        attributes: ['id', 'type', 'title', postAccess(accountId)],
        having: { ['access']: 1 },
        include: [
            {
                model: Space,
                as: 'DirectSpaces',
                where: { state: 'active' },
            },
            {
                model: Event,
                attributes: ['id', 'startTime'],
            },
            {
                model: GlassBeadGame,
                attributes: ['topicGroup', 'topicImage'],
            },
        ],
    })
        .then((data) => res.status(200).json(data))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/space-map-data', authenticateToken, async (req, res) => {
    // 3 scenarios: 'full-tree' (includes root and parents), 'children-of-root' (includes filters) : 'children-of-child' (no filters)
    const accountId = req.user ? req.user.id : null
    const { scenario, spaceId, params, offset } = req.body
    const { lens, sortBy, sortOrder, timeRange, depth, searchQuery } = params
    const search = searchQuery || ''
    const generationLimits = {
        // number of space to inlcude per generation (length of array determines max depth)
        Tree: [12], // [7, 3, 3, 3],
        Circles: [200, 100, 100, 100, 100, 100, 100, 100],
    }

    async function findRoot() {
        // calculate attributes
        const rootAttributes = ['id']
        if (lens === 'Tree') rootAttributes.push('flagImagePath')
        if (scenario === 'full-tree') rootAttributes.push('handle', 'name')
        if (scenario === 'children-of-child') rootAttributes.push(totalSpaceResults())
        else rootAttributes.push(totalSpaceResults({ depth, timeRange, search }))
        // calculate include
        const rootInclude = []
        if (scenario === 'full-tree') {
            // include direct parents if full tree
            rootInclude.push({
                model: Space,
                as: 'DirectParentSpaces',
                attributes: ['id', 'name', 'handle', 'flagImagePath'],
                through: { attributes: [], where: { state: 'open' } },
            })
        }
        if (scenario !== 'children-of-child') {
            // space ancestors required for totalSpaceResults when filters applied
            rootInclude.push({
                model: Space,
                as: 'SpaceAncestors',
                attributes: [],
                through: {
                    attributes: [],
                    where: { state: { [Op.or]: ['open', 'closed'] } },
                },
            })
        }
        // get root space
        const rootSpace = await Space.findOne({
            where: { id: spaceId },
            attributes: rootAttributes,
            include: rootInclude,
        })
        // add uuids to root space and parents
        rootSpace.setDataValue('uuid', uuidv4())
        if (rootSpace.DirectParentSpaces)
            rootSpace.DirectParentSpaces.forEach((s) => s.setDataValue('uuid', uuidv4()))
        return rootSpace
    }

    const root = await findRoot()

    const childAttributes = [
        'id',
        'handle',
        'name',
        'privacy',
        totalSpaceResults(),
        spaceAccess(accountId),
    ]
    if (lens === 'Tree') childAttributes.push('flagImagePath')
    if (sortBy === 'Likes') childAttributes.push('totalPostLikes')
    if (sortBy === 'Posts') childAttributes.push('totalPosts')
    if (sortBy === 'Comments') childAttributes.push('totalComments')
    if (sortBy === 'Followers') childAttributes.push('totalFollowers')
    if (sortBy === 'Date Created') childAttributes.push('createdAt')

    function findChildInclude(generation) {
        const allSpaces =
            generation === 0 && scenario !== 'children-of-child' && depth === 'All Contained Spaces'
        return {
            model: Space,
            as: allSpaces ? 'SpaceAncestors' : 'DirectParentSpaces',
            attributes: [],
            through: {
                attributes: [],
                where: { state: allSpaces ? { [Op.or]: ['open', 'closed'] } : 'open' },
            },
        }
    }

    function findChildWhere(parentId, generation) {
        const where = { state: 'active' }
        const skipFilters = generation > 0 || scenario === 'children-of-child'
        if (skipFilters) where['$DirectParentSpaces.id$'] = parentId
        else {
            if (depth === 'All Contained Spaces') where['$SpaceAncestors.id$'] = parentId
            else where['$DirectParentSpaces.id$'] = parentId
            where.createdAt = { [Op.between]: [findStartDate(timeRange), Date.now()] }
            where[Op.or] = [
                { handle: { [Op.like]: `%${search}%` } },
                { name: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } },
            ]
        }
        return where
    }

    async function traverseTree(parent, generation, includeParent) {
        return new Promise(async (resolve1) => {
            const children = await Space.findAll({
                where: findChildWhere(parent.id, generation),
                attributes: childAttributes,
                include: findChildInclude(generation),
                limit: generationLimits[lens][generation],
                offset: generation === 0 ? offset : 0,
                order: findSpaceOrder(sortBy, sortOrder),
                group: ['id'],
                subQuery: false,
            })
            const { totalResults } = parent.dataValues
            const remainingSpaces = totalResults - children.length - (generation === 0 ? offset : 0)
            if (!remainingSpaces) parent.setDataValue('children', children)
            else {
                children.splice(-1, 1)
                const expander = {
                    expander: true,
                    id: `${parent.id}-${remainingSpaces}`,
                    uuid: uuidv4(),
                    name: `${remainingSpaces + 1} more spaces`,
                }
                parent.setDataValue('children', [...children, expander])
            }
            Promise.all(
                parent.dataValues.children.map(
                    (child) =>
                        new Promise((resolve2) => {
                            if (child.expander === true) resolve2()
                            else {
                                child.setDataValue('uuid', uuidv4())
                                const { totalResults, privacy, spaceAccess } = child.dataValues
                                const noAccess = privacy === 'private' && spaceAccess !== 'active'
                                // if max depth reached, no grandchildren, or no access: resolve
                                if (
                                    !generationLimits[lens][generation + 1] ||
                                    !totalResults ||
                                    noAccess
                                ) {
                                    child.setDataValue('children', [])
                                    resolve2()
                                } else {
                                    // recursively re-run tree traveral of child
                                    traverseTree(child, generation + 1, false).then(
                                        (grandChildren) => {
                                            child.setDataValue('children', grandChildren)
                                            resolve2()
                                        }
                                    )
                                }
                            }
                        })
                )
            )
                .then(() => {
                    if (includeParent) resolve1(parent)
                    else resolve1(parent.dataValues.children)
                })
                .catch((error) => resolve1(error))
        })
    }

    traverseTree(root, 0, scenario === 'full-tree')
        .then((data) => res.status(200).json(data))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-map-space-data', async (req, res) => {
    const { spaceId } = req.query
    const space = await Space.findOne({
        where: { id: spaceId },
        attributes: [
            'description',
            'flagImagePath',
            'totalFollowers',
            'totalPosts',
            'totalComments',
        ],
    })
    res.status(200).json(space)
})

router.get('/suggested-space-handles', (req, res) => {
    const { searchQuery } = req.query
    Space.findAll({
        where: { state: 'active', handle: { [Op.like]: `%${searchQuery}%` } },
        attributes: ['handle'],
    })
        .then((handles) => res.status(200).json(handles))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/parent-space-blacklist', async (req, res) => {
    // blacklist: root space 'all', current space, existing parents, all descendents (to prevent loops)
    const { spaceId } = req.query
    const directParents = await Space.findAll({
        attributes: ['id'],
        where: { '$DirectChildSpaces.id$': spaceId, state: 'active' },
        include: {
            model: Space,
            as: 'DirectChildSpaces',
            attributes: [],
            through: { attributes: [], where: { state: 'open' } },
        },
    })
    const descendants = await Space.findAll({
        attributes: ['id'],
        where: { '$SpaceAncestors.id$': spaceId, state: 'active' },
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: [],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })
    const blacklist = [
        1,
        +spaceId,
        ...directParents.map((s) => s.id),
        ...descendants.map((s) => s.id),
    ]
    res.status(200).send(blacklist)
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
            attributes: [
                'id',
                'handle',
                'name',
                'flagImagePath',
                'privacy',
                ancestorAccess(accountId),
            ],
            having: { ['ancestorAccess']: 1 },
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

router.post('/parent-space-privacy-check', async (req, res) => {
    // used in ParentSpaceRequestModal
    // checks whether the child is blocked by the parent or if the parent is blocked by the child
    // + if child has private ancestor(s) and new parent is outside of private ancestor(s)
    // + if parent is private or has private ancestor(s) and child is outside of private parent or ancestor(s)
    const { childId, parent } = req.body

    const privateChildAncestors = await Space.findAll({
        attributes: ['id', 'name', 'handle', 'flagImagePath'],
        where: { '$SpaceDescendents.id$': childId, state: 'active', privacy: 'private' },
        include: {
            model: Space,
            as: 'SpaceDescendents',
            attributes: [],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })

    const privateParentAncestors = await Space.findAll({
        attributes: ['id', 'name', 'handle', 'flagImagePath'],
        where: { '$SpaceDescendents.id$': parent.id, state: 'active', privacy: 'private' },
        include: {
            model: Space,
            as: 'SpaceDescendents',
            attributes: [],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })

    if (parent.privacy === 'private') privateParentAncestors.push(parent)

    const childBlockedBy = []
    privateChildAncestors.forEach((ancestor) => {
        const match = privateParentAncestors.find((a) => a.id === ancestor.id)
        if (!match) childBlockedBy.push(ancestor)
    })

    const parentBlockedBy = []
    privateParentAncestors.forEach((ancestor) => {
        const match = privateChildAncestors.find((a) => a.id === ancestor.id)
        if (!match) parentBlockedBy.push(ancestor)
    })

    res.status(200).json({ childBlockedBy, parentBlockedBy })
})

router.post('/post-space-privacy-check', async (req, res) => {
    // used in CreatePostModal and RepostModal
    // checks whether the newly selected space is restricted by the previously selected spaces
    // or whether the previously selected spaces are restricted by the newly selected space
    const { newSpaceId, otherSpaceIds } = req.body

    // grab the newly selected space and all its private ancestors
    const newSpace = await Space.findOne({
        where: { id: newSpaceId },
        attributes: ['id', 'name', 'handle', 'flagImagePath', 'privacy'],
        include: {
            model: Space,
            as: 'SpaceAncestors',
            where: { state: 'active', privacy: 'private' },
            required: false,
            attributes: ['id', 'name', 'handle', 'flagImagePath'],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
    })
    const newSpaceRestrictors = [...newSpace.SpaceAncestors]
    if (newSpace.privacy === 'private') newSpaceRestrictors.push(newSpace)

    // loop through the other selected spaces
    Promise.all(
        otherSpaceIds.map(
            (otherSpaceId) =>
                new Promise(async (resolve) => {
                    // grab the other selected space and all its private ancestors
                    const otherSpace = await Space.findOne({
                        where: { id: otherSpaceId },
                        attributes: ['id', 'name', 'handle', 'flagImagePath', 'privacy'],
                        include: {
                            model: Space,
                            as: 'SpaceAncestors',
                            where: { state: 'active', privacy: 'private' },
                            required: false,
                            attributes: ['id', 'name', 'handle', 'flagImagePath'],
                            through: {
                                attributes: [],
                                where: { state: { [Op.or]: ['open', 'closed'] } },
                            },
                        },
                    })
                    const otherSpaceRestrictors = [...otherSpace.SpaceAncestors]
                    if (otherSpace.privacy === 'private') otherSpaceRestrictors.push(otherSpace)

                    const blockedByNewSpace = []
                    const blockedByOtherSpace = []
                    // check whether it's blocked by the new space
                    newSpaceRestrictors.forEach((space) => {
                        const match = otherSpaceRestrictors.find((a) => a.id === space.id)
                        if (!match) blockedByNewSpace.push(space)
                    })
                    // check whether it blocks the new space
                    otherSpaceRestrictors.forEach((space) => {
                        const match = newSpaceRestrictors.find((a) => a.id === space.id)
                        if (!match) blockedByOtherSpace.push(space)
                    })
                    resolve({
                        id: otherSpace.id,
                        name: otherSpace.name,
                        handle: otherSpace.handle,
                        flagImagePath: otherSpace.flagImagePath,
                        blockedByNewSpace,
                        blockedByOtherSpace,
                    })
                })
        )
    )
        .then((spaces) => {
            const otherSpacesBlockedByNewSpace = spaces.filter((s) => s.blockedByNewSpace.length)
            const otherSpacesBlockingNewSpace = spaces.filter((s) => s.blockedByOtherSpace.length)
            const data = {}
            if (otherSpacesBlockedByNewSpace.length) {
                data.blockedByNewSpace = true
                data.otherSpaces = otherSpacesBlockedByNewSpace
            } else if (otherSpacesBlockingNewSpace.length) {
                data.blockedByOtherSpaces = true
                data.otherSpaces = otherSpacesBlockingNewSpace
            }
            res.status(200).json(data)
        })
        .catch((error) => res.status(500).json({ message: 'Error' }))
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
        .then((space) => res.status(200).send(space.UsersWithAccess.map((u) => u.id)))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/space-mods', async (req, res) => {
    const { spaceId } = req.query
    Space.findOne({
        where: { id: spaceId },
        attributes: [],
        include: [
            {
                model: User,
                as: 'Moderators',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
                through: { where: { relationship: 'moderator', state: 'active' }, attributes: [] },
            },
        ],
    })
        .then((space) => res.status(200).send(space.Moderators))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// POST
router.post('/find-spaces', authenticateToken, (req, res) => {
    // used to find spaces in CreatePostModal, RepostModal, and GlobalSearchBar
    const accountId = req.user ? req.user.id : null
    const { query, blacklist, spaceId, spaceAccessRequired } = req.body

    function findWhere() {
        let where = {
            state: 'active',
            '$SpaceAncestors.id$': spaceId || 1,
            [Op.or]: [
                { handle: { [Op.like]: `%${query}%` } },
                { name: { [Op.like]: `%${query}%` } },
                // bio not included here as it results in too many irrelevant matches
            ],
        }
        if (blacklist && blacklist.length) where[Op.not] = [{ id: blacklist }]
        return where
    }

    function findAttributes() {
        let attributes = [
            'id',
            'handle',
            'name',
            'flagImagePath',
            'privacy',
            ancestorAccess(accountId),
        ]
        if (spaceAccessRequired) attributes.push(spaceAccess(accountId))
        return attributes
    }

    function findHaving() {
        let having = { ancestorAccess: 1 }
        if (spaceAccessRequired) having[Op.or] = [{ privacy: 'public' }, { spaceAccess: 'active' }]
        return having
    }

    Space.findAll({
        where: findWhere(),
        include: {
            model: Space,
            as: 'SpaceAncestors',
            attributes: [],
            through: { attributes: [], where: { state: { [Op.or]: ['open', 'closed'] } } },
        },
        limit: 20,
        order: [
            [sequelize.literal(`Space.handle = '${query}'`), 'DESC'],
            [sequelize.literal(`Space.name = '${query}'`), 'DESC'],
            [sequelize.literal(`Space.name LIKE '%${query}%'`), 'DESC'],
            [sequelize.literal(`POSITION('${query}' IN Space.name)`), 'ASC'],
            // [sequelize.literal(`totalLikes`), 'DESC'],
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
        ],
        attributes: findAttributes(),
        having: findHaving(),
        subQuery: false,
    })
        .then((spaces) => res.status(200).json(spaces))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/create-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountName, accountHandle, parentId, handle, name, description, private } = req.body
    const handleTaken = await Space.findOne({ where: { handle, state: 'active' } })

    if (!accountId) res.status(401).json({ message: 'not-logged-in' })
    else if (handleTaken) res.status(409).json({ message: 'handle-taken' })
    else {
        const newSpace = await Space.create({
            creatorId: accountId,
            handle,
            name,
            description,
            state: 'active',
            privacy: private ? 'private' : 'public',
            inviteToken: private ? crypto.randomBytes(64).toString('hex') : null,
            totalPostLikes: 0,
            totalPosts: 0,
            totalComments: 0,
            totalFollowers: 1,
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
            const authorizedToAttachParent =
                parentId === 1 || (await isAuthorizedModerator(accountId, parentId))
            if (authorizedToAttachParent) {
                attachParentSpace(newSpace.id, parentId)
                    .then(() => res.status(200).json({ spaceId: newSpace.id, message: 'success' }))
                    .catch((error) => res.status(500).json({ message: 'Error', error }))
            } else {
                const parentSpace = await Space.findOne({
                    where: { id: parentId },
                    attributes: ['id', 'handle', 'name', 'privacy'],
                    include: [
                        {
                            model: User,
                            as: 'Moderators',
                            attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                            through: {
                                where: { relationship: 'moderator', state: 'active' },
                                attributes: [],
                            },
                        },
                        {
                            model: Space,
                            as: 'SpaceAncestors',
                            where: { state: 'active', privacy: 'private' },
                            required: false,
                            attributes: ['id'],
                            through: {
                                attributes: [],
                                where: { state: { [Op.or]: ['open', 'closed'] } },
                            },
                        },
                    ],
                })
                // if private parent or ancestor, don't attach to root
                const hiddenSpace =
                    parentSpace.privacy === 'private' || parentSpace.SpaceAncestors.length > 0

                // if not authorized to attach to parent
                const attachToRoot = hiddenSpace
                    ? null
                    : await SpaceParent.create({
                          spaceAId: 1, // parent
                          spaceBId: newSpace.id, // child
                          state: 'open',
                      })

                const createAncestorRelationship = hiddenSpace
                    ? null
                    : await SpaceAncestor.create({
                          spaceAId: 1, // ancestor
                          spaceBId: newSpace.id, // descendent
                          state: 'open',
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
                                const sendEmail = mod.emailsDisabled
                                    ? null
                                    : await sgMail.send({
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

                Promise.all([attachToRoot, createAncestorRelationship, notifyMods])
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

// todo: update front and back end error handling
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
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
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
                        const sendEmail = user.emailsDisabled
                            ? null
                            : await sgMail.send({
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
                ? await new Promise(async (resolve) => {
                      const createSpaceUser = await SpaceUser.create({
                          relationship: 'follower',
                          state: 'active',
                          spaceId,
                          userId: accountId,
                      })
                      const space = await Space.findOne({
                          where: { id: spaceId },
                          attributes: ['totalFollowers'],
                      })
                      const updateSpaceStats = await Space.update(
                          { totalFollowers: space.totalFollowers + 1 },
                          { where: { id: spaceId }, silent: true }
                      )
                      Promise.all([createSpaceUser, updateSpaceStats])
                          .then(() => resolve())
                          .catch((error) => resolve(error))
                  })
                : null

        const updateNotification = await Notification.update(
            { state: response, seen: true },
            { where: { id: notificationId } }
        )

        const notifyInviteCreator = await new Promise(async (resolve) => {
            const inviteCreator = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
            })
            const createNotification = await Notification.create({
                ownerId: inviteCreator.id,
                type: 'space-invite-response',
                state: response,
                seen: false,
                spaceAId: spaceId,
                userId: accountId,
            })
            const sendEmail = inviteCreator.emailsDisabled
                ? null
                : await sgMail.send({
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
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
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
                        const sendEmail = mod.emailsDisabled
                            ? null
                            : await sgMail.send({
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
                ? await new Promise(async (resolve) => {
                      const createSpaceUser = await SpaceUser.create({
                          relationship: 'follower',
                          state: 'active',
                          spaceId,
                          userId,
                      })
                      const space = await Space.findOne({
                          where: { id: spaceId },
                          attributes: ['totalFollowers'],
                      })
                      const updateSpaceStats = await Space.update(
                          { totalFollowers: space.totalFollowers + 1 },
                          { where: { id: spaceId }, silent: true }
                      )
                      Promise.all([createSpaceUser, updateSpaceStats])
                          .then(() => resolve())
                          .catch((error) => resolve(error))
                  })
                : null

        const updateModNotifications = await Notification.update(
            { state: response, seen: true },
            {
                where: {
                    type: 'space-access-request',
                    spaceAId: spaceId,
                    userId: userId,
                    state: 'pending',
                },
            }
        )

        const notifyRequestCreator = await new Promise(async (resolve) => {
            const requestCreator = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
            })
            const createNotification = await Notification.create({
                ownerId: requestCreator.id,
                type: 'space-access-response',
                state: response,
                seen: false,
                spaceAId: spaceId,
                userId: accountId,
            })
            const sendEmail = requestCreator.emailsDisabled
                ? null
                : await sgMail.send({
                      to: requestCreator.email,
                      from: {
                          email: 'admin@weco.io',
                          name: 'we { collective }',
                      },
                      subject: 'New notification',
                      text: `
                    Hi ${requestCreator.name}, ${accountName} just ${response} your request to access ${spaceName}: ${config.appURL}/s/${spaceHandle} on weco.
                `,
                      html: `
                    <p>
                        Hi ${requestCreator.name},
                        <br/>
                        <a href='${config.appURL}/u/${accountHandle}'>${accountName}</a>
                        just ${response} your request to access
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

        Promise.all([updateAccess, followSpace, updateModNotifications, notifyRequestCreator])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/accept-space-invite-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, inviteToken } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const validToken = await Space.findOne({
            where: { id: spaceId, inviteToken },
            attributes: ['id'],
        })
        if (!validToken) res.status(401).json({ message: 'Invalid token' })
        else {
            const removePending = await SpaceUser.update(
                { state: 'removed' },
                {
                    where: {
                        spaceId,
                        userId: accountId,
                        relationship: 'access',
                        state: 'pending',
                    },
                }
            )
            const createAccess = await SpaceUser.create({
                spaceId,
                userId: accountId,
                relationship: 'access',
                state: 'active',
            })
            const followSpace = await new Promise(async (resolve) => {
                const createSpaceUser = await SpaceUser.create({
                    spaceId,
                    userId: accountId,
                    relationship: 'follower',
                    state: 'active',
                })
                const space = await Space.findOne({
                    where: { id: spaceId },
                    attributes: ['totalFollowers'],
                })
                const updateSpaceStats = await Space.update(
                    { totalFollowers: space.totalFollowers + 1 },
                    { where: { id: spaceId }, silent: true }
                )
                Promise.all([createSpaceUser, updateSpaceStats])
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            })
            Promise.all([removePending, createAccess, followSpace])
                .then(() => res.status(200).json({ message: 'Success' }))
                .catch((error) => res.status(500).json({ message: 'Error', error }))
        }
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
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
        })

        const notifyUser = await Notification.create({
            ownerId: user.id,
            type: 'mod-invite',
            state: 'pending',
            seen: false,
            spaceAId: spaceId,
            userId: accountId,
        })

        const emailUser = user.emailsDisabled
            ? null
            : await sgMail.send({
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
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
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

        const emailUser = user.emailsDisabled
            ? null
            : await sgMail.send({
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

router.post('/toggle-follow-space', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { spaceId, isFollowing } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const space = await Space.findOne({
            where: { id: spaceId },
            attributes: ['totalFollowers'],
        })
        const updateState = isFollowing
            ? new Promise(async (resolve) => {
                  const updateSpaceUser = await SpaceUser.update(
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
                  const updateSpaceStats = await Space.update(
                      { totalFollowers: space.totalFollowers - 1 },
                      { where: { id: spaceId }, silent: true }
                  )
                  Promise.all([updateSpaceUser, updateSpaceStats])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : new Promise(async (resolve) => {
                  const updateSpaceUser = await SpaceUser.create({
                      userId: accountId,
                      spaceId,
                      relationship: 'follower',
                      state: 'active',
                  })
                  const updateSpaceStats = await Space.update(
                      { totalFollowers: space.totalFollowers + 1 },
                      { where: { id: spaceId }, silent: true }
                  )
                  Promise.all([updateSpaceUser, updateSpaceStats])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        updateState
            .then(() => res.status(200).json({ message: 'Success' }))
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
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
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

                        const sendEmail = mod.emailsDisabled
                            ? null
                            : await sgMail.send({
                                  to: mod.email,
                                  from: { email: 'admin@weco.io', name: 'we { collective }' },
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
    // todo: check space has not already been deleted (causes bug if accepted after being removed)

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

router.post('/remove-parent-relationship', authenticateToken, async (req, res) => {
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

    // todo: clean up other records in db?

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

// router.post('/join-spaces', authenticateToken, (req, res) => {
//     const accountId = req.user ? req.user.id : null
//     const spaceIds = req.body

//     if (!accountId) res.status(401).json({ message: 'Unauthorized' })
//     else {
//         Promise.all(
//             spaceIds.map((spaceId) =>
//                 SpaceUser.create({
//                     userId: accountId,
//                     spaceId,
//                     relationship: 'follower',
//                     state: 'active',
//                 })
//             )
//         )
//             .then(() => res.status(200).json({ message: 'Success' }))
//             .catch((error) => res.status(500).json({ message: 'Error', error }))
//     }
// })
