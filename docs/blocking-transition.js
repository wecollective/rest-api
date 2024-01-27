// Decemeber 2023

// before updates:
// + log out & remove getHomepageHighlights
// + remove mediaTypes, originSpaceId, & totalChildComments from Post model
// + change hasOne to hasMany on Post --> Url, Audio, Image relationships
// + add back in post assosiastions on Url, Audio, Image models
// + ensure defaultPostValues is present in Helpers import list

// run link-table-additions, gbg-updates, new-media-table-additions & post-table-updates migrations
// add new values to models

// // link table updates
// const links = await Link.findAll({ attributes: ['id', 'type', 'relationship', 'state'] })
// Promise.all(
//     links.map(
//         (link) =>
//             new Promise((resolve) => {
//                 const update = {}
//                 if (link.relationship === 'source') update.role = 'prompt'
//                 if (link.state === 'visible') update.state = 'active'
//                 if (link.state === 'hidden') update.state = 'deleted'
//                 const types = link.type.split('-')
//                 update.itemAType = types[0]
//                 update.itemBType = types[1]
//                 if (link.type === 'gbg-post') {
//                     update.itemAType = 'post'
//                     update.itemBType = 'bead'
//                     update.relationship = 'parent'
//                 } else if (link.type === 'card-post') {
//                     update.itemAType = 'post'
//                     update.itemBType = 'card-face'
//                     update.relationship = 'parent'
//                 } else {
//                     update.relationship = 'link'
//                 }
//                 link.update(update, { silent: true })
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // add card-face indexes to link table
// const posts = await Post.findAll({
//     where: { type: { [Op.or]: ['card-back', 'card-front'] } },
//     attributes: ['id', 'type'],
// })
// Promise.all(
//     posts.map(
//         (post) =>
//             new Promise(async (resolve) => {
//                 const link = await Link.findOne({
//                     where: { type: 'card-post', itemBId: post.id },
//                     attributes: ['id'],
//                 })
//                 const index = post.type === 'card-front' ? 0 : 1
//                 link.update({ index }, { silent: true })
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // post table state updates
// const posts = await Post.findAll({
//     where: { state: { [Op.or]: ['hidden', 'dormant', 'broken', 'visible'] } },
//     attributes: ['id', 'state'],
// })
// Promise.all(
//     posts.map(
//         (post) =>
//             new Promise((resolve) => {
//                 const update = {}
//                 if (['hidden', 'dormant', 'broken'].includes(post.state))
//                     update.state = 'deleted'
//                 else update.state = 'active'
//                 post.update(update, { silent: true })
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // tally total child comments for existing posts with comments
// const posts = await Post.findAll({ attributes: ['id', 'totalComments'] })
// Promise.all(
//     posts.map(
//         (post) =>
//             new Promise(async (resolve) => {
//                 if (post.totalComments) {
//                     const totalChildComments = await Comment.count({
//                         where: {
//                             itemType: 'post',
//                             itemId: post.id,
//                             parentCommentId: null,
//                             state: 'visible',
//                         },
//                     })
//                     post.update({ totalChildComments }, { silent: true })
//                         .then(() => resolve())
//                         .catch((error) => resolve(error))
//                 } else resolve()
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // set totalChildComments to 0 on all posts where totalChildComments = null
// Post.update(
//     { totalChildComments: 0 },
//     { where: { totalChildComments: null }, silent: true }
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // post table media type updates (long operation, nothing printed in console for ~30 secs, wait!)
// const posts = await Post.findAll({
//     attributes: ['id', 'text', 'title', 'type'],
//     include: [
//         {
//             model: Url,
//             where: { state: 'active' },
//             attributes: ['id'],
//             required: false,
//         },
//         {
//             model: Image,
//             attributes: ['id'],
//             required: false,
//         },
//         {
//             model: Audio,
//             attributes: ['id'],
//             required: false,
//         },
//         {
//             model: Event,
//             attributes: ['id'],
//             required: false,
//         },
//         {
//             model: Poll,
//             attributes: ['id'],
//             required: false,
//         },
//         { model: GlassBeadGame, attributes: ['id'], required: false },
//         {
//             model: Post,
//             as: 'CardSides',
//             attributes: ['id'],
//             through: { where: { type: 'card-post' } },
//             required: false,
//         },
//     ],
// })

// Promise.all(
//     posts.map(
//         (post) =>
//             new Promise((resolve) => {
//                 // find media types
//                 const mediaTypes = []
//                 if (post.text || post.title) mediaTypes.push('text')
//                 if (post.Urls.length > 0) mediaTypes.push('url')
//                 if (post.Images.length > 0) mediaTypes.push('image')
//                 if (post.Audios.length > 0) mediaTypes.push('audio')
//                 if (post.CardSides.length > 0) mediaTypes.push('card')
//                 if (post.Event) mediaTypes.push('event')
//                 if (post.Poll) mediaTypes.push('poll')
//                 if (post.GlassBeadGame) mediaTypes.push('glass-bead-game')
//                 if (post.type === 'prism') mediaTypes.push('prism')
//                 let mergedMediaTypes = mediaTypes.join(',')
//                 if (mergedMediaTypes === '') mergedMediaTypes = post.type
//                 // find post type
//                 let type = 'post'
//                 if (post.type.includes('gbg') || post.type === 'glass-bead') type = 'bead'
//                 if (post.type.includes('card-')) type = 'card-face'
//                 post.update({ type, mediaTypes: mergedMediaTypes }, { silent: true })
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // test indexing on gbg posts
// const posts = await Post.findAll({
//     where: { mediaTypes: { [Op.like]: `%glass-bead-game%` } },
//     attributes: ['id'],
//     include: {
//         model: Post,
//         as: 'Beads',
//         attributes: ['id'],
//         through: {
//             where: { type: 'gbg-post', state: 'active' }, // state: ['visible', 'account-deleted']
//             attributes: ['index', 'relationship', 'state'],
//         },
//     },
// })
// const postsWithBeadIndexes = posts
//     .filter((post) => post.Beads.length)
//     .map((post) => {
//         return post.Beads.map((bead) => bead.Link.index).sort((a, b) => a - b)
//         // return {
//         //     id: post.id,
//         //     beadIndexes: post.Beads.map((bead) => bead.Link.index).sort((a, b) => a - b),
//         // }
//     })
// res.status(200).json(postsWithBeadIndexes)

// fix broken gbg indexes & duplicates here

// // fix indexes on gbg links (starts all gbg beads at index 0 instead of 1)
// const posts = await Post.findAll({
//     where: { mediaTypes: { [Op.like]: `%glass-bead-game%` } },
//     attributes: ['id'],
//     include: {
//         model: Post,
//         as: 'Beads',
//         attributes: ['id'],
//         through: {
//             where: { type: 'gbg-post' },
//             attributes: ['id', 'index', 'role'],
//         },
//     },
// })
// Promise.all(
//     posts
//         .filter((post) => post.Beads.length)
//         .map(
//             (post) =>
//                 new Promise(async (resolve) => {
//                     const sortedBeads = post.Beads.filter(
//                         (bead) => bead.Link.role !== 'prompt'
//                     ).sort((a, b) => a.Link.index - b.Link.index)
//                     if (sortedBeads[0].Link.index === 0) resolve()
//                     else {
//                         Promise.all(
//                             sortedBeads.map((bead) =>
//                                 Link.decrement('index', {
//                                     where: { id: bead.Link.id },
//                                     silent: true,
//                                 })
//                             )
//                         )
//                             .then(() => resolve())
//                             .catch((error) => resolve(error))
//                     }
//                 })
//         )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // embed urls, images, audio in media block posts (long operation ~1.5mins)
// const posts = await Post.findAll({
//     attributes: ['id', 'type', 'creatorId', 'createdAt'],
//     include: [
//         {
//             model: Url,
//             where: { state: 'active' },
//             attributes: ['id'],
//             required: false,
//         },
//         {
//             model: Image,
//             attributes: ['id', 'index', 'caption'],
//             required: false,
//         },
//         {
//             model: Audio,
//             attributes: ['id'],
//             required: false,
//         },
//     ],
//     order: [[Url, 'id', 'ASC']],
// })

// const filteredPosts = posts.filter(
//     (post) => post.Urls.length || post.Images.length || post.Audios.length
// )

// Promise.all(
//     filteredPosts.map(
//         (post) =>
//             new Promise(async (resolve1) => {
//                 const handleUrls = await Promise.all(
//                     post.Urls.map(
//                         (url, index) =>
//                             new Promise(async (resolve2) => {
//                                 // create new url block
//                                 const newUrlBlock = await Post.create(
//                                     {
//                                         ...defaultPostValues,
//                                         type: 'url-block',
//                                         mediaTypes: 'url',
//                                         creatorId: post.creatorId,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                         lastActivity: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link url block to url
//                                 const linkUrlBlockToUrl = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: newUrlBlock.id,
//                                         itemAType: 'url-block',
//                                         itemBId: url.id,
//                                         itemBType: 'url',
//                                         relationship: 'parent',
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link post to url block
//                                 const linkPostToUrlBlock = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: post.id,
//                                         itemAType: post.type,
//                                         itemBId: newUrlBlock.id,
//                                         itemBType: 'url-block',
//                                         relationship: 'parent',
//                                         index,
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 Promise.all([linkUrlBlockToUrl, linkPostToUrlBlock])
//                                     .then(() => resolve2())
//                                     .catch((error) => resolve2(error))
//                             })
//                     )
//                 )
//                 const handleImages = await Promise.all(
//                     post.Images.map(
//                         (image) =>
//                             new Promise(async (resolve2) => {
//                                 // create new image block
//                                 const newImageBlock = await Post.create(
//                                     {
//                                         ...defaultPostValues,
//                                         type: 'image-block',
//                                         mediaTypes: 'image',
//                                         text: image.caption,
//                                         creatorId: post.creatorId,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                         lastActivity: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link image block to image
//                                 const linkImageBlockToImage = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: newImageBlock.id,
//                                         itemAType: 'image-block',
//                                         itemBId: image.id,
//                                         itemBType: 'image',
//                                         relationship: 'parent',
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link post to image block
//                                 const linkPostToImageBlock = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: post.id,
//                                         itemAType: post.type,
//                                         itemBId: newImageBlock.id,
//                                         itemBType: 'image-block',
//                                         relationship: 'parent',
//                                         index: image.index,
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 Promise.all([linkImageBlockToImage, linkPostToImageBlock])
//                                     .then(() => resolve2())
//                                     .catch((error) => resolve2(error))
//                             })
//                     )
//                 )
//                 const handleAudios = await Promise.all(
//                     post.Audios.map(
//                         (audio) =>
//                             new Promise(async (resolve2) => {
//                                 // create new audio block
//                                 const newAudioBlock = await Post.create(
//                                     {
//                                         ...defaultPostValues,
//                                         type: 'audio-block',
//                                         mediaTypes: 'audio',
//                                         creatorId: post.creatorId,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                         lastActivity: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link audio block to audio
//                                 const linkAudioBlockToAudio = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: newAudioBlock.id,
//                                         itemAType: 'audio-block',
//                                         itemBId: audio.id,
//                                         itemBType: 'audio',
//                                         relationship: 'parent',
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 // link post to audio block
//                                 const linkPostToAudioBlock = await Link.create(
//                                     {
//                                         creatorId: post.creatorId,
//                                         itemAId: post.id,
//                                         itemAType: post.type,
//                                         itemBId: newAudioBlock.id,
//                                         itemBType: 'audio-block',
//                                         relationship: 'parent',
//                                         index: 0,
//                                         state: 'active',
//                                         totalLikes: 0,
//                                         totalComments: 0,
//                                         totalRatings: 0,
//                                         createdAt: post.createdAt,
//                                         updatedAt: post.createdAt,
//                                     },
//                                     { silent: true }
//                                 )
//                                 Promise.all([linkAudioBlockToAudio, linkPostToAudioBlock])
//                                     .then(() => resolve2())
//                                     .catch((error) => resolve2(error))
//                             })
//                     )
//                 )
//                 Promise.all([handleUrls, handleImages, handleAudios])
//                     .then(() => resolve1())
//                     .catch((error) => resolve1(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // add totalBeads value to GBGs
// const games = await GlassBeadGame.findAll({ attributes: ['id', 'postId'] })
// Promise.all(
//     games.map(
//         (game) =>
//             new Promise(async (resolve) => {
//                 const totalBeads = await Link.count({
//                     where: {
//                         itemAType: 'post',
//                         itemAId: game.postId,
//                         itemBType: 'bead',
//                         relationship: 'parent',
//                         state: 'active',
//                     },
//                 })
//                 game.update({ totalBeads }, { silent: true })
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // // switch db instance to t3 to enable unlimited burst (long operation: ~29mins on t3.small) (should be less with target links removed)
// // // migrate root comments to post table
// // before running, update comments where itemId = null to itemId = 0
// // SELECT * FROM `weco-prod-db`.Comments where itemType = 'glass-bead-game' and itemId is null
// const comments = await Comment.findAll()
// const rootCommentMappings = []
// const migrateRootComments = await Promise.all(
//     comments
//         .filter((c) => !c.parentCommentId)
//         .map(
//             (comment) =>
//                 new Promise(async (resolve) => {
//                     // count total child comments
//                     const totalComments =
//                         comment.itemType === 'post'
//                             ? await Comment.count({
//                                   where: { parentCommentId: comment.id, state: 'visible' },
//                               })
//                             : 0
//                     // create new comment
//                     const newComment = await Post.create(
//                         {
//                             ...defaultPostValues,
//                             type:
//                                 comment.itemType === 'post'
//                                     ? 'comment'
//                                     : 'gbg-room-comment',
//                             text: comment.text,
//                             mediaTypes: 'text',
//                             creatorId: comment.creatorId,
//                             originSpaceId: comment.spaceId,
//                             state: comment.state === 'visible' ? 'active' : 'deleted',
//                             totalLikes: comment.totalLikes,
//                             totalLinks: comment.totalLinks,
//                             totalRatings: comment.totalRatings,
//                             totalComments,
//                             totalChildComments: totalComments,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.updatedAt,
//                             lastActivity: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // add comment mapping
//                     rootCommentMappings.push({
//                         oldCommentId: comment.id, // commentId
//                         newCommentId: newComment.id, // postId
//                     })
//                     // find post id for gbg comments and create root link
//                     const game =
//                         comment.itemType === 'post'
//                             ? null
//                             : await GlassBeadGame.findOne({
//                                   where: { id: comment.itemId },
//                                   attributes: ['postId'],
//                               })
//                     const postId = game ? game.postId : comment.itemId || null // null used for comments without itemId
//                     const createParentLink = await Link.create(
//                         {
//                             creatorId: comment.creatorId,
//                             itemAId: postId,
//                             itemAType: 'post', // 'post' or 'glass-bead-game'
//                             itemBId: newComment.id,
//                             itemBType:
//                                 comment.itemType === 'post'
//                                     ? 'comment'
//                                     : 'gbg-room-comment',
//                             relationship: 'parent',
//                             state: 'active',
//                             totalLikes: 0,
//                             totalComments: 0,
//                             totalRatings: 0,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // skip root and ancestor links on gbg-room-comments
//                     const createRootLink =
//                         comment.itemType === 'post'
//                             ? await Link.create(
//                                   {
//                                       creatorId: comment.creatorId,
//                                       itemAId: comment.itemId,
//                                       itemAType: 'post',
//                                       itemBId: newComment.id,
//                                       itemBType: 'comment',
//                                       relationship: 'root',
//                                       state: 'active',
//                                       totalLikes: 0,
//                                       totalComments: 0,
//                                       totalRatings: 0,
//                                       createdAt: comment.createdAt,
//                                       updatedAt: comment.createdAt,
//                                   },
//                                   { silent: true }
//                               )
//                             : null
//                     const createAncestorLink =
//                         comment.itemType === 'post'
//                             ? await Link.create(
//                                   {
//                                       creatorId: comment.creatorId,
//                                       itemAId: comment.itemId,
//                                       itemAType: 'post',
//                                       itemBId: newComment.id,
//                                       itemBType: 'comment',
//                                       relationship: 'ancestor',
//                                       state: 'active',
//                                       totalLikes: 0,
//                                       totalComments: 0,
//                                       totalRatings: 0,
//                                       createdAt: comment.createdAt,
//                                       updatedAt: comment.createdAt,
//                                   },
//                                   { silent: true }
//                               )
//                             : null
//                     // update reactions
//                     const updateReactions = await Reaction.update(
//                         { itemId: newComment.id },
//                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
//                     )
//                     // update notifications
//                     const updateNotifications = await Notification.update(
//                         { commentId: newComment.id },
//                         { where: { commentId: comment.id }, silent: true }
//                     )
//                     // update link map links
//                     const updateSourceLinks = await Link.update(
//                         { itemAId: newComment.id },
//                         {
//                             where: { itemAType: 'comment', itemAId: comment.id },
//                             silent: true,
//                         }
//                     )
//                     // update toybox items
//                     const updateToyboxItems = await ToyBoxItem.update(
//                         { itemId: newComment.id },
//                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
//                     )
//                     Promise.all([
//                         createParentLink,
//                         createRootLink,
//                         createAncestorLink,
//                         updateReactions,
//                         updateNotifications,
//                         updateSourceLinks,
//                         updateToyboxItems,
//                     ])
//                         .then(() => resolve())
//                         .catch((error) => resolve(error))
//                 })
//         )
// )

// const migrateChildComments = await Promise.all(
//     comments
//         .filter((c) => c.parentCommentId)
//         .map(
//             (comment) =>
//                 new Promise(async (resolve) => {
//                     // create new post
//                     const newComment = await Post.create(
//                         {
//                             ...defaultPostValues,
//                             type: 'comment',
//                             text: comment.text,
//                             mediaTypes: 'text',
//                             creatorId: comment.creatorId,
//                             originSpaceId: comment.spaceId,
//                             state: comment.state === 'visible' ? 'active' : 'deleted',
//                             totalLikes: comment.totalLikes,
//                             totalLinks: comment.totalLinks,
//                             totalRatings: comment.totalRatings,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.updatedAt,
//                             lastActivity: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // find parent comment
//                     const parentComment = rootCommentMappings.find(
//                         (c) => c.oldCommentId === comment.parentCommentId
//                     )
//                     // link to parent comment
//                     const createParentLink = await Link.create(
//                         {
//                             creatorId: comment.creatorId,
//                             itemAId: parentComment.newCommentId,
//                             itemAType: 'comment',
//                             itemBId: newComment.id,
//                             itemBType: 'comment',
//                             relationship: 'parent',
//                             state: 'active',
//                             totalLikes: 0,
//                             totalComments: 0,
//                             totalRatings: 0,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // link to root post
//                     const createRootLink = await Link.create(
//                         {
//                             creatorId: comment.creatorId,
//                             itemAId: comment.itemId,
//                             itemAType: 'post',
//                             itemBId: newComment.id,
//                             itemBType: 'comment',
//                             relationship: 'root',
//                             state: 'active',
//                             totalLikes: 0,
//                             totalComments: 0,
//                             totalRatings: 0,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // link to both parent comment and root post as ancestor
//                     const createCommentAncestorLink = await Link.create(
//                         {
//                             creatorId: comment.creatorId,
//                             itemAId: parentComment.newCommentId,
//                             itemAType: 'comment',
//                             itemBId: newComment.id,
//                             itemBType: 'comment',
//                             relationship: 'ancestor',
//                             state: 'active',
//                             totalLikes: 0,
//                             totalComments: 0,
//                             totalRatings: 0,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     const createPostAncestorLink = await Link.create(
//                         {
//                             creatorId: comment.creatorId,
//                             itemAId: comment.itemId,
//                             itemAType: 'post',
//                             itemBId: newComment.id,
//                             itemBType: 'comment',
//                             relationship: 'ancestor',
//                             state: 'active',
//                             totalLikes: 0,
//                             totalComments: 0,
//                             totalRatings: 0,
//                             createdAt: comment.createdAt,
//                             updatedAt: comment.createdAt,
//                         },
//                         { silent: true }
//                     )
//                     // update reactions
//                     const updateReactions = await Reaction.update(
//                         { itemId: newComment.id },
//                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
//                     )
//                     // update notifications
//                     const updateNotifications = await Notification.update(
//                         { commentId: newComment.id },
//                         { where: { commentId: comment.id }, silent: true }
//                     )
//                     // update link map links
//                     const updateSourceLinks = await Link.update(
//                         { itemAId: newComment.id },
//                         {
//                             where: { itemAType: 'comment', itemAId: comment.id },
//                             silent: true,
//                         }
//                     )
//                     // update toybox items
//                     const updateToyboxItems = await ToyBoxItem.update(
//                         { itemId: newComment.id },
//                         { where: { itemType: 'comment', itemId: comment.id }, silent: true }
//                     )
//                     Promise.all([
//                         createRootLink,
//                         createParentLink,
//                         createCommentAncestorLink,
//                         createPostAncestorLink,
//                         updateReactions,
//                         updateNotifications,
//                         updateSourceLinks,
//                         updateToyboxItems,
//                     ])
//                         .then(() => resolve())
//                         .catch((error) => resolve(error))
//                 })
//         )
// )

// const tasks = [migrateRootComments, migrateChildComments]
// for (const task of tasks) await task
// res.status(200).json({ message: 'Success' })

// // todo: add searchable text to comments using front end after migration

// // migrate poll answers
// const pollAnswers = await PollAnswer.findAll()
// Promise.all(
//     pollAnswers.map(
//         (answer) =>
//             new Promise(async (resolve) => {
//                 // create new post
//                 const newPost = await Post.create(
//                     {
//                         ...defaultPostValues,
//                         type: 'poll-answer',
//                         text: answer.text,
//                         searchableText: answer.text,
//                         mediaTypes: 'text',
//                         creatorId: answer.creatorId,
//                         createdAt: answer.createdAt,
//                         updatedAt: answer.updatedAt,
//                         lastActivity: answer.createdAt,
//                     },
//                     { silent: true }
//                 )
//                 // create link to post
//                 const poll = await Poll.findOne({
//                     where: { id: answer.pollId },
//                     attributes: ['postId'],
//                 })
//                 const createLink = await Link.create(
//                     {
//                         creatorId: answer.creatorId,
//                         itemAId: poll.postId,
//                         itemAType: 'post',
//                         itemBId: newPost.id,
//                         itemBType: 'poll-answer',
//                         relationship: 'parent',
//                         state: answer.state,
//                         totalLikes: 0,
//                         totalComments: 0,
//                         totalRatings: 0,
//                         createdAt: answer.createdAt,
//                         updatedAt: answer.createdAt,
//                     },
//                     { silent: true }
//                 )
//                 // update reactions
//                 const updateReactions = await Reaction.update(
//                     { itemId: newPost.id },
//                     { where: { type: 'vote', itemId: answer.id }, silent: true }
//                 )
//                 Promise.all([createLink, updateReactions])
//                     .then(() => resolve())
//                     .catch((error) => resolve(error))
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // add user ids to old mentions
// const regex = `(?<=mention":{).*?(?=})`
// const posts = await Post.findAll({
//     where: { text: { [Op.not]: null } },
//     attributes: ['id', 'text'],
// })
// Promise.all(
//     posts.map(
//         (post) =>
//             new Promise(async (resolve) => {
//                 const matches = [...post.text.matchAll(regex)].map((t) =>
//                     JSON.parse(`{${t[0]}}`)
//                 )
//                 if (!matches.length) resolve()
//                 else {
//                     const mentions = []
//                     Promise.all(
//                         matches.map(
//                             async (match) =>
//                                 new Promise((resolve2) => {
//                                     if (match.id) resolve2()
//                                     else {
//                                         User.findOne({
//                                             where: { handle: match.link },
//                                             attributes: ['id'],
//                                         }).then((user) => {
//                                             mentions.push({ link: match.link, id: user.id })
//                                             resolve2()
//                                         })
//                                     }
//                                 })
//                         )
//                     )
//                         .then(() => {
//                             let newText = `${post.text}`
//                             for (mention of mentions) {
//                                 newText = newText.replace(
//                                     `"link":"${mention.link}"`,
//                                     `"id":${mention.id},"link":"${mention.link}"`
//                                 )
//                             }
//                             post.update({ text: newText }, { silent: true })
//                                 .then(() => resolve())
//                                 .catch((error) => resolve(error))
//                         })
//                         .catch((error) => resolve(error))
//                 }
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // convert all  comment reactions to post reaction
// Reaction.update({ itemType: 'post' }, { where: { itemType: 'comment' }, silent: true })
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// // add state to all images
// Image.update({ state: 'active' }, { where: { state: null }, silent: true })
//     .then(() => res.status(200).json({ message: 'Success' }))
//     .catch((error) => res.status(500).json(error))

// todo after migration:
//                                  // add creatorIds to Urls
//                                  // Url.update({ creatorId: post.creatorId }, { where: { id: url.id }, silent: true  })

//                                  // add creatorIds to Audios
//                                  Audio.update({ creatorId: post.creatorId }, { where: { id: audio.id }, silent: true  })
