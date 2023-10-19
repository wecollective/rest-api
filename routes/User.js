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
    findPostOrder,
    findUserOrder,
    findPostType,
    findInitialPostAttributes,
    findInitialPostAttributesWithAccess,
    findFullPostAttributes,
    findPostWhere,
    findPostInclude,
    isFollowingUser,
    totalUserPosts,
    totalUserComments,
} = require('../Helpers')
const { Space, User, Post, GlassBeadGame, UserUser } = require('../models')

// GET
router.get('/all-users', (req, res) => {
    const { timeRange, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    function findFirstAttributes() {
        let firstAttributes = ['id']
        if (sortBy === 'Posts') firstAttributes.push(totalUserPosts)
        if (sortBy === 'Comments') firstAttributes.push(totalUserComments)
        return firstAttributes
    }

    let startDate = findStartDate(timeRange)
    let order = findUserOrder(sortBy, sortOrder)
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
                    totalUserPosts,
                    totalUserComments,
                ],
                order,
                // include: []
            }).then((data) => {
                res.json(data)
            })
        })
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/user-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
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
            'gcId',
            'createdAt',
            totalUserPosts,
            isFollowingUser(accountId),
        ],
    })
    if (user) res.status(200).json(user)
    else res.status(404).json({ message: 'User not found' })
})

router.get('/user-modal-data', async (req, res) => {
    const { userId } = req.query
    const user = await User.findOne({
        where: { id: userId },
        attributes: ['bio', totalUserPosts, totalUserComments],
    })
    if (user) res.status(200).json(user)
    else res.status(404).json({ message: 'User not found' })
})

router.get('/user-posts', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userId, timeRange, postType, sortBy, sortOrder, searchQuery, limit, offset } = req.query

    const ownAccount = accountId === +userId
    const startDate = findStartDate(timeRange)
    const type = findPostType(postType)
    const order = findPostOrder(sortBy, sortOrder)
    const where = findPostWhere('user', userId, startDate, type, searchQuery, [])
    const initialAttributes = ownAccount
        ? findInitialPostAttributes(sortBy, accountId)
        : findInitialPostAttributesWithAccess(sortBy, accountId)
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
        having: ownAccount ? null : { ['access']: 1 },
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

router.post('/toggle-follow-user', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userId, isFollowing } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // todo: notify user
        const updateState = isFollowing
            ? UserUser.update(
                  { state: 'removed' },
                  {
                      where: {
                          userAId: accountId,
                          userBId: userId,
                          relationship: 'follower',
                          state: 'active',
                      },
                  }
              )
            : UserUser.create({
                  userAId: accountId,
                  userBId: userId,
                  relationship: 'follower',
                  state: 'active',
              })

        updateState
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router
