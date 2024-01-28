require('dotenv').config()
const { appURL } = require('../Config')
const express = require('express')
const router = express.Router()
const sgMail = require('@sendgrid/mail')
const { scheduleEventNotification } = require('../ScheduledTasks')
const { v4: uuidv4 } = require('uuid')
const puppeteer = require('puppeteer')
const aws = require('aws-sdk')
const authenticateToken = require('../middleware/authenticateToken')
const sequelize = require('sequelize')
const { Op, QueryTypes } = sequelize
const db = require('../models/index')
const {
    isValidUrl,
    findFullPostAttributes,
    findPostInclude,
    postAccess,
    sourcePostId,
    getLinkedItem,
    getFullLinkedItem,
    accountLike,
    accountMuted,
    attachParentSpace,
    createSpacePost,
    accountReaction,
    accountComment,
    accountLink,
    uploadFiles,
    createPost,
    scheduleNextBeadDeadline,
    createUrl,
    fullPostAttributes,
    defaultPostValues,
} = require('../Helpers')
const {
    Space,
    SpacePost,
    SpaceUser,
    SpaceUserStat,
    User,
    Post,
    Reaction,
    Event,
    UserEvent,
    Prism,
    PlotGraph,
    Link,
    Notification,
    GlassBeadGame,
    Image,
    Poll,
    Url,
    Audio,
    ToyBoxItem,
    PostAncestor,
} = require('../models')

// initialise
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-west-1',
})

// testing
let testIndex = 0
router.get('/test', async (req, res) => {
    if (testIndex > 0) {
        console.log('second attempt')
        res.send('second attempt')
    } else {
        console.log('first attempt')
        testIndex += 1
    }
})

// GET
router.get('/post-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, type } = req.query
    const where = { id: postId, state: 'active' }
    if (type) where.type = type
    const post = await Post.findOne({
        where: { id: postId, state: 'active' },
        include: findPostInclude(accountId),
        attributes: [postAccess(accountId), ...fullPostAttributes],
    })
    if (!post) res.status(404).json({ message: 'Post not found' })
    else if (!post.dataValues.access) res.status(401).json({ message: 'Access denied' })
    else if (post.state === 'deleted') res.status(401).json({ message: 'Post deleted' })
    else if (post.type.includes('block')) {
        // fetch block media
        const mediaType = post.type.split('-')[0]
        let model = Url
        let attributes = ['url', 'image', 'title', 'description', 'domain', 'favicon']
        if (['image', 'audio'].includes(mediaType)) attributes = ['url']
        if (mediaType === 'image') model = Image
        if (mediaType === 'audio') model = Audio
        const linkToMedia = await Link.findOne({
            where: { itemAId: postId, itemBType: mediaType, state: 'active' },
            attributes: [],
            include: { model, attributes },
        })
        if (mediaType === 'url') post.setDataValue('Url', linkToMedia.Url)
        if (mediaType === 'image') post.setDataValue('Image', linkToMedia.Image)
        if (mediaType === 'audio') post.setDataValue('Audio', linkToMedia.Audio)
        res.status(200).json(post)
    } else res.status(200).json(post)
})

router.get('/account-reactions', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postType, postId, types } = req.query
    const liked = types.includes('like')
        ? await accountReaction('like', postType, postId, accountId)
        : 0
    const rated = types.includes('rating')
        ? await accountReaction('rating', postType, postId, accountId)
        : 0
    const reposted = types.includes('repost')
        ? await accountReaction('repost', postType, postId, accountId)
        : 0
    const commented = types.includes('comment') ? await accountComment(postId, accountId) : 0
    const linked = types.includes('link') ? await accountLink(postId, accountId) : 0
    res.status(200).json({ liked, rated, reposted, commented, linked })
})

router.get('/parent-links', async (req, res) => {
    const { postId } = req.query
    const [{ parentId }] = await db.sequelize.query(
        `SELECT itemAId AS parentId FROM Links
        WHERE itemBId = :postId
        AND relationship = 'parent'`, // AND state = 'active'
        { replacements: { postId }, type: QueryTypes.SELECT }
    )
    const root = await db.sequelize.query(
        `SELECT itemAId AS rootId FROM Links
        WHERE itemBId = :postId
        AND relationship = 'root'`, // AND state = 'active'
        { replacements: { postId }, type: QueryTypes.SELECT }
    )
    // only pass back rootId if present and different from parentId
    let rootId = null
    if (root[0] && root[0].rootId !== parentId) rootId = root[0].rootId
    res.status(200).json({ parentId, rootId })
})

router.get('/likes', async (req, res) => {
    const { type, id } = req.query
    Reaction.findAll({
        where: { itemType: type, itemId: id, type: 'like', state: 'active' },
        attributes: ['id'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-reposts', async (req, res) => {
    const { postId } = req.query
    Reaction.findAll({
        where: { itemType: 'post', itemId: postId, type: 'repost', state: 'active' },
        attributes: ['id'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Space,
                as: 'Space',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/ratings', async (req, res) => {
    const { type, id } = req.query
    Reaction.findAll({
        where: { itemType: type, itemId: id, type: 'rating', state: 'active' },
        attributes: ['id', 'value'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
        .then((reactions) => res.status(200).json(reactions))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/links', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { itemType, itemId, linkTypes } = req.query
    const sourceItem = await getFullLinkedItem(itemType, itemId, accountId)
    if (!sourceItem) res.status(404).send({ message: 'Source not found' })
    else {
        sourceItem.setDataValue('uuid', uuidv4())
        sourceItem.setDataValue('parentItemId', null)
        if (['user', 'space'].includes(itemType)) {
            sourceItem.setDataValue('totalLikes', 0)
            sourceItem.setDataValue('totalLinks', 0)
        }

        function findTypes() {
            if (linkTypes === 'All Types') return ['post', 'comment', 'user', 'space']
            if (linkTypes === 'Posts') return ['post']
            if (linkTypes === 'Comments') return ['comment']
            if (linkTypes === 'Spaces') return ['user']
            if (linkTypes === 'Users') return ['space']
        }

        async function getLinkedItems(source, depth) {
            return new Promise(async (resolve) => {
                const { id, modelType, parentItemId } = source.dataValues
                // console.log(666, 'parentItemId', parentItemId)
                const links = await Link.findAll({
                    limit: depth === 0 ? 10 : 5,
                    order: [['totalLikes', 'DESC']],
                    attributes: [
                        'id',
                        'itemAId',
                        'itemBId',
                        'itemAType',
                        'itemBType',
                        'description',
                        'totalLikes',
                        'createdAt',
                    ],
                    where: {
                        state: 'active',
                        [Op.or]: [
                            {
                                // incoming
                                relationship: 'link',
                                itemBType: modelType,
                                itemBId: id,
                                itemAType: findTypes(),
                                itemAId: { [Op.not]: parentItemId },
                            },
                            {
                                // outgoing
                                relationship: 'link',
                                itemAType: modelType,
                                itemAId: id,
                                itemBType: findTypes(),
                                itemBId: { [Op.not]: parentItemId },
                            },
                        ],
                    },
                })
                const linkedItems = []
                Promise.all(
                    links.map(async (link) => {
                        link.setDataValue('uuid', uuidv4())
                        // incoming links
                        if (link.itemAId === id && link.itemAType === modelType) {
                            link.setDataValue('direction', 'outgoing')
                            const item = await getLinkedItem(link.itemBType, link.itemBId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(link.itemBType)) {
                                    item.setDataValue('totalLikes', 0)
                                    item.setDataValue('totalLinks', 0)
                                }
                                linkedItems.push({ item, Link: link })
                            }
                        }
                        // outgoing links
                        if (link.itemBId === id && link.itemBType === modelType) {
                            link.setDataValue('direction', 'incoming')
                            const item = await getLinkedItem(link.itemAType, link.itemAId)
                            if (item) {
                                item.setDataValue('uuid', uuidv4())
                                item.setDataValue('parentItemId', id)
                                if (['user', 'space'].includes(link.itemBType)) {
                                    item.setDataValue('totalLikes', 0)
                                    item.setDataValue('totalLinks', 0)
                                }
                                linkedItems.push({ item, Link: link })
                            }
                        }
                    })
                )
                    .then(() => {
                        source.setDataValue(
                            'children',
                            linkedItems.sort((a, b) => b.Link.totalLikes - a.Link.totalLikes)
                        )
                        source.setDataValue('depth', depth)
                        if (linkedItems.length && depth < 2)
                            Promise.all(
                                linkedItems.map(
                                    async (child) => await getLinkedItems(child.item, depth + 1)
                                )
                            ).then(() => resolve())
                        else resolve()
                    })
                    .catch((error) => resolve(error))
            })
        }

        getLinkedItems(sourceItem, 0).then(() => res.json({ item: sourceItem }))
    }
})

router.get('/link-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { linkId } = req.query
    const link = await Link.findOne({
        where: { id: linkId },
        attributes: [
            'id',
            'type',
            'description',
            'itemAId',
            'itemBId',
            'itemAType',
            'itemBType',
            'totalLikes',
            'createdAt',
        ],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
        },
    })
    const liked = await accountReaction('like', 'link', linkId, accountId)
    if (liked) link.setDataValue('liked', liked)
    const source = await getFullLinkedItem(link.itemAType, link.itemAId, accountId)
    const target = await getFullLinkedItem(link.itemBType, link.itemBId, accountId)
    res.status(200).json({ source, link, target })
})

router.get('/target-from-text', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, sourceId, text, userId } = req.query
    const where = {
        type: type.toLowerCase(),
        state: 'active',
        [Op.or]: [{ text: { [Op.like]: `%${text}%` } }, { title: { [Op.like]: `%${text}%` } }],
    }
    if (sourceId) where[Op.not] = { id: sourceId }
    if (userId) where.creatorId = userId
    const matchingPosts = await Post.findAll({
        where,
        limit: 10,
        include: findPostInclude(accountId),
    })
    res.status(200).json(matchingPosts)
})

// attempt to nest full depth with includes (breaks on second post include with limit applied)
// router.get('/post-comments', async (req, res) => {
//     const { postId, offset, filter } = req.query
//     const limits = [5, 4, 3, 2, 1] // number of comments to inlcude per generation (length of array determines max depth)
//     let order = [
//         // default 'top'
//         ['totalLikes', 'DESC'],
//         ['createdAt', 'ASC'],
//         ['id', 'ASC'],
//     ]
//     if (filter === 'new')
//         order = [
//             ['createdAt', 'DESC'],
//             ['id', 'ASC'],
//         ]
//     if (filter === 'old')
//         order = [
//             ['createdAt', 'ASC'],
//             ['id', 'ASC'],
//         ]
//     const root = await Post.findOne({
//         where: { id: postId },
//         attributes: ['id', 'type', 'totalChildComments'],
//         include: {
//             model: Link,
//             as: 'OutgoingCommentLinks',
//             separate: true,
//             // subQuery: false,
//             where: { relationship: 'parent', itemBType: 'comment' },
//             attributes: ['id'],
//             order,
//             limit: 3,
//             offset: +offset,
//             include: {
//                 model: Post,
//                 required: true,
//                 // subQuery: false,
//                 attributes: [...fullPostAttributes, 'totalChildComments'],
//                 include: {
//                     model: Link,
//                     as: 'OutgoingCommentLinks',
//                     separate: true,
//                     // subQuery: false,
//                     // required: false,
//                     where: { relationship: 'parent', itemBType: 'comment' },
//                     attributes: ['id'],
//                     order,
//                     limit: 3,
//                     // offset: +offset,
//                     include: {
//                         model: Post,
//                         // subQuery: false,
//                         required: true,
//                         // as: 'A',
//                         attributes: [...fullPostAttributes, 'totalChildComments'],
//                     },
//                 },
//             },
//         },
//     })

//     res.status(200).json({
//         totalChildren: root.totalChildComments,
//         root,
//         // comments: root.,
//     })
// })

// // attempt to use links as root instead of get blocks (1.25s without media blocks)
// router.get('/post-comments', async (req, res) => {
//     const { postId, offset, filter } = req.query
//     const limits = [5, 4, 3, 2, 1] // number of comments to inlcude per generation (length of array determines max depth)
//     const post = await Post.findOne({
//         where: { id: postId },
//         attributes: ['id', 'type', 'totalChildComments'],
//     })
//     let order = [
//         // default 'top'
//         ['totalLikes', 'DESC'],
//         ['createdAt', 'ASC'],
//         ['id', 'ASC'],
//     ]
//     if (filter === 'new')
//         order = [
//             ['createdAt', 'DESC'],
//             ['id', 'ASC'],
//         ]
//     if (filter === 'old')
//         order = [
//             ['createdAt', 'ASC'],
//             ['id', 'ASC'],
//         ]

//     async function getChildComments(parent, depth) {
//         return new Promise(async (resolve) => {
//             const comments = await Link.findAll({
//                 where: {
//                     itemAId: parent.id,
//                     // itemAType: parent.type,
//                     itemBType: 'comment',
//                     relationship: 'parent',
//                 },
//                 limit: limits[depth],
//                 offset: depth ? 0 : +offset,
//                 order,
//                 include: {
//                     model: Post,
//                     attributes: [...fullPostAttributes, 'totalChildComments'],
//                     include: [
//                         {
//                             model: User,
//                             as: 'Creator',
//                             attributes: ['id', 'handle', 'name', 'flagImagePath'],
//                         },
//                         // {
//                         //     model: Link,
//                         //     as: 'UrlBlocks',
//                         //     separate: true,
//                         //     where: { itemBType: 'url-block' },
//                         //     attributes: ['index'],
//                         //     order: [['index', 'ASC']],
//                         //     include: {
//                         //         model: Post,
//                         //         attributes: ['id'],
//                         //         include: {
//                         //             model: Link,
//                         //             as: 'MediaLink',
//                         //             attributes: ['id'],
//                         //             include: {
//                         //                 model: Url,
//                         //                 attributes: [
//                         //                     'url',
//                         //                     'image',
//                         //                     'title',
//                         //                     'description',
//                         //                     'domain',
//                         //                 ],
//                         //             },
//                         //         },
//                         //     },
//                         // },
//                         // {
//                         //     model: Link,
//                         //     as: 'ImageBlocks',
//                         //     separate: true,
//                         //     where: { itemBType: 'image-block', index: [0, 1, 2, 3] },
//                         //     attributes: ['index'],
//                         //     order: [['index', 'ASC']],
//                         //     include: {
//                         //         model: Post,
//                         //         attributes: ['id', 'text'],
//                         //         include: {
//                         //             model: Link,
//                         //             as: 'MediaLink',
//                         //             attributes: ['id'],
//                         //             include: {
//                         //                 model: Image,
//                         //                 attributes: ['url'],
//                         //             },
//                         //         },
//                         //     },
//                         // },
//                         // {
//                         //     model: Link,
//                         //     as: 'AudioBlocks',
//                         //     separate: true,
//                         //     where: { itemBType: 'audio-block' },
//                         //     attributes: ['index'],
//                         //     order: [['index', 'ASC']],
//                         //     include: {
//                         //         model: Post,
//                         //         attributes: ['id', 'text'],
//                         //         include: {
//                         //             model: Link,
//                         //             as: 'MediaLink',
//                         //             attributes: ['id'],
//                         //             include: {
//                         //                 model: Audio,
//                         //                 attributes: ['url'],
//                         //             },
//                         //         },
//                         //     },
//                         // },
//                     ],
//                 },
//             })

//             // remove deleted comments with no replies
//             const filteredComments = comments
//                 .map((c) => c.Post)
//                 .filter((c) => c.state === 'active' || c.totalComments)
//             filteredComments.forEach((c) => c.setDataValue('Comments', []))
//             parent.setDataValue('Comments', filteredComments)
//             if (!limits[depth + 1]) resolve()
//             else {
//                 Promise.all(
//                     parent.dataValues.Comments.map((comment) =>
//                         getChildComments(comment, depth + 1)
//                     )
//                 )
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             }
//         })
//     }

//     getChildComments(post, 0)
//         .then(() =>
//             res.status(200).json({
//                 totalChildren: post.totalChildComments,
//                 comments: post.dataValues.Comments,
//             })
//         )
//         .catch((error) => res.status(500).json({ message: 'Error', error }))
// })

// attempt to get post data seperately (2.6s)
// router.get('/post-comments', async (req, res) => {
//     const { postId, offset, filter } = req.query
//     const limits = [5, 4, 3, 2, 1] // number of comments to inlcude per generation (length of array determines max depth)
//     const post = await Post.findOne({
//         where: { id: postId },
//         attributes: ['id', 'type', 'totalChildComments'],
//     })
//     let order = [
//         // default 'top'
//         ['totalLikes', 'DESC'],
//         ['createdAt', 'ASC'],
//         ['id', 'ASC'],
//     ]
//     if (filter === 'new')
//         order = [
//             ['createdAt', 'DESC'],
//             ['id', 'ASC'],
//         ]
//     if (filter === 'old')
//         order = [
//             ['createdAt', 'ASC'],
//             ['id', 'ASC'],
//         ]

//     async function getChildComments(parent, depth) {
//         return new Promise(async (resolve) => {

//             const comments = await Link.findAll({
//                 where: {
//                     itemAId: parent.id,
//                     // itemAType: parent.type,
//                     itemBType: 'comment',
//                     relationship: 'parent',
//                 },
//                 limit: limits[depth],
//                 offset: depth ? 0 : +offset,
//                 order,
//                 include: {
//                     model: Post,
//                     attributes: [...fullPostAttributes, 'totalChildComments'],
//                     include: [
//                         {
//                             model: User,
//                             as: 'Creator',
//                             attributes: ['id', 'handle', 'name', 'flagImagePath'],
//                         },
//                     ],
//                 },
//             })

//             Promise.all(comments.map((commentLink) => new Promise((resolve2) => {

//             })))

//             // remove deleted comments with no replies
//             const filteredComments = comments
//                 .map((c) => c.Post)
//                 .filter((c) => c.state === 'active' || c.totalComments)
//             filteredComments.forEach((c) => c.setDataValue('Comments', []))
//             parent.setDataValue('Comments', filteredComments)
//             if (!limits[depth + 1]) resolve()
//             else {
//                 Promise.all(
//                     parent.dataValues.Comments.map((comment) =>
//                         getChildComments(comment, depth + 1)
//                     )
//                 )
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             }
//         })
//     }

//     getChildComments(post, 0)
//         .then(() =>
//             res.status(200).json({
//                 totalChildren: post.totalChildComments,
//                 comments: post.dataValues.Comments,
//             })
//         )
//         .catch((error) => res.status(500).json({ message: 'Error', error }))
// })

router.get('/post-comments', async (req, res) => {
    // failed approaches:
    // + full nested include with no recursive promises (doesn't allow limit beyond first generation)
    // + get links first instead of using getBlocks function ~1.5s
    const { postId, offset, filter } = req.query
    const limits = [5, 4, 3, 2, 1] // number of comments to inlcude per generation (length of array determines max depth)
    const post = await Post.findOne({
        where: { id: postId },
        attributes: ['id', 'type', 'totalChildComments'],
    })
    let order = [
        // default 'top'
        ['totalLikes', 'DESC'],
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
    ]
    if (filter === 'new')
        order = [
            ['createdAt', 'DESC'],
            ['id', 'ASC'],
        ]
    if (filter === 'old')
        order = [
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
        ]

    async function getChildComments(parent, depth) {
        return new Promise(async (resolve) => {
            const comments = await parent.getBlocks({
                attributes: [...fullPostAttributes, 'totalChildComments'],
                through: {
                    where: { itemBType: 'comment', relationship: 'parent', state: 'active' },
                },
                joinTableAttributes: [],
                include: [
                    {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'handle', 'name', 'flagImagePath'],
                    },
                ],
                limit: limits[depth],
                offset: depth ? 0 : +offset,
                order,
            })
            // remove deleted comments with no replies
            const filteredComments = comments.filter((c) => c.state === 'active' || c.totalComments)
            filteredComments.forEach((c) => c.setDataValue('Comments', []))
            parent.setDataValue('Comments', filteredComments)
            if (!limits[depth + 1]) resolve()
            else {
                Promise.all(
                    parent.dataValues.Comments.map((comment) =>
                        getChildComments(comment, depth + 1)
                    )
                )
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            }
        })
    }

    getChildComments(post, 0)
        .then(() =>
            res.status(200).json({
                totalChildren: post.totalChildComments,
                comments: post.dataValues.Comments,
            })
        )
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/post-indirect-spaces', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({
        where: { id: postId },
        include: {
            model: Space,
            as: 'IndirectSpaces',
            attributes: ['id', 'handle', 'name', 'flagImagePath'],
            through: { where: { relationship: 'indirect' }, attributes: [] },
        },
    })
    res.status(200).json(post.IndirectSpaces)
})

router.get('/poll-data', async (req, res) => {
    const { postId } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const poll = await Poll.findOne({
        where: { postId: postId },
        attributes: ['id', 'type', 'answersLocked'],
    })
    const answers = await post.getAnswers({
        where: { state: 'active' },
        attributes: ['id', 'mediaTypes', 'text', 'createdAt'],
        through: { where: { itemBType: 'poll-answer', state: ['active', 'done'] } },
        joinTableAttributes: ['state'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
            {
                model: Reaction,
                where: { itemType: 'poll-answer' },
                attributes: ['value', 'state', 'itemId', 'createdAt', 'updatedAt'],
                include: {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'flagImagePath'],
                },
                required: false,
            },
        ],
    })
    poll.setDataValue('Answers', answers)
    res.status(200).json(poll)
})

router.get('/gbg-data', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, noLimit } = req.query
    const post = await Post.findOne({
        where: { id: postId },
        attributes: ['id'],
        include: { model: GlassBeadGame },
    })
    const beads = await post.getBeads({
        attributes: [...findFullPostAttributes('Post', accountId), 'color'],
        through: { where: { itemBType: 'bead', state: ['active', 'account-deleted'] } },
        joinTableAttributes: ['state', 'index'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
        order: [[sequelize.col('Link.index'), 'ASC']],
        limit: noLimit ? null : 3,
    })
    const players = await post.getPlayers({
        attributes: ['id', 'handle', 'name', 'flagImagePath', 'state'],
        through: { where: { type: 'glass-bead-game' } },
        joinTableAttributes: ['state', 'color'],
    })

    res.status(200).json({ game: post.GlassBeadGame, beads, players })
})

router.get('/next-beads', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, offset } = req.query
    const post = await Post.findOne({ where: { id: postId }, attributes: ['id'] })
    const beads = await post.getBeads({
        attributes: [...findFullPostAttributes('Post', accountId), 'color'],
        through: { where: { itemBType: 'bead', state: ['active', 'account-deleted'] } },
        joinTableAttributes: ['index', 'relationship', 'state'],
        include: [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        ],
        order: [[sequelize.col('Link.index'), 'ASC']],
        offset: +offset,
        limit: 10,
    })

    res.status(200).json(beads)
})

router.get('/prism-data', (req, res) => {
    const { postId } = req.query
    Prism.findOne({
        where: { postId: postId },
        include: [
            {
                model: User,
                attributes: ['handle', 'name', 'flagImagePath'],
                through: { attributes: [] },
            },
        ],
    })
        .then((prism) => res.status(200).json(prism))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/plot-graph-data', (req, res) => {
    const { postId } = req.query
    PlotGraph.findOne({ where: { postId: postId } })
        .then((plotGraph) => res.status(200).json(plotGraph))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.get('/scrape-url', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { url } = req.query
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    // else if (!isValidUrl(url)) return res.status(400).json({ message: 'Invalid URL' })
    else {
        const browser = await puppeteer.launch({ headless: 'new' })
        try {
            const page = await browser.newPage()
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
            ]
            await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)])
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }) // waitUntil: 'load', 'domcontentloaded', 'networkidle0', 'networkidle2'
            await page.waitForSelector('title')
            const urlData = await page.evaluate(async () => {
                let data = {
                    title: document.title || null,
                    description: null,
                    domain: null,
                    favicon: null,
                    image: null,
                }
                // description
                const ogDescription = await document.querySelector(
                    'meta[property="og:description"]'
                )
                if (ogDescription) data.description = ogDescription.content
                else {
                    const nameDescription = await document.querySelector('meta[name="description"]')
                    if (nameDescription) data.description = nameDescription.content
                }
                // domain
                const ogSiteName = await document.querySelector('meta[property="og:site_name"]')
                if (ogSiteName) data.domain = ogSiteName.content
                // favicon
                const favicon = await document.querySelector('link[rel="icon"]')
                if (favicon) data.favicon = favicon.href
                // image
                const metaImage = await document.querySelector('meta[property="og:image"]')
                if (metaImage) data.image = metaImage.content
                else {
                    const firstImage = await document.querySelector('body div img')
                    if (firstImage) data.image = firstImage.src
                }
                return data
            })
            // manually create domain if not present
            if (!urlData.domain) urlData.domain = url.split('://')[1].split('/')[0].toUpperCase()
            // create full url for image if incomplete
            if (urlData.image && urlData.image[0] === '/')
                urlData.image = `https://${new URL(url).hostname}${urlData.image}`
            res.status(200).json(urlData)
        } catch (error) {
            res.status(200).json({ data: null, error })
        } finally {
            await browser.close()
        }
    }
})

router.get('/glass-bead-game-comments', async (req, res) => {
    const { postId } = req.query
    const commentLinks = await Link.findAll({
        where: {
            itemAId: postId,
            itemBType: 'gbg-room-comment',
            relationship: 'parent',
            state: 'active',
        },
        attributes: [],
        include: {
            model: Post,
            attributes: ['id', 'text', 'createdAt'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'flagImagePath'],
            },
        },
    })
    res.status(200).json(commentLinks.map((link) => link.Post))
})

// todo: update post media routes to new linking approach? (test speed differences)
// todo: set up pagination? (or restirct to ~5?)
router.get('/post-urls', async (req, res) => {
    const { postId, offset } = req.query
    const blocks = []
    const linksToBlocks = await Link.findAll({
        where: {
            itemAId: postId,
            itemBType: 'url-block',
            state: 'active',
        },
        attributes: ['index', 'itemBId'],
        order: [['index', 'ASC']],
        // offset: +offset,
        // limit: +offset ? 10 : 4,
        include: { model: Post, attributes: ['id'] },
    })
    Promise.all(
        linksToBlocks.map(
            (link) =>
                new Promise(async (resolve) => {
                    const linkToUrl = await Link.findOne({
                        where: {
                            itemAType: 'url-block',
                            itemAId: link.itemBId,
                            itemBType: 'url',
                            state: 'active',
                        },
                        attributes: [],
                        include: {
                            model: Url,
                            attributes: [
                                'url',
                                'image',
                                'title',
                                'description',
                                'domain',
                                'favicon',
                            ],
                        },
                    })
                    blocks.push({ ...link.Post.dataValues, index: link.index, Url: linkToUrl.Url })
                    resolve()
                })
        )
    )
        .then(() => res.status(200).json({ blocks: blocks.sort((a, b) => a.index - b.index) })) // total: linksToBlocks.count
        .catch((error) => res.status(500).json({ error }))
})

router.get('/post-images', async (req, res) => {
    const { postId, offset } = req.query
    const blocks = []
    const linksToBlocks = await Link.findAndCountAll({
        where: {
            itemAId: postId,
            itemBType: 'image-block',
            state: 'active',
        },
        attributes: ['index', 'itemBId'],
        order: [['index', 'ASC']],
        offset: +offset,
        limit: +offset ? 10 : 4,
        include: { model: Post, attributes: ['id', 'text'] },
    })
    Promise.all(
        linksToBlocks.rows.map(
            (link) =>
                new Promise(async (resolve) => {
                    const linkToImage = await Link.findOne({
                        where: {
                            itemAType: 'image-block',
                            itemAId: link.itemBId,
                            itemBType: 'image',
                            state: 'active',
                        },
                        attributes: [],
                        include: { model: Image, attributes: ['url'] },
                    })
                    blocks.push({
                        index: link.index,
                        ...link.Post.dataValues,
                        Image: linkToImage.Image,
                    })
                    resolve()
                })
        )
    )
        .then(() =>
            res.status(200).json({
                blocks: blocks.sort((a, b) => a.index - b.index),
                total: linksToBlocks.count,
            })
        )
        .catch((error) => res.status(500).json({ error }))

    // no faster...
    // const linksToImages = await Link.findAll({
    //     where: {
    //         itemAType: 'image-block',
    //         itemAId: linksToBlocks.rows.map((link) => link.itemBId),
    //         itemBType: 'image',
    //         state: 'active',
    //     },
    //     attributes: [],
    //     include: { model: Image, attributes: ['url'] },
    // })
    // res.status(200).json({
    //     blocks: linksToBlocks.rows.map((link, index) => {
    //         return {
    //             ...link.Post.dataValues,
    //             index: link.index,
    //             Image: linksToImages[index].Image,
    //         }
    //     }),
    //     total: linksToBlocks.count,
    // })
})

// todo: set up pagination? (or restirct to ~5?)
router.get('/post-audio', async (req, res) => {
    const { postId, offset } = req.query
    const blocks = []
    const linksToBlocks = await Link.findAll({
        where: {
            itemAId: postId,
            itemBType: 'audio-block',
            state: 'active',
        },
        attributes: ['index', 'itemBId'],
        order: [['index', 'ASC']],
        // offset: +offset,
        // limit: +offset ? 10 : 4,
        include: { model: Post, attributes: ['id', 'text'] },
    })
    Promise.all(
        linksToBlocks.map(
            (link) =>
                new Promise(async (resolve) => {
                    const linkToAudio = await Link.findOne({
                        where: {
                            itemAType: 'audio-block',
                            itemAId: link.itemBId,
                            itemBType: 'audio',
                            state: 'active',
                        },
                        attributes: [],
                        include: { model: Audio, attributes: ['url'] },
                    })
                    blocks.push({
                        ...link.Post.dataValues,
                        index: link.index,
                        Audio: linkToAudio.Audio,
                    })
                    resolve()
                })
        )
    )
        .then(() => res.status(200).json({ blocks: blocks.sort((a, b) => a.index - b.index) })) // total: linksToBlocks.count
        .catch((error) => res.status(500).json({ error }))
})

router.get('/post-preview-data', async (req, res) => {
    const { postId, postType, mediaType } = req.query
    new Promise(async (resolve) => {
        if (postType.includes('block')) {
            // get block media
            if (mediaType === 'url') {
                const linkToUrl = await Link.findOne({
                    where: {
                        itemAId: postId,
                        itemBType: 'url',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Url, attributes: ['url', 'image', 'title', 'description'] },
                })
                resolve(linkToUrl.Url)
            } else if (mediaType === 'image') {
                const linkToImage = await Link.findOne({
                    where: {
                        itemAId: postId,
                        itemBType: 'image',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Image, attributes: ['url'] },
                })
                resolve(linkToImage.Image)
            } else if (mediaType === 'audio') {
                const linkToAudio = await Link.findOne({
                    where: {
                        itemAId: postId,
                        itemBType: 'audio',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Audio, attributes: ['id', 'url'] },
                })
                resolve(linkToAudio.Audio)
            }
        } else {
            // get post media
            if (mediaType === 'url') {
                const [linkToUrlBlock] = await Link.findAll({
                    where: { itemAId: postId, itemBType: 'url-block', state: 'active' },
                    attributes: ['itemBId'],
                    order: [['index', 'ASC']],
                    limit: 1,
                })
                const linkToUrl = await Link.findOne({
                    where: {
                        itemAId: linkToUrlBlock.itemBId,
                        itemBType: 'url',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Url, attributes: ['url', 'image', 'title', 'description'] },
                })
                resolve(linkToUrl.Url)
            } else if (mediaType === 'image') {
                const [linkToImageBlock] = await Link.findAll({
                    where: { itemAId: postId, itemBType: 'image-block', state: 'active' },
                    attributes: ['itemBId'],
                    order: [['index', 'ASC']],
                    limit: 1,
                })
                const linkToImage = await Link.findOne({
                    where: {
                        itemAId: linkToImageBlock.itemBId,
                        itemBType: 'image',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Image, attributes: ['url'] },
                })
                resolve(linkToImage.Image)
            } else if (mediaType === 'audio') {
                const [linkToAudioBlock] = await Link.findAll({
                    where: { itemAId: postId, itemBType: 'audio-block', state: 'active' },
                    attributes: ['itemBId'],
                    order: [['index', 'ASC']],
                    limit: 1,
                })
                const linkToAudio = await Link.findOne({
                    where: {
                        itemAId: linkToAudioBlock.itemBId,
                        itemBType: 'audio',
                        state: 'active',
                    },
                    attributes: [],
                    include: { model: Audio, attributes: ['id', 'url'] },
                })
                resolve(linkToAudio.Audio)
            }
        }
    })
        .then((data) => res.status(200).json(data))
        .catch((error) => res.status(500).json({ error }))
})

// todo: potentially update to match new block include approach
router.get('/card-faces', async (req, res) => {
    const { postId } = req.query
    const blocks = []
    const linksToCardFaces = await Link.findAll({
        where: {
            itemAId: postId,
            itemBType: 'card-face',
            state: 'active',
        },
        attributes: ['index', 'itemBId'],
        order: [['index', 'ASC']],
        include: {
            model: Post,
            attributes: ['id', 'text', 'watermark', 'totalLikes', 'totalLinks'],
        },
    })
    Promise.all(
        linksToCardFaces.map(
            (link) =>
                new Promise(async (resolve) => {
                    const linkToImageBlock = await Link.findOne({
                        where: {
                            itemAId: link.Post.id,
                            itemBType: 'image-block',
                            state: 'active',
                        },
                        attributes: ['itemBId'],
                        include: { model: Post, attributes: ['id', 'text'] },
                    })
                    const linkToImage = linkToImageBlock
                        ? await Link.findOne({
                              where: {
                                  itemAType: 'image-block',
                                  itemAId: linkToImageBlock.itemBId,
                                  itemBType: 'image',
                                  state: 'active',
                              },
                              attributes: [],
                              include: { model: Image, attributes: ['url'] },
                          })
                        : null
                    blocks.push({
                        ...link.Post.dataValues,
                        Link: { index: link.index },
                        Image: linkToImage ? linkToImage.Image : null,
                    })
                    resolve()
                })
        )
    )
        .then(() => res.status(200).json(blocks))
        .catch((error) => res.status(500).json({ error }))
})

// todo: notify source creator
router.post('/create-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // upload files and create post
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post, event } = await createPost(postData, files, accountId)
        const { spaceIds, source } = postData
        // store spaceIds and update with ancestors for response
        const allSpaceIds = [...spaceIds]
        // add spaces and increment space stats
        const addSpaces = spaceIds
            ? await new Promise(async (resolve) => {
                  const addDirectSpaces = await Promise.all(
                      spaceIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'direct')
                      )
                  )
                  // gather direct spaces ancestor ids
                  const spaces = await Space.findAll({
                      where: { id: spaceIds, state: 'active' },
                      attributes: ['id'],
                      include: {
                          model: Space,
                          as: 'SpaceAncestors',
                          attributes: ['id'],
                          through: { where: { state: 'open' }, attributes: [] },
                      },
                  })
                  let ancestorIds = []
                  spaces.forEach((space) =>
                      ancestorIds.push(...space.SpaceAncestors.map((space) => space.id))
                  )
                  // remove duplicates and direct spaces
                  ancestorIds = [...new Set(ancestorIds)].filter((id) => !spaceIds.includes(id))
                  // store ancestor ids for response
                  allSpaceIds.push(...ancestorIds)
                  const addIndirectSpaces = await Promise.all(
                      ancestorIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'indirect')
                      )
                  )
                  // increment space stats
                  const incrementSpaceStats = await Space.increment('totalPosts', {
                      where: { id: allSpaceIds },
                      silent: true,
                  })
                  Promise.all([addDirectSpaces, addIndirectSpaces, incrementSpaceStats])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

        // todo: notify source creator
        const addLink = source
            ? await new Promise(async (resolve) => {
                  const createNewLink = await Link.create({
                      state: 'active',
                      creatorId: accountId,
                      relationship: 'link',
                      itemAType: source.type,
                      itemBType: 'post',
                      itemAId: source.id,
                      itemBId: post.id,
                      description: source.linkDescription,
                      totalLikes: 0,
                      totalComments: 0,
                      totalRatings: 0,
                  })
                  const updateSourceLinks = await Post.increment('totalLinks', {
                      where: { id: source.id },
                      silent: true,
                  })
                  const updateTargetLinks = await post.update({ totalLinks: 1 }, { silent: true })
                  Promise.all([createNewLink, updateSourceLinks, updateTargetLinks])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

        Promise.all([addSpaces, addLink])
            .then(() => res.status(200).json({ post, allSpaceIds, event }))
            .catch((error) => res.status(500).json(error))
    }
})

router.post('/create-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post } = await createPost(postData, files, accountId)
        const { parent } = postData.link
        // scenarios:
        // + adding comment on post
        // + adding comment on comment
        // + adding comment on bead, poll-answer, card-face, block
        const rootLink = await Link.findOne({
            where: { itemBId: parent.id, itemBType: parent.type, relationship: 'root' },
            attributes: ['itemAId', 'itemAType'],
        })
        // if parent has no root link, parent = root
        const rootPost = await Post.findOne({
            where: { id: rootLink ? rootLink.itemAId : parent.id },
            attributes: ['id', 'type'],
            include: {
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                required: false,
                attributes: ['id'],
                through: { where: { state: 'active' }, attributes: [] },
            },
        })
        const addParentLink = await Link.create({
            creatorId: accountId,
            itemAId: parent.id,
            itemAType: parent.type,
            itemBId: post.id,
            itemBType: 'comment',
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        const addRootLink = await Link.create({
            creatorId: accountId,
            itemAId: rootPost.id,
            itemAType: rootPost.type,
            itemBId: post.id,
            itemBType: 'comment',
            relationship: 'root',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        // find ancestors
        const ancestorLinks = await Link.findAll({
            where: { itemBId: parent.id, itemBType: parent.type, relationship: 'ancestor' },
            attributes: ['itemAId', 'itemAType'],
        })
        const ancestors = [
            parent,
            ...ancestorLinks.map((a) => {
                return { id: a.itemAId, type: a.itemAType }
            }),
        ]
        // create new ancestor links
        const createAncestorLinks = await Promise.all(
            ancestors.map((a) =>
                Link.create({
                    creatorId: accountId,
                    itemAId: a.id,
                    itemAType: a.type,
                    itemBId: post.id,
                    itemBType: 'comment',
                    relationship: 'ancestor',
                    state: 'active',
                    totalLikes: 0,
                    totalComments: 0,
                    totalRatings: 0,
                })
            )
        )
        // increment tallies
        const incrementAncestorsTotalComments = await Post.increment('totalComments', {
            where: { id: ancestors.map((a) => a.id) },
            silent: true,
        })
        const incrementParentsChildComments = await Post.increment('totalChildComments', {
            where: { id: parent.id },
            silent: true,
        })
        const incrementSpaceStats = Space.increment('totalComments', {
            where: { id: rootPost.AllPostSpaces.map((s) => s.id) },
            silent: true,
        })
        // update ancestors lastActivity
        const updateLastActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: ancestors.map((a) => a.id) }, silent: true }
        )
        // notify parent owner
        const notifyParentOwner = await new Promise(async (resolve) => {
            const account = await User.findOne({
                where: { id: accountId },
                attributes: ['name', 'handle'],
            })
            const parentPost = await Post.findOne({
                where: { id: parent.id },
                attributes: ['id', 'type'],
                include: {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                },
            })
            const isOwnPost = parentPost.Creator.id === accountId
            const createNotification = isOwnPost
                ? null
                : await Notification.create({
                      ownerId: parentPost.Creator.id,
                      type: parentPost.type === 'comment' ? 'comment-reply' : 'post-comment',
                      seen: false,
                      spaceAId: postData.originSpaceId,
                      userId: accountId,
                      postId: parent.id,
                      commentId: post.id,
                  })
            const muted = await accountMuted(accountId, parentPost.Creator)
            const skipEmail = isOwnPost || muted || parentPost.Creator.emailsDisabled
            const messageText =
                parentPost.type === 'comment' ? 'replied to your' : 'commented on your'
            const sendEmail = skipEmail
                ? null
                : await sgMail.send({
                      to: parentPost.Creator.email,
                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                      subject: 'New notification',
                      text: `
                        Hi ${parentPost.Creator.name}, ${account.name} just ${messageText} ${parentPost.type} on weco:
                        http://${appURL}/p/${post.id}
                    `,
                      html: `
                        <p>
                            Hi ${parentPost.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${account.handle}'>${account.name}</a>
                            just ${messageText}
                            <a href='${appURL}/p/${post.id}'>${parentPost.type}</a>
                            on weco
                        </p>
                    `,
                  })
            Promise.all([createNotification, sendEmail])
                .then(() => resolve())
                .catch((error) => resolve(error))
        })

        Promise.all([
            addParentLink,
            addRootLink,
            createAncestorLinks,
            incrementAncestorsTotalComments,
            incrementParentsChildComments,
            incrementSpaceStats,
            updateLastActivity,
            notifyParentOwner,
        ])
            .then(() => res.status(200).json(post))
            .catch((error) => res.status(500).json(error))
    }
})

// todo: create seperate function addPostSpaces that can be used here and in create-post route
// todo: send out signals and notifications...
router.post('/create-chat-message', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // upload files and create post
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post } = await createPost(postData, files, accountId)
        const spaceIds = [postData.link.parent.id]
        // store spaceIds and update with ancestors for response
        const allSpaceIds = [...spaceIds]
        // add spaces and increment space stats
        const addSpaces = spaceIds
            ? await new Promise(async (resolve) => {
                  const addDirectSpaces = await Promise.all(
                      spaceIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'direct')
                      )
                  )
                  // gather direct spaces ancestor ids
                  const spaces = await Space.findAll({
                      where: { id: spaceIds, state: 'active' },
                      attributes: ['id'],
                      include: {
                          model: Space,
                          as: 'SpaceAncestors',
                          attributes: ['id'],
                          through: { where: { state: 'open' }, attributes: [] },
                      },
                  })
                  let ancestorIds = []
                  spaces.forEach((space) =>
                      ancestorIds.push(...space.SpaceAncestors.map((space) => space.id))
                  )
                  // remove duplicates and direct spaces
                  ancestorIds = [...new Set(ancestorIds)].filter((id) => !spaceIds.includes(id))
                  // store ancestor ids for response
                  allSpaceIds.push(...ancestorIds)
                  const addIndirectSpaces = await Promise.all(
                      ancestorIds.map((spaceId) =>
                          createSpacePost(accountId, spaceId, post.id, 'post', 'indirect')
                      )
                  )
                  // increment space stats
                  const incrementSpaceStats = await Space.increment('totalPosts', {
                      where: { id: allSpaceIds },
                      silent: true,
                  })
                  Promise.all([addDirectSpaces, addIndirectSpaces, incrementSpaceStats])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })
            : null

        Promise.all([addSpaces])
            .then(() => res.status(200).json(post))
            .catch((error) => res.status(500).json(error))
    }
})

// todo: notify parent owner
// todo: update post last activity
router.post('/create-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post } = await createPost(postData, files, accountId)
        const { parent } = postData.link
        const addRootLink = await Link.create({
            creatorId: accountId,
            itemAId: parent.id,
            itemAType: 'post',
            itemBId: post.id,
            itemBType: 'poll-answer',
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })
        // todo: update post last activity
        // todo: notify parent owner
        Promise.all([addRootLink])
            .then(() => res.status(200).json(post))
            .catch((error) => res.status(500).json(error))
    }
})

router.post('/create-bead', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const { postData, files } = await uploadFiles(req, res, accountId)
        const { post: newBead } = await createPost(postData, files, accountId)
        const { parent } = postData.link

        const creator = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'handle'],
        })

        const gamePost = await Post.findOne({
            where: { id: parent.id },
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                },
                { model: GlassBeadGame },
                {
                    model: User,
                    as: 'Players',
                    attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    through: { where: { type: 'glass-bead-game' }, attributes: ['index'] },
                },
                {
                    model: Post,
                    as: 'Beads',
                    required: false,
                    through: { where: { state: 'active' }, attributes: ['index'] },
                    include: {
                        model: User,
                        as: 'Creator',
                        attributes: ['id', 'name', 'handle', 'email', 'emailsDisabled'],
                    },
                },
            ],
        })

        const createLink = await Link.create({
            creatorId: accountId,
            itemAId: parent.id,
            itemAType: 'post',
            itemBId: newBead.id,
            itemBType: 'bead',
            index: gamePost.GlassBeadGame.totalBeads,
            relationship: 'parent',
            state: 'active',
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })

        const { synchronous, multiplayer, moveTimeWindow } = gamePost.GlassBeadGame
        const notifyPlayers =
            !synchronous && multiplayer
                ? await new Promise(async (resolve) => {
                      // find other players to notify
                      const otherPlayers = []
                      if (gamePost.Players.length) {
                          // if restricted game, use linked Players
                          otherPlayers.push(...gamePost.Players.filter((p) => p.id !== accountId))
                      } else {
                          // if open game, use linked Bead Creators
                          gamePost.Beads.forEach((bead) => {
                              // filter out game creator and existing records
                              if (
                                  bead.Creator.id !== accountId &&
                                  !otherPlayers.find((p) => p.id === bead.Creator.id)
                              )
                                  otherPlayers.push(bead.Creator)
                          })
                      }
                      // notify players
                      const sendNotifications = await Promise.all(
                          otherPlayers.map(
                              (p) =>
                                  new Promise(async (resolve2) => {
                                      const notifyPlayer = await Notification.create({
                                          type: 'gbg-move-from-other-player',
                                          ownerId: p.id,
                                          postId: parent.id,
                                          userId: accountId,
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
                                                    Hi ${p.name}, ${creator.name} just added a new bead.
                                                    https://${appURL}/p/${parent.id}
                                                `,
                                                html: `
                                                    <p>
                                                        Hi ${p.name},
                                                        <br/>
                                                        <a href='${appURL}/u/${creator.handle}'>${creator.name}</a>
                                                        just added a new 
                                                        <a href='${appURL}/p/${parent.id}'>bead</a>.
                                                    </p>
                                                `,
                                            })
                                      Promise.all([notifyPlayer, emailPlayer])
                                          .then(() => resolve2())
                                          .catch((error) => resolve2(error))
                                  })
                          )
                      )
                      // schedule next deadline
                      const scheduleNewDeadline = moveTimeWindow
                          ? await scheduleNextBeadDeadline(
                                parent.id,
                                gamePost.GlassBeadGame,
                                gamePost.Players
                            )
                          : null

                      Promise.all([sendNotifications, scheduleNewDeadline])
                          .then((data) => resolve(data[1]))
                          .catch((error) => resolve(error))
                  })
                : null

        const incrementTotalBeads = await GlassBeadGame.increment('totalBeads', {
            where: { postId: parent.id },
        })

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: parent.id }, silent: true }
        )

        Promise.all([createLink, notifyPlayers, incrementTotalBeads, updateLastPostActivity])
            .then((data) => res.status(200).json({ newBead, newDeadline: data[1] }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// test
router.post('/update-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { id, mediaTypes, title, text, searchableText, mentions, urls: newUrls } = req.body
    const post = await Post.findOne({
        where: { id, creatorId: accountId },
        attributes: ['id', 'type', 'mediaTypes'],
        include: {
            model: User,
            as: 'Creator',
            attributes: ['id', 'name', 'handle'],
        },
    })
    if (!post) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updatePost = await Post.update(
            { mediaTypes, title, text, searchableText },
            { where: { id, creatorId: accountId } }
        )
        // update urls
        const oldUrlBlockLinks = await Link.findAll({
            where: {
                itemAId: post.id,
                itemAType: post.type,
                itemBType: 'url-block',
                state: 'active',
            },
            attributes: ['id', 'itemBId'],
        })
        const oldUrlLinks = await Promise.all(
            oldUrlBlockLinks.map(
                (oldUrlBlockLink) =>
                    new Promise(async (resolve) => {
                        const oldUrlLink = await Link.findOne({
                            where: {
                                itemAId: oldUrlBlockLink.itemBId,
                                itemAType: 'url-block',
                                itemBType: 'url',
                                state: 'active',
                            },
                            attributes: [],
                            include: { model: Url, attributes: ['url'] },
                        })
                        resolve({ id: oldUrlBlockLink.id, url: oldUrlLink.Url.url })
                    })
            )
        )
        const removeOldUrls = await Promise.all(
            oldUrlLinks.map(
                (oldUrlLink) =>
                    new Promise(async (resolve) => {
                        const match = newUrls.find((newUrl) => newUrl.url === oldUrlLink.url)
                        if (match) resolve()
                        else {
                            Link.update({ state: 'deleted' }, { where: { id: oldUrlLink.id } })
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        }
                    })
            )
        )
        const addNewUrls = await Promise.all(
            newUrls.map(
                (newUrl, index) =>
                    new Promise((resolve) => {
                        const match = oldUrlLinks.find(
                            (oldUrlLink) => oldUrlLink.url === newUrl.url
                        )
                        if (match) {
                            Link.update({ index }, { where: { id: match.id } })
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        } else {
                            createUrl(accountId, id, post.type, newUrl, index)
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        }
                    })
            )
        )

        // const oldUrls = await post.getBlocks({
        //     attributes: ['id'],
        //     through: { where: { itemBType: 'url', state: 'active' } },
        //     joinTableAttributes: ['id'],
        //     include: [
        //         {
        //             model: Url,
        //             attributes: ['id', 'url'],
        //         },
        //     ],
        // })

        // const removeOldUrls = await Promise.all(
        //     oldUrls.map(
        //         (oldUrl) =>
        //             new Promise((resolve) => {
        //                 const match = newUrls.find((newUrl) => newUrl.url === oldUrl.Url.url)
        //                 if (match) resolve()
        //                 else {
        //                     Link.update({ state: 'deleted' }, { where: { id: oldUrl.Link.id } })
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 }
        //             })
        //     )
        // )

        // const addNewUrls = await Promise.all(
        //     newUrls.map(
        //         (newUrl, index) =>
        //             new Promise((resolve) => {
        //                 const match = oldUrls.find((oldUrl) => oldUrl.Url.url === newUrl.url)
        //                 if (match) {
        //                     Link.update({ index }, { where: { id: match.Link.id } })
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 } else {
        //                     createUrl(accountId, id, post.type, newUrl, index)
        //                         .then(() => resolve())
        //                         .catch((error) => resolve(error))
        //                 }
        //             })
        //     )
        // )

        // notify mentions
        const mentionedUsers = await User.findAll({
            where: { handle: mentions, state: 'active' },
            attributes: ['id', 'name', 'email', 'emailsDisabled'],
        })

        const notifyMentions = await Promise.all(
            mentionedUsers.map(
                (user) =>
                    new Promise(async (resolve) => {
                        const alreadySent = await Notification.findOne({
                            where: {
                                ownerId: user.id,
                                type: `${post.type}-mention`, // post, comment, or bead (todo: poll-answer)
                                userId: accountId,
                                postId: id,
                            },
                        })
                        if (alreadySent) resolve()
                        else {
                            const sendNotification = await Notification.create({
                                ownerId: user.id,
                                type: `${post.type}-mention`,
                                seen: false,
                                userId: accountId,
                                postId: id,
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
                                        Hi ${user.name}, ${post.Creator.name} just mentioned you in a ${post.type} on weco:
                                        http://${appURL}/p/${id}
                                    `,
                                      html: `
                                        <p>
                                            Hi ${user.name},
                                            <br/>
                                            <a href='${appURL}/u/${post.Creator.handle}'>${post.Creator.name}</a>
                                            just mentioned you in a 
                                            <a href='${appURL}/p/${id}'>${post.type}</a>
                                            on weco
                                        </p>
                                    `,
                                  })
                            Promise.all([sendNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        }
                    })
            )
        )

        Promise.all([updatePost, removeOldUrls, addNewUrls, notifyMentions])
            .then(() => res.status(200).json(updatePost))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/repost-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { accountHandle, accountName, postId, spaceId, spaceIds } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalReposts', 'totalLikes', 'totalComments'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'name', 'email', 'emailsDisabled'],
            },
        })

        const incrementTotalReposts = await Post.increment('totalReposts', {
            by: spaceIds.length,
            where: { id: postId },
            silent: true,
        })

        const skipNotification = post.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            post.Creator.emailsDisabled ||
            (await accountMuted(accountId, post.Creator))

        const sendNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'post-repost',
                  seen: false,
                  spaceAId: spaceId,
                  userId: accountId,
                  postId,
              })

        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: post.Creator.email,
                  from: {
                      email: 'admin@weco.io',
                      name: 'we { collective }',
                  },
                  subject: 'New notification',
                  text: `
                        Hi ${post.Creator.name}, ${accountName} just reposted your post on weco:
                        http://${appURL}/p/${postId}
                    `,
                  html: `
                        <p>
                            Hi ${post.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
                            just reposted your
                            <a href='${appURL}/p/${postId}'>post</a>
                            on weco
                        </p>
                    `,
              })

        const createReactions = await Promise.all(
            spaceIds.map((id) =>
                Reaction.create({
                    type: 'repost',
                    itemType: 'post',
                    itemId: postId,
                    state: 'active',
                    spaceId: id,
                    creatorId: accountId,
                })
            )
        )

        const createDirectRelationships = await Promise.all(
            spaceIds.map(
                (id) =>
                    new Promise(async (resolve) => {
                        const createSpacePost = await SpacePost.create({
                            type: 'repost',
                            relationship: 'direct',
                            creatorId: accountId,
                            postId,
                            spaceId: id,
                            state: 'active',
                        })
                        // update stats
                        const space = await Space.findOne({ where: { id }, attributes: ['id'] })
                        const incrementTotalPostLikes = await space.increment('totalPostLikes', {
                            by: post.totalLikes,
                            silent: true,
                        })
                        const incrementTotalComments = await space.increment('totalComments', {
                            by: post.totalComments,
                            silent: true,
                        })
                        const incrementTotalPosts = await space.increment('totalPosts', {
                            silent: true,
                        })
                        const spaceUserStat = await SpaceUserStat.findOne({
                            where: { spaceId: id, userId: post.Creator.id },
                            attributes: ['id'],
                        })
                        const updateSpaceUserStat = spaceUserStat
                            ? await spaceUserStat.increment('totalPostLikes', {
                                  by: post.totalLikes,
                              })
                            : await SpaceUserStat.create({
                                  spaceId: id,
                                  userId: post.Creator.id,
                                  totalPostLikes: post.totalLikes,
                              })
                        Promise.all([
                            createSpacePost,
                            incrementTotalPostLikes,
                            incrementTotalComments,
                            incrementTotalPosts,
                            updateSpaceUserStat,
                        ])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )

        const createIndirectRelationships = await new Promise(async (resolve) => {
            const spaces = await Space.findAll({
                where: { id: spaceIds, state: 'active' },
                attributes: ['id'],
                include: {
                    model: Space,
                    as: 'SpaceAncestors',
                    attributes: ['id'],
                    through: { where: { state: 'open' }, attributes: [] },
                },
            })
            // gather ancestor ids
            const ancestorIds = []
            spaces.forEach((space) =>
                ancestorIds.push(...space.SpaceAncestors.map((space) => space.id))
            )
            // remove duplicates and direct spaces
            const filteredIds = [...new Set(ancestorIds)].filter((id) => !spaceIds.includes(id))
            Promise.all(
                filteredIds.map(
                    (id) =>
                        new Promise(async (reso) => {
                            // only create new relationship if none present
                            // todo: include 'state' value in search (so they can be removed or reinstated by mods)
                            const existingRelationship = await SpacePost.findOne({
                                where: { postId, spaceId: id },
                            })
                            if (existingRelationship) reso()
                            else {
                                const createSpacePost = await SpacePost.create({
                                    type: 'repost',
                                    relationship: 'indirect',
                                    creatorId: accountId,
                                    postId,
                                    spaceId: id,
                                    state: 'active',
                                })
                                // update stats
                                const space = await Space.findOne({
                                    where: { id },
                                    attributes: ['totalPostLikes', 'totalComments', 'totalPosts'],
                                })
                                const updateSpaceStats = await Space.update(
                                    {
                                        totalPostLikes: space.totalPostLikes + post.totalLikes,
                                        totalComments: space.totalComments + post.totalComments,
                                        totalPosts: space.totalPosts + 1,
                                    },
                                    { where: { id }, silent: true }
                                )
                                const spaceUserStat = await SpaceUserStat.findOne({
                                    where: { spaceId: id, userId: post.Creator.id },
                                    attributes: ['id', 'totalPostLikes'],
                                })
                                const updateSpaceUserStat = spaceUserStat
                                    ? await spaceUserStat.update({
                                          totalPostLikes:
                                              spaceUserStat.totalPostLikes + post.totalLikes,
                                      })
                                    : await SpaceUserStat.create({
                                          spaceId: id,
                                          userId: post.Creator.id,
                                          totalPostLikes: post.totalLikes,
                                      })
                                Promise.all([
                                    createSpacePost,
                                    updateSpaceStats,
                                    updateSpaceUserStat,
                                ])
                                    .then(() => reso(id))
                                    .catch((error) => reso(error))
                            }
                        })
                )
            )
                .then((data) => resolve(data))
                .catch((error) => resolve(error))
        })

        Promise.all([
            incrementTotalReposts,
            sendNotification,
            sendEmail,
            createReactions,
            createDirectRelationships,
            createIndirectRelationships,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, id, sourceType, sourceId, spaceId } = req.body
    // type includes all post types plus 'link'
    // sourceType and sourceId used to generate link map url
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // get item data
        let model
        let include = [
            {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        ]
        if (type === 'link') model = Link
        else model = Post
        if (type === 'post') {
            // include post spaces for stat updates
            include.push({
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                attributes: ['id'],
                through: { where: { state: 'active' }, attributes: [] },
                required: false,
            })
        }
        const item = await model.findOne({ where: { id }, attributes: ['id'], include })
        const updateTotalLikes = item.increment('totalLikes', { silent: true })
        const updateSpaceStats =
            type === 'post'
                ? Promise.all(
                      item.AllPostSpaces.map(
                          (space) =>
                              new Promise(async (resolve) => {
                                  const updateSpaceStat = await space.increment('totalPostLikes', {
                                      silent: true,
                                  })
                                  const spaceUserStat = await SpaceUserStat.findOne({
                                      where: { spaceId: space.id, userId: item.Creator.id },
                                      attributes: ['id'],
                                  })
                                  const updateSpaceUserStat = spaceUserStat
                                      ? await spaceUserStat.increment('totalPostLikes')
                                      : await SpaceUserStat.create({
                                            spaceId: space.id,
                                            userId: item.Creator.id,
                                            totalPostLikes: 1,
                                        })
                                  Promise.all([updateSpaceStat, updateSpaceUserStat])
                                      .then(() => resolve())
                                      .catch((error) => resolve(error))
                              })
                      )
                  )
                : null

        const createReaction = await Reaction.create({
            type: 'like',
            itemType: type === 'link' ? 'link' : 'post',
            itemId: id,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        // notify item creator
        let postId = null
        let commentId = null
        let spaceAId = spaceId
        if (type === 'link') {
            if (sourceType === 'post') postId = sourceId
            if (sourceType === 'comment') commentId = sourceId
            if (sourceType === 'space') spaceAId = sourceId
        } else if (type === 'comment') commentId = id
        else postId = id

        const skipNotification = item.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            item.Creator.emailsDisabled ||
            (await accountMuted(accountId, item.Creator))

        const createNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: item.Creator.id,
                  type: `${type}-like`,
                  seen: false,
                  userId: accountId,
                  spaceAId,
                  postId,
                  commentId,
              })

        const io = req.app.get('socketio')
        io.emit('notification', {
            userId: item.Creator.id,
            notification: { type: 'like', itemType: type, itemId: id, creatorId: accountId },
        })

        let itemUrl
        if (type === 'link') itemUrl = `${appURL}/linkmap?item=${sourceType}&id=${sourceId}`
        else itemUrl = `${appURL}/p/${id}`

        const { handle, name } = await User.findOne({
            where: { id: accountId },
            attributes: ['handle', 'name'],
        })
        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: item.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${item.Creator.name}, ${name} just liked your ${type} on weco:
                        http://${itemUrl}
                    `,
                  html: `
                        <p>
                            Hi ${item.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${handle}'>${name}</a>
                            just liked your
                            <a href='${itemUrl}'>${type}</a>
                            on weco
                        </p>
                    `,
              })

        Promise.all([
            updateTotalLikes,
            updateSpaceStats,
            createReaction,
            createNotification,
            sendEmail,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-like', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, id } = req.body // type includes all post types plus 'link'
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        let model
        let include = [{ model: User, as: 'Creator', attributes: ['id'] }]
        if (type === 'link') model = Link
        else model = Post
        if (type === 'post') {
            include.push({
                model: Space,
                as: 'AllPostSpaces',
                where: { state: 'active' },
                required: false,
                attributes: ['id', 'totalPostLikes'],
                through: { where: { state: 'active' }, attributes: [] },
            })
        }

        const item = await model.findOne({ where: { id }, attributes: ['id'], include })
        const updateTotalLikes = await item.decrement('totalLikes', { silent: true })
        const updateSpaceStats =
            type === 'post'
                ? Promise.all(
                      item.AllPostSpaces.map(
                          (space) =>
                              new Promise(async (resolve) => {
                                  const updateSpaceStat = await space.decrement('totalPostLikes', {
                                      silent: true,
                                  })
                                  const updateSpaceUserStat = await SpaceUserStat.decrement(
                                      'totalPostLikes',
                                      { where: { spaceId: space.id, userId: item.Creator.id } }
                                  )
                                  Promise.all([updateSpaceStat, updateSpaceUserStat])
                                      .then(() => resolve())
                                      .catch((error) => resolve(error))
                              })
                      )
                  )
                : null

        const removeReaction = await Reaction.update(
            { state: 'removed' },
            {
                where: {
                    type: 'like',
                    itemType: type === 'link' ? 'link' : 'post',
                    itemId: id,
                    state: 'active',
                    creatorId: accountId,
                },
            }
        )

        Promise.all([updateTotalLikes, updateSpaceStats, removeReaction])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/add-rating', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, id, newRating, accountHandle, accountName, spaceId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const item = await Post.findOne({
            where: { id },
            attributes: ['id'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        })

        const updateTotalRatings = await item.increment('totalRatings', { silent: true })

        const createReaction = await Reaction.create({
            type: 'rating',
            itemType: type === 'link' ? 'link' : 'post',
            itemId: id,
            value: newRating,
            state: 'active',
            spaceId,
            creatorId: accountId,
        })

        const skipNotification = item.Creator.id === accountId
        const skipEmail =
            skipNotification ||
            item.Creator.emailsDisabled ||
            (await accountMuted(accountId, item.Creator))

        const sendNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: item.Creator.id,
                  type: `${type}-rating`,
                  seen: false,
                  spaceAId: spaceId,
                  userId: accountId,
                  postId: id,
              })

        const itemUrl = `${appURL}/p/${id}`
        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: item.Creator.email,
                  from: { email: 'admin@weco.io', name: 'we { collective }' },
                  subject: 'New notification',
                  text: `
                        Hi ${item.Creator.name}, ${accountName} just rated your ${type} on weco:
                        http://${itemUrl}
                    `,
                  html: `
                        <p>
                            Hi ${item.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
                            just rated your
                            <a href='${itemUrl}'>${type}</a>
                            on weco
                        </p>
                    `,
              })

        Promise.all([updateTotalRatings, createReaction, sendNotification, sendEmail])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-rating', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { type, id } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const removeReaction = await Reaction.update(
            { state: 'removed' },
            {
                where: {
                    type: 'rating',
                    itemType: type === 'link' ? 'link' : 'post',
                    itemId: id,
                    state: 'active',
                    creatorId: accountId,
                },
            }
        )

        const updateTotalRatings = await Post.decrement('totalRatings', {
            where: { id },
            silent: true,
        })

        Promise.all([removeReaction, updateTotalRatings])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// test
router.post('/add-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { sourceType, sourceId, targetType, targetId, description, accountHandle, accountName } =
        req.body

    const postTypes = [
        'post',
        'comment',
        'bead',
        'poll-answer',
        'card-face',
        'url-block',
        'audio-block',
        'image-block',
    ]

    async function getItem(type, id) {
        let model
        let attributes = []
        let include = null
        const creator = {
            model: User,
            as: 'Creator',
            attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
        }
        const mods = {
            model: User,
            as: 'Moderators',
            attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
        }
        if (postTypes.includes(type)) {
            model = Post
            attributes = ['id']
            include = creator
        } else if (type === 'user') {
            model = User
            attributes = ['id', 'name', 'handle', 'email', 'emailsDisabled']
        } else if (type === 'space') {
            model = Space
            attributes = ['id']
            include = mods
        }
        return model.findOne({ where: { id: id }, attributes, include })
    }

    const source = await getItem(sourceType, sourceId)
    const target = await getItem(targetType, targetId)

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else if (!source) res.status(404).send({ message: 'Source not found' })
    else if (!target) res.status(404).send({ message: 'Target not found' })
    else {
        const createLink = await Link.create({
            creatorId: accountId,
            state: 'active',
            relationship: 'link',
            itemAType: postTypes.includes(sourceType) ? 'post' : sourceType,
            itemBType: postTypes.includes(targetType) ? 'post' : targetType,
            description,
            itemAId: sourceId,
            itemBId: targetId,
            totalLikes: 0,
            totalComments: 0,
            totalRatings: 0,
        })

        // removed for users and spaces for now
        const updateSourceTotalLinks = ['user', 'space'].includes(sourceType)
            ? null
            : await source.increment('totalLinks', { silent: true })

        const updateTargetTotalLinks = ['user', 'space'].includes(targetType)
            ? null
            : await target.increment('totalLinks', { silent: true })

        async function notifyOwners(item, type, location) {
            // skip notification if linked item is link creators
            let isOwn = false
            if (postTypes.includes(type)) isOwn = item.Creator.id === accountId
            if (type === 'user') isOwn = item.id === accountId
            if (type === 'space') isOwn = item.Moderators.find((u) => u.id === accountId)
            if (isOwn) return null
            // send out notifications and emails to recipients
            let recipients = []
            if (postTypes.includes(type)) recipients = [item.Creator]
            if (type === 'user') recipients = [item]
            if (type === 'space') recipients = [...item.Moderators]
            return Promise.all(
                recipients.map(
                    async (recipient) =>
                        await new Promise(async (resolve) => {
                            const { id, name, email, emailsDisabled } = recipient
                            let postId = null
                            let commentId = null
                            let spaceAId = null
                            if (postTypes.filter((p) => p !== 'comment').includes(type))
                                postId = location === 'source' ? sourceId : targetId
                            if (type === 'comment')
                                commentId = location === 'source' ? sourceId : targetId
                            if (type === 'space')
                                spaceAId = location === 'source' ? sourceId : targetId
                            // todo: need 3 slots for each model type (until then only include link to source)
                            let itemType = type
                            if (postTypes.filter((p) => p !== 'comment').includes(type))
                                type = 'post'
                            const createNotification = await Notification.create({
                                ownerId: id,
                                type: `${itemType}-link-${location}`,
                                seen: false,
                                userId: accountId,
                                spaceAId,
                                postId,
                                commentId,
                            })
                            const skipEmail =
                                emailsDisabled || (await accountMuted(accountId, recipient))
                            const url = `${appURL}/linkmap?item=${itemType}&id=${item.id}`
                            const sendEmail = skipEmail
                                ? null
                                : await sgMail.send({
                                      to: email,
                                      from: { email: 'admin@weco.io', name: 'we { collective }' },
                                      subject: 'New notification',
                                      text: `
                                    Hi ${name}, ${accountName} just linked ${
                                          type === 'user' ? 'you' : `your ${type}`
                                      } to another ${
                                          location === 'source' ? sourceType : targetType
                                      } on weco:
                                        http://${url}
                                `,
                                      html: `
                                    <p>
                                        Hi ${name},
                                        <br/>
                                        <a href='${appURL}/u/${accountHandle}'>${accountName}</a>
                                        just linked ${
                                            type === 'user'
                                                ? `<a href='${url}'>you</a>`
                                                : `your <a href='${url}'>${type}</a>`
                                        }
                                        to another ${
                                            location === 'source' ? sourceType : targetType
                                        } on weco
                                    </p>
                                `,
                                  })
                            Promise.all([createNotification, sendEmail])
                                .then(() => resolve())
                                .catch((error) => resolve(error))
                        })
                )
            )
        }

        const notifySourceOwner = await notifyOwners(source, sourceType, 'source')
        const notifyTargetOwner = await notifyOwners(target, targetType, 'target')

        Promise.all([
            createLink,
            updateSourceTotalLinks,
            updateTargetTotalLinks,
            notifySourceOwner,
            notifyTargetOwner,
        ])
            .then((data) => res.status(200).json(data[0]))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// todo: decrement link tally of connected items, handle users and spaces when totalLinks stat set up
router.post('/delete-link', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { linkId } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const link = await Link.findOne({
            where: { id: linkId, creatorId: accountId },
            attributes: ['itemAId', 'itemAType', 'itemBId', 'itemBType'],
        })
        if (!link) res.status(404).json({ message: 'Not found' })
        else {
            const updateSourceTotalLinks = await Post.decrement('totalLinks', {
                where: { id: link.itemAId },
                silent: true,
            })

            const updateTargetTotalLinks = await Post.decrement('totalLinks', {
                where: { id: link.itemBId },
                silent: true,
            })

            const removeLink = await Link.update({ state: 'deleted' }, { where: { id: linkId } })

            Promise.all([updateSourceTotalLinks, updateTargetTotalLinks, removeLink])
                .then(() => res.status(200).json({ message: 'Success' }))
                .catch((error) => res.status(500).json({ message: 'Error', error }))
        }
    }
})

router.post('/respond-to-event', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, eventId, startTime, response } = req.body

    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const user = await User.findOne({
            where: { id: accountId },
            attributes: ['name', 'email', 'emailsDisabled'],
        })
        const previousResponse = await UserEvent.findOne({
            where: { userId: accountId, eventId, relationship: response, state: 'active' },
            attributes: ['id'],
        })

        const updateStatus = previousResponse
            ? UserEvent.update({ state: 'removed' }, { where: { id: previousResponse.id } })
            : new Promise(async (resolve) => {
                  const removeOtherResponseTypes = await UserEvent.update(
                      { state: 'removed' },
                      { where: { userId: accountId, eventId, state: 'active' } }
                  )

                  const newResponse = await UserEvent.create({
                      userId: accountId,
                      eventId,
                      relationship: response,
                      state: 'active',
                  })

                  const scheduleReminder = await scheduleEventNotification({
                      type: response,
                      postId,
                      eventId,
                      userEventId: newResponse.id,
                      startTime,
                      userId: accountId,
                      userName: user.name,
                      userEmail: user.email,
                      emailsDisabled: user.emailsDisabled,
                  })

                  Promise.all([removeOtherResponseTypes, scheduleReminder])
                      .then(() => resolve())
                      .catch((error) => resolve(error))
              })

        updateStatus
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/vote-on-poll', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { userName, userHandle, spaceId, postId, voteData } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId },
            attributes: [],
            include: [
                {
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
                },
                {
                    model: Poll,
                    attributes: ['id', 'type', 'action', 'threshold', 'spaceId'],
                },
            ],
        })

        const removeOldReactions = await Reaction.update(
            { state: 'removed' },
            { where: { state: 'active', creatorId: accountId, type: 'vote', parentItemId: postId } }
        )

        const createNewReactions = await Promise.all(
            voteData.map((answer) =>
                Reaction.create({
                    type: 'vote',
                    itemType: 'poll-answer',
                    itemId: answer.id,
                    parentItemId: postId,
                    value: answer.value || null,
                    state: 'active',
                    spaceId,
                    creatorId: accountId,
                })
            )
        )

        // currently only used for space creation
        const { type, action, threshold } = post.Poll
        const executeAction = action
            ? Promise.all(
                  voteData.map(
                      (answer) =>
                          new Promise(async (resolve1) => {
                              // find poll answer
                              const pollAnswer = await Post.findOne({
                                  where: { id: answer.id },
                                  attributes: ['id', 'text'],
                                  include: {
                                      model: Reaction,
                                      where: { type: 'vote', state: 'active' },
                                      required: false,
                                      attributes: ['value'],
                                  },
                              })
                              const answerLink = await Link.findOne({
                                  where: {
                                      itemAId: postId,
                                      itemAType: 'post',
                                      itemBId: answer.id,
                                      itemBType: 'poll-answer',
                                  },
                                  attributes: ['id', 'state'],
                              })
                              const { text, Reactions } = pollAnswer
                              let totalVotes
                              if (type === 'weighted-choice')
                                  totalVotes =
                                      Reactions.map((r) => +r.value).reduce((a, b) => a + b, 0) /
                                      100
                              else totalVotes = Reactions.length
                              const createSpace =
                                  action === 'Create spaces' &&
                                  answerLink.state !== 'done' &&
                                  totalVotes >= threshold
                                      ? new Promise(async (resolve2) => {
                                            const markAnswerDone = await answerLink.update({
                                                state: 'done',
                                            })
                                            const newSpace = await Space.create({
                                                creatorId: post.Creator.id,
                                                handle: uuidv4().substring(0, 15),
                                                name: text,
                                                description: null,
                                                state: 'active',
                                                privacy: 'public',
                                                totalPostLikes: 0,
                                                totalPosts: 0,
                                                totalComments: 0,
                                                totalFollowers: 1,
                                            })
                                            const createModRelationship = SpaceUser.create({
                                                relationship: 'moderator',
                                                state: 'active',
                                                spaceId: newSpace.id,
                                                userId: post.Creator.id,
                                            })
                                            const createFollowerRelationship = SpaceUser.create({
                                                relationship: 'follower',
                                                state: 'active',
                                                spaceId: newSpace.id,
                                                userId: post.Creator.id,
                                            })
                                            const attachToParent = await attachParentSpace(
                                                newSpace.id,
                                                post.Poll.spaceId
                                            )
                                            Promise.all([
                                                markAnswerDone,
                                                createModRelationship,
                                                createFollowerRelationship,
                                                attachToParent,
                                            ])
                                                .then(() => resolve2())
                                                .catch((error) => resolve2(error))
                                        })
                                      : null

                              Promise.all([createSpace])
                                  .then(() => resolve1())
                                  .catch((error) => resolve1(error))
                          })
                  )
              )
            : null

        const skipNotification = post.Creator.id === accountId
        const skipEmail = skipNotification || post.Creator.emailsDisabled

        const createNotification = skipNotification
            ? null
            : await Notification.create({
                  ownerId: post.Creator.id,
                  type: 'poll-vote',
                  seen: false,
                  userId: accountId,
                  postId,
              })

        const sendEmail = skipEmail
            ? null
            : await sgMail.send({
                  to: post.Creator.email,
                  from: {
                      email: 'admin@weco.io',
                      name: 'we { collective }',
                  },
                  subject: 'New notification',
                  text: `
                        Hi ${post.Creator.name}, ${userName} just voted on your Poll:
                        http://${appURL}/p/${postId}
                    `,
                  html: `
                        <p>
                            Hi ${post.Creator.name},
                            <br/>
                            <a href='${appURL}/u/${userHandle}'>${userName}</a>
                            just voted on your
                            <a href='${appURL}/p/${postId}'>Poll</a>
                        </p>
                    `,
              })

        const updateLastPostActivity = await Post.update(
            { lastActivity: new Date() },
            { where: { id: postId }, silent: true }
        )

        Promise.all([
            removeOldReactions,
            createNewReactions,
            executeAction,
            createNotification,
            sendEmail,
            updateLastPostActivity,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-poll-answer', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { answerId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Link.update(
            { state: 'removed' },
            { where: { itemBId: answerId, itemBType: 'poll-answer' } }
        )
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ error }))
    }
})

router.post('/toggle-poll-answer-done', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { answerId, newState } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Link.update({ state: newState }, { where: { itemBId: answerId, itemBType: 'poll-answer' } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ error }))
    }
})

// todo: add authenticateToken to all endpoints below
router.post('/save-glass-bead-game', async (req, res) => {
    const { postId } = req.body
    const totalBeads = await Link.count({
        where: { itemAId: postId, itemBType: 'bead', state: 'draft' },
    })
    const updateGame = await GlassBeadGame.update(
        { locked: true, totalBeads },
        { where: { postId } }
    )
    const updateLinks = await Link.update(
        { state: 'active' },
        { where: { itemAId: postId, itemBType: 'bead', state: 'draft' } }
    )

    Promise.all([updateGame, updateLinks])
        .then(() => res.status(200).send({ message: 'Game saved' }))
        .catch((error) => res.status(500).json({ error }))
})

router.post('/glass-bead-game-comment', async (req, res) => {
    const { postId, userId, text } = req.body

    const newComment = await Post.create({
        ...defaultPostValues,
        creatorId: userId || null,
        type: 'comment',
        mediaTypes: 'text',
        text,
        searchableText: text,
        lastActivity: new Date(),
    })

    const addParentLink = await Link.create({
        creatorId: userId || null,
        itemAId: postId,
        itemAType: 'post',
        itemBId: newComment.id,
        itemBType: 'gbg-room-comment',
        relationship: 'parent',
        state: 'active',
        totalLikes: 0,
        totalComments: 0,
        totalRatings: 0,
    })

    Promise.all([addParentLink])
        .then(() => res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ error }))
})

router.post('/save-glass-bead-game-settings', async (req, res) => {
    const {
        postId,
        gameId,
        playerOrder,
        introDuration,
        movesPerPlayer,
        moveDuration,
        intervalDuration,
        outroDuration,
    } = req.body

    const removeDraftBeads = await Link.update(
        { state: 'deleted' },
        { where: { itemAId: postId, itemBType: 'bead', state: 'draft' } }
    )
    const updateGame = await GlassBeadGame.update(
        {
            playerOrder,
            introDuration,
            movesPerPlayer,
            moveDuration,
            intervalDuration,
            outroDuration,
        },
        { where: { id: gameId } }
    )

    Promise.all([removeDraftBeads, updateGame])
        .then(res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

router.post('/save-gbg-topic', async (req, res) => {
    const { postId, gameId, newTopic } = req.body
    const updatePost = await Post.update(
        { title: newTopic },
        { where: { id: postId }, silent: true }
    )
    const updateGame = await GlassBeadGame.update({ topicGroup: null }, { where: { id: gameId } })
    Promise.all([updatePost, updateGame])
        .then(() => res.status(200).send({ message: 'Success' }))
        .catch((error) => res.status(500).json({ message: 'Error', error }))
})

// todo: decrement link tally of connected items
router.post('/delete-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        const post = await Post.findOne({
            where: { id: postId, creatorId: accountId },
            attributes: ['id', 'totalLikes', 'totalComments'],
            include: [
                {
                    model: Space,
                    as: 'AllPostSpaces',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id', 'totalPostLikes', 'totalComments', 'totalPosts'],
                    through: { where: { state: 'active' }, attributes: [] },
                },
                {
                    model: Event,
                    attributes: ['id'],
                    required: false,
                },
            ],
        })

        const removePost = await Post.update(
            { state: 'deleted' },
            { where: { id: postId, creatorId: accountId } }
        )

        const updateSpaceStats = await Promise.all(
            post.AllPostSpaces.map(
                (space) =>
                    new Promise(async (resolve) => {
                        const updateSpace = await Space.update(
                            {
                                totalPostLikes: space.totalPostLikes - post.totalLikes,
                                totalComments: space.totalComments - post.totalComments,
                                totalPosts: space.totalPosts - 1,
                            },
                            { where: { id: space.id }, silent: true }
                        )
                        const spaceUserStat = await SpaceUserStat.findOne({
                            where: { spaceId: space.id, userId: accountId },
                            attributes: ['id', 'totalPostLikes'],
                        })
                        const updateSpaceUserStat = spaceUserStat
                            ? await spaceUserStat.update({
                                  totalPostLikes: spaceUserStat.totalPostLikes - post.totalLikes,
                              })
                            : null
                        Promise.all([updateSpace, updateSpaceUserStat])
                            .then(() => resolve())
                            .catch((error) => resolve(error))
                    })
            )
        )

        const removeEvent = post.Event
            ? await Event.update({ state: 'deleted' }, { where: { id: post.Event.id } })
            : null

        Promise.all([removePost, updateSpaceStats, removeEvent])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// test
router.post('/delete-comment', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // remove comment
        const removeComment = await Post.update(
            { state: 'deleted' },
            { where: { id: postId, creatorId: accountId } }
        )
        // get links & root post for tally updates
        const rootLink = await Link.findOne({
            where: { itemBId: postId, itemBType: 'comment', relationship: 'root' },
            attributes: ['itemAId', 'itemAType'],
        })
        const parentLink = await Link.findOne({
            where: { itemBId: postId, itemBType: 'comment', relationship: 'parent' },
            attributes: ['itemAId'],
        })
        const ancestorLinks = await Link.findAll({
            where: { itemBId: postId, itemBType: 'comment', relationship: 'ancestor' },
            attributes: ['itemAId'],
        })
        const rootPost = await Post.findOne({
            where: { id: rootLink.itemAId },
            attributes: ['id'],
            include: [
                {
                    model: Space,
                    as: 'AllPostSpaces',
                    where: { state: 'active' },
                    required: false,
                    attributes: ['id'],
                    through: { where: { state: 'active' }, attributes: [] },
                },
            ],
        })
        // decrement tallies
        const decrementParentsChildComments = await Post.decrement('totalChildComments', {
            where: { id: parentLink.itemAId },
            silent: true,
        })
        const decrementAncestorsTotalComments = await Post.decrement('totalComments', {
            where: { id: ancestorLinks.map((a) => a.itemAId) },
            silent: true,
        })
        const decrementSpaceStats = await Space.decrement('totalComments', {
            where: { id: rootPost.AllPostSpaces.map((s) => s.id) },
            silent: true,
        })
        Promise.all([
            removeComment,
            decrementParentsChildComments,
            decrementAncestorsTotalComments,
            decrementSpaceStats,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

// test
router.post('/delete-bead', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        // delete the bead
        const removeBead = await Post.update(
            { state: 'deleted' },
            { where: { id: postId, creatorId: accountId } }
        )
        // find link to game post
        const parentLink = await Link.findOne({
            where: { itemBId: postId, itemBType: 'bead', relationship: 'parent' },
            attributes: ['id', 'itemAId', 'index'],
        })
        const gamePostId = parentLink.itemAId
        // decrement the games total bead tally
        const decrementTotalBeads = await GlassBeadGame.decrement('totalBeads', {
            where: { postId: gamePostId },
            silent: true,
        })
        // decrement the index of later beads
        const decrementOtherBeadIndexes = await Link.decrement('index', {
            where: {
                itemAType: 'post',
                itemAId: gamePostId,
                itemBType: 'bead',
                relationship: 'parent',
                index: { [Op.gte]: parentLink.index },
            },
        })
        // remove the link to the game
        const removeLink = await parentLink.update({ state: 'deleted' })

        Promise.all([removeBead, decrementTotalBeads, decrementOtherBeadIndexes, removeLink])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/delete-block', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId } = req.body
    if (!accountId) res.status(401).json({ message: 'Unauthorized' })
    else {
        Post.update({ state: 'deleted' }, { where: { id: postId, creatorId: accountId } })
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

router.post('/remove-post', authenticateToken, async (req, res) => {
    const accountId = req.user ? req.user.id : null
    const { postId, spaceId, spaceHandle } = req.body
    const isMod = await SpaceUser.findOne({
        where: { userId: accountId, spaceId, relationship: 'moderator' },
        attributes: ['id'],
    })
    if (!accountId || !isMod) res.status(401).json({ message: 'Unauthorized' })
    else {
        const updatePostEntry = await SpacePost.update(
            { state: 'removed-by-mod' },
            { where: { postId, spaceId } }
        )
        // get post stats and creator info
        const post = await Post.findOne({
            where: { id: postId },
            attributes: ['totalLikes', 'totalComments'],
            include: {
                model: User,
                as: 'Creator',
                attributes: ['id', 'handle', 'name', 'email', 'emailsDisabled'],
            },
        })
        // decrement space stats
        const decrementTotalPosts = await Space.decrement('totalPosts', {
            where: { id: spaceId },
            silent: true,
        })
        const decrementTotalPostLikes = await Space.decrement('totalPostLikes', {
            by: post.totalLikes,
            where: { id: spaceId },
            silent: true,
        })
        const decrementTotalComments = await Space.decrement('totalComments', {
            by: post.totalComments,
            where: { id: spaceId },
            silent: true,
        })
        const decrementSpaceUserStat = await SpaceUserStat.decrement('totalPostLikes', {
            by: post.totalLikes,
            where: { spaceId, userId: post.Creator.id },
        })

        // // notify post creator (?)
        // const skipNotification = post.Creator.id === accountId
        // const skipEmail = skipNotification || post.Creator.emailsDisabled
        // const sendNotification = skipNotification
        //     ? null
        //     : await Notification.create({
        //           ownerId: post.Creator.id,
        //           type: 'post-removed-by-mods',
        //           seen: false,
        //           postId,
        //           spaceAId: spaceId,
        //       })
        // const sendEmail = skipEmail
        //     ? null
        //     : await sgMail.send({
        //           to: post.Creator.email,
        //           from: { email: 'admin@weco.io', name: 'we { collective }' },
        //           subject: 'New notification',
        //           text: `
        //         Hi ${post.Creator.name}, your post was just removed from s/${spaceHandle} by its mods:
        //         http://${appURL}/p/${postId}
        //     `,
        //           html: `
        //         <p>
        //             Hi ${post.Creator.name},
        //             <br/>
        //             Your
        //             <a href='${appURL}/p/${postId}'>post</a>
        //             was just removed from
        //             <a href='${appURL}/s/${spaceHandle}'>s/${spaceHandle}</a>
        //             by its mods
        //         </p>
        //     `,
        //       })

        Promise.all([
            updatePostEntry,
            decrementTotalPosts,
            decrementTotalPostLikes,
            decrementTotalComments,
            decrementSpaceUserStat,
            // sendNotification,
            // sendEmail,
        ])
            .then(() => res.status(200).json({ message: 'Success' }))
            .catch((error) => res.status(500).json({ message: 'Error', error }))
    }
})

module.exports = router
