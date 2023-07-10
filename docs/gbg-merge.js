// // //// 1. Create new URLs
// const urlPosts = await Post.findAll({
//     where: { state: 'visible', type: ['url', 'string-url'] },
//     attributes: [
//         'id',
//         'url',
//         'urlImage',
//         'urlTitle',
//         'urlDescription',
//         'urlDomain',
//         'createdAt',
//     ],
// })

// Promise.all(
//     urlPosts.map(
//         async (post) =>
//             await Url.create({
//                 type: 'post',
//                 itemId: post.id,
//                 state: 'active',
//                 url: post.url,
//                 image: post.urlImage,
//                 title: post.urlTitle,
//                 description: post.urlDescription,
//                 domain: post.urlDomain,
//                 createdAt: post.createdAt,
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // 2. Create new Audio
// const audioPosts = await Post.findAll({
//     where: { state: 'visible', type: ['audio', 'string-audio'] },
//     attributes: ['id', 'url'],
// })

// Promise.all(
//     audioPosts.map(
//         async (post) =>
//             await Audio.create({
//                 type: 'post',
//                 itemId: post.id,
//                 state: 'active',
//                 url: post.url,
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

//// 3. update string bead types
// Post.update({ type: 'gbg-audio' }, { where: { type: 'string-audio' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// Post.update({ type: 'gbg-text' }, { where: { type: 'string-text' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// Post.update({ type: 'gbg-image' }, { where: { type: 'string-image' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// Post.update({ type: 'gbg-url' }, { where: { type: 'string-url' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // 4. Update comment types for old comments
// Comment.update({ type: 'post' }, { where: { type: null } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // 5. Migrate old GBGs
// const oldGBGs = await GlassBeadGame.findAll()
// Promise.all(
//     oldGBGs.map(
//         async (gbg) =>
//             await GlassBeadGame2.create({
//                 oldGameId: gbg.id,
//                 postId: gbg.postId,
//                 state: 'active',
//                 locked: gbg.locked,
//                 topic: gbg.topic,
//                 topicGroup: gbg.topicGroup,
//                 topicImage: gbg.topicImage,
//                 synchronous: true,
//                 multiplayer: null,
//                 nextMoveDeadline: null,
//                 allowedBeadTypes: 'audio',
//                 playerOrder: gbg.playerOrder,
//                 totalMoves: null,
//                 movesPerPlayer: gbg.numberOfTurns,
//                 moveDuration: gbg.moveDuration,
//                 moveTimeWindow: null,
//                 characterLimit: null,
//                 introDuration: gbg.introDuration,
//                 outroDuration: gbg.outroDuration,
//                 intervalDuration: gbg.intervalDuration,
//                 backgroundImage: gbg.backgroundImage,
//                 backgroundVideo: gbg.backgroundVideo,
//                 backgroundVideoStartTime: gbg.backgroundVideoStartTime,
//                 createdAt: gbg.createdAt,
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// //// 6. Migrate old GBG beads
// const oldBeads = await GlassBead.findAll({ where: { userId: { [Op.not]: null } } })
// Promise.all(
//     oldBeads.map(
//         async (bead) =>
//             await new Promise(async (resolve) => {
//                 const createPost = await Post.create({
//                     type: 'gbg-audio',
//                     state: 'visible',
//                     creatorId: bead.userId,
//                     createdAt: bead.createdAt,
//                 })
//                 const createAudio = await Audio.create({
//                     type: 'post',
//                     itemId: createPost.id,
//                     state: 'active',
//                     url: bead.beadUrl,
//                 })
//                 const gamePost = await GlassBeadGame2.findOne({
//                     where: { oldGameId: bead.gameId },
//                     attributes: ['postId'],
//                 })
//                 const createLink = await Link.create({
//                     creatorId: bead.userId,
//                     type: 'gbg-post',
//                     state: 'visible',
//                     itemAId: gamePost.postId,
//                     itemBId: createPost.id,
//                     index: bead.index,
//                     totalLikes: 0,
//                     totalComments: 0,
//                     totalRatings: 0,
//                 })

//                 Promise.all([createAudio, createLink])
//                     .then(() => resolve())
//                     .catch(() => resolve())
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// //// 7. Migrate old GBG comments
// const oldGBGcomments = await GlassBeadGameComment.findAll({
//     where: { gameId: { [Op.not]: null } },
// })
// Promise.all(
//     oldGBGcomments.map(
//         async (comment) =>
//             await new Promise(async (resolve) => {
//                 const newGame = await GlassBeadGame2.findOne({
//                     where: { oldGameId: comment.gameId },
//                     attributes: ['id'],
//                 })
//                 const createComment = await Comment.create(
//                     {
//                         state: 'visible',
//                         type: 'glass-bead-game',
//                         itemId: newGame.id,
//                         creatorId: comment.userId,
//                         text: comment.text,
//                         createdAt: comment.createdAt,
//                         updatedAt: comment.updatedAt,
//                     },
//                     { silent: true }
//                 )
//                 Promise.all([createComment])
//                     .then(() => resolve())
//                     .catch(() => resolve())
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// //// 8. Update old Link types
// Link.update({ type: 'gbg-post' }, { where: { type: 'string-post' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // 9. Create old string GBG entries
// const stringPosts = await Post.findAll({ where: { type: 'string' } })
// Promise.all(
//     stringPosts.map(
//         async (string) =>
//             await GlassBeadGame2.create({
//                 oldGameId: null,
//                 postId: string.id,
//                 state: 'active',
//                 locked: false,
//                 topic: null,
//                 topicGroup: null,
//                 topicImage: null,
//                 synchronous: false,
//                 multiplayer: false,
//                 nextMoveDeadline: null,
//                 allowedBeadTypes: 'text,url,audio,image',
//                 playerOrder: null,
//                 totalMoves: null,
//                 movesPerPlayer: null,
//                 moveDuration: null,
//                 moveTimeWindow: null,
//                 characterLimit: null,
//                 introDuration: null,
//                 outroDuration: null,
//                 intervalDuration: null,
//                 backgroundImage: null,
//                 backgroundVideo: null,
//                 backgroundVideoStartTime: null,
//                 createdAt: string.createdAt,
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // 10. Add weave entries to new GBG table
// const weavePosts = await Post.findAll({ where: { type: 'weave' } })
// Promise.all(
//     weavePosts.map(
//         async (post) =>
//             await new Promise(async (resolve) => {
//                 const players = await UserPost.findAll({ where: { postId: post.id } })
//                 const playerOrder =
//                     players.length > 0
//                         ? players
//                               .sort((a, b) => a.index - b.index)
//                               .map((p) => p.userId)
//                               .join(',')
//                         : null
//                 const weave = await Weave.findOne({ where: { postId: post.id } })
//                 const createGBG = weave
//                     ? await GlassBeadGame2.create({
//                           oldGameId: null,
//                           postId: weave.postId,
//                           state: weave.state || 'active',
//                           locked: false,
//                           topic: null,
//                           topicGroup: null,
//                           topicImage: null,
//                           synchronous: false,
//                           multiplayer: true,
//                           nextMoveDeadline: weave.nextMoveDeadline,
//                           allowedBeadTypes: weave.allowedBeadTypes.toLowerCase(),
//                           playerOrder,
//                           totalMoves: weave.numberOfMoves,
//                           movesPerPlayer: weave.numberOfTurns,
//                           moveDuration: weave.audioTimeLimit,
//                           moveTimeWindow: weave.moveTimeWindow,
//                           characterLimit: weave.characterLimit,
//                           introDuration: null,
//                           outroDuration: null,
//                           intervalDuration: null,
//                           backgroundImage: null,
//                           backgroundVideo: null,
//                           backgroundVideoStartTime: null,
//                           createdAt: weave.createdAt,
//                       })
//                     : null

//                 Promise.all([createGBG])
//                     .then(() => resolve())
//                     .catch(() => resolve())
//             })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // Move event titles to post table
// const events = await Event.findAll()
// Promise.all(
//     events.map(
//         async (event) =>
//             await Post.update({ title: event.title }, { where: { id: event.postId } })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // Move poll titles to post table
// const polls = await Poll.findAll()
// Promise.all(
//     polls.map(
//         async (poll) =>
//             await Post.update({ title: poll.title }, { where: { id: poll.postId } })
//     )
// )
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // Change post type 'inquiry' to 'poll'
// Post.update({ type: 'poll' }, { where: { type: 'inquiry' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // update glass bead game post types
// Post.update({ type: 'glass-bead-game' }, { where: { type: ['string', 'weave'] } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // Change UserPost type 'weave' to 'glass-bead-game'
// UserPost.update({ type: 'glass-bead-game' }, { where: { type: 'weave' } })
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))

// // Update notification types
// const invitation = await Notification.update(
//     { type: 'gbg-invitation' },
//     { where: { type: 'weave-invitation' } }
// )
// const accepted = await Notification.update(
//     { type: 'gbg-accepted' },
//     { where: { type: 'weave-accepted' } }
// )
// const rejected = await Notification.update(
//     { type: 'gbg-rejected' },
//     { where: { type: 'weave-rejected' } }
// )
// const move = await Notification.update(
//     { type: 'gbg-move' },
//     { where: { type: 'weave-move' } }
// )
// const moveFromOtherPlayer = await Notification.update(
//     { type: 'gbg-move-from-other-player' },
//     { where: { type: 'weave-move-from-other-player' } }
// )
// const creatorMoveFromOtherPlayer = await Notification.update(
//     { type: 'gbg-creator-move-from-other-player' },
//     { where: { type: 'gbg-creator-move-from-other-player' } }
// )
// const cancelled = await Notification.update(
//     { type: 'gbg-cancelled' },
//     { where: { type: 'weave-cancelled' } }
// )
// const ended = await Notification.update(
//     { type: 'gbg-ended' },
//     { where: { type: 'weave-ended' } }
// )
// const newGbgFromYourPost = await Notification.update(
//     { type: 'new-gbg-from-your-post' },
//     { where: { type: 'new-weave-from-your-post' } }
// )
// const vote = await Notification.update(
//     { type: 'poll-vote' },
//     { where: { type: 'inquiry-vote' } }
// )
// Promise.all([
//     invitation,
//     accepted,
//     rejected,
//     move,
//     moveFromOtherPlayer,
//     creatorMoveFromOtherPlayer,
//     cancelled,
//     ended,
//     newGbgFromYourPost,
//     vote,
// ])
//     .then(() => res.status(200).json({ message: 'success' }))
//     .catch((error) => res.status(500).json(error))
