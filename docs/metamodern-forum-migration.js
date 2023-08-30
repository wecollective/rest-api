// // Metamodern forum migration tasks
// const { Client } = require('pg')
// const client = new Client({
//     host: 'localhost',
//     user: 'postgres',
//     port: 5432,
//     password: 'root',
//     database: 'test',
// })
// client.connect()

// let testIndex = 0

// router.get('/test', async (req, res) => {
//     console.log('testing!')

//     if (testIndex > 0) {
//         console.log('second attempt')
//         res.send('second attempt')
//     } else {
//         console.log('first attempt')
//         testIndex += 1

//         const mmSpaceId = 463
//         const jamesId = 1

//         // Step 1: Add users
//         const users = await new Promise((resolve) => {
//             client.query(`SELECT * FROM users WHERE users.id > 0`, (error, result) => {
//                 if (error) resolve('error')
//                 else
//                     resolve(
//                         result.rows.map((user) => {
//                             return {
//                                 mm_id: user.id,
//                                 name: user.name || user.username,
//                                 handle: user.username,
//                             }
//                         })
//                     )
//             })
//         })

//         const usersWithEmailAndBio = await Promise.all(
//             users.map(
//                 (user) =>
//                     new Promise(async (resolve) => {
//                         const email = await new Promise(async (reso) => {
//                             client.query(
//                                 `SELECT * FROM user_emails WHERE user_emails.user_id = ${user.mm_id} `,
//                                 (error, result) => {
//                                     if (error || !result.rows[0]) reso(null)
//                                     else reso(result.rows[0].email)
//                                 }
//                             )
//                         })
//                         const bio = await new Promise(async (reso) => {
//                             client.query(
//                                 `SELECT * FROM user_profiles WHERE user_profiles.user_id = ${user.mm_id} `,
//                                 (error, result) => {
//                                     if (error || !result.rows[0]) reso(null)
//                                     else reso(result.rows[0].bio_raw)
//                                 }
//                             )
//                         })
//                         const matchId = await new Promise(async (reso) => {
//                             const matchingUser = await User.findOne({
//                                 where: {
//                                     [Op.or]: [{ email }, { handle: user.handle }],
//                                 },
//                             })
//                             reso(matchingUser ? matchingUser.id : null)
//                         })

//                         if (matchId) {
//                             // update user with mmid and add mm access if not present
//                             User.update({ mmId: user.mm_id }, { where: { id: matchId } }).then(
//                                 async () => {
//                                     const matchingSpaceAccess = await SpaceUser.findOne({
//                                         where: {
//                                             userId: matchId,
//                                             spaceId: mmSpaceId,
//                                             relationship: 'access',
//                                             state: 'active',
//                                         },
//                                     })
//                                     if (!matchingSpaceAccess) {
//                                         SpaceUser.create({
//                                             relationship: 'access',
//                                             state: 'active',
//                                             spaceId: mmSpaceId,
//                                             userId: matchId,
//                                         })
//                                             .then(() => resolve({ ...user, email, bio, matchId }))
//                                             .catch(() => resolve('error'))
//                                     } else
//                                         resolve({ ...user, email, bio, matchId })
//                                 }
//                             )
//                         } else {
//                             // create new user and grant access
//                             const createUser = await User.create({
//                                 name: user.name,
//                                 handle: user.handle,
//                                 mmId: user.mm_id,
//                                 email,
//                                 bio,
//                                 emailVerified: false,
//                                 state: 'unclaimed',
//                             })
//                             const addMMAccess = await SpaceUser.create({
//                                 relationship: 'access',
//                                 state: 'active',
//                                 spaceId: mmSpaceId,
//                                 userId: createUser.id,
//                             })
//                             Promise.all([createUser, addMMAccess])
//                                 .then(() => resolve({ ...user, email, bio, matchId }))
//                                 .catch(() => resolve('error'))
//                         }
//                         // resolve({ ...user, email, bio, matchId })
//                     })
//             )
//         )

//         res.json(usersWithEmailAndBio)
//     }

//         // Step 2: Add spaces and posts
//         const tagData = [
//             // { name: 'metapolitics', mmId: 3, wecoId: 0 },
//             // { name: 'game-b', mmId: 4, wecoId: 0 },
//             { name: 'question', mmId: 5, wecoId: 0 },
//             { name: 'spirituality', mmId: 6, wecoId: 0 },
//             // { name: 'ecology', mmId: 7, wecoId: 0 },
//             // { name: '70s', mmId: 8, wecoId: 0 },
//             // { name: 'ica', mmId: 9, wecoId: 0 },
//             // { name: 'strategy', mmId: 10, wecoId: 0 },
//             // { name: 'chicago', mmId: 11, wecoId: 0 },
//             // { name: 'parenting', mmId: 12, wecoId: 0 },
//             { name: 'education', mmId: 13, wecoId: 0 },
//             // { name: 'opportunities', mmId: 14, wecoId: 0 },
//             { name: 'politics', mmId: 15, wecoId: 0 },
//             // { name: 'meditation', mmId: 16, wecoId: 0 },
//             { name: 'philosophy', mmId: 17, wecoId: 0 },
//             // { name: 'quantum', mmId: 18, wecoId: 0 },
//             // { name: 'simultaneous-states', mmId: 19, wecoId: 0 },
//             // { name: 'epistomology', mmId: 20, wecoId: 0 },
//             // { name: 'ontology', mmId: 21, wecoId: 0 },
//             { name: 'metaphysics', mmId: 22, wecoId: 0 },
//             // { name: 'truth', mmId: 23, wecoId: 0 },
//             // { name: 'youtube', mmId: 24, wecoId: 0 },
//             // { name: 'community-building', mmId: 25, wecoId: 0 },
//             // { name: 'game', mmId: 26, wecoId: 0 },
//             // { name: 'ideation', mmId: 27, wecoId: 0 },
//             // { name: 'seriousplay', mmId: 28, wecoId: 0 },
//             { name: 'cocreation', mmId: 29, wecoId: 0 },
//             // { name: 'design', mmId: 30, wecoId: 0 },
//             // { name: 'communication', mmId: 31, wecoId: 0 },
//             // { name: 'burning-man', mmId: 32, wecoId: 0 },
//             // { name: 'stoicism', mmId: 33, wecoId: 0 },
//             // { name: 'glossary', mmId: 34, wecoId: 0 },
//             // { name: 'audio', mmId: 35, wecoId: 0 },
//             // { name: 'cosmolocalism', mmId: 36, wecoId: 0 },
//             { name: 'art', mmId: 37, wecoId: 0 },
//             // { name: 'poetry', mmId: 38, wecoId: 0 },
//             // { name: 'architecture', mmId: 39, wecoId: 0 },
//             // { name: 'development', mmId: 40, wecoId: 0 },
//             // { name: 'pathology', mmId: 41, wecoId: 0 },
//             // { name: 'absurdism', mmId: 42, wecoId: 0 },
//             // { name: 'meta-right', mmId: 43, wecoId: 0 },
//             // { name: 'coaching', mmId: 44, wecoId: 0 },
//             // { name: 'fractal-transformation', mmId: 45, wecoId: 0 },
//             // { name: 'leadership', mmId: 46, wecoId: 0 },
//             // { name: 'the-listening-body', mmId: 47, wecoId: 0 },
//             // { name: 'metamodern-somatics', mmId: 48, wecoId: 0 },
//             // { name: 'stage-theories', mmId: 49, wecoId: 0 },
//             { name: 'science', mmId: 50, wecoId: 0 },
//             // { name: 'book', mmId: 51, wecoId: 0 },
//             { name: 'funding', mmId: 52, wecoId: 0 },
//             // { name: 'postmodernism', mmId: 53, wecoId: 0 },
//             // { name: 'podcast', mmId: 54, wecoId: 0 },
//             // { name: 'manga', mmId: 55, wecoId: 0 },
//             // { name: 'somatics', mmId: 56, wecoId: 0 },
//             // { name: 'bodywork', mmId: 57, wecoId: 0 },
//             // { name: 'metaconventions', mmId: 58, wecoId: 0 },
//             // { name: 'post-academic-world', mmId: 59, wecoId: 0 },
//             // { name: 'economics', mmId: 60, wecoId: 0 },
//             // { name: 'metamodernfestival', mmId: 61, wecoId: 0 },
//             // { name: 'regeneration', mmId: 62, wecoId: 0 },
//             // { name: 'law', mmId: 63, wecoId: 0 },
//             // { name: 'parents', mmId: 64, wecoId: 0 },
//             // { name: 'gender', mmId: 65, wecoId: 0 },
//             // { name: 'fourth-political-theory', mmId: 66, wecoId: 0 },
//             // { name: 'heidegger', mmId: 67, wecoId: 0 },
//             // { name: 'the-listening-society', mmId: 68, wecoId: 0 },
//             // { name: 'quotes', mmId: 69, wecoId: 0 },
//             // { name: 'nordic-ideology', mmId: 70, wecoId: 0 },
//             // { name: 'metamodernism-in-media', mmId: 71, wecoId: 0 },
//             // { name: 'music', mmId: 72, wecoId: 0 },
//             // { name: 'performing-arts', mmId: 73, wecoId: 0 },
//             // { name: 'religion', mmId: 74, wecoId: 0 },
//             // { name: 'psychology', mmId: 75, wecoId: 0 },
//             // { name: 'slavery', mmId: 76, wecoId: 0 },
//             // { name: 'postcapitalism', mmId: 77, wecoId: 0 },
//             // { name: 'social-movements', mmId: 78, wecoId: 0 },
//             // { name: 'outreach', mmId: 79, wecoId: 0 },
//             // { name: 'neuroscience', mmId: 80, wecoId: 0 },
//             // { name: 'crypto', mmId: 81, wecoId: 0 },
//             // { name: 'dao', mmId: 82, wecoId: 0 },
//             // { name: 'animal-rights', mmId: 83, wecoId: 0 },
//             // { name: 'activism', mmId: 84, wecoId: 0 },
//             // { name: 'money', mmId: 85, wecoId: 0 },
//             // { name: 'economy', mmId: 86, wecoId: 0 },
//             // { name: 'ethics', mmId: 87, wecoId: 0 },
//             // { name: 'suffering', mmId: 88, wecoId: 0 },
//             // { name: 'sensemaking', mmId: 89, wecoId: 0 },
//             // { name: 'web3', mmId: 90, wecoId: 0 },
//             // { name: 'blockchain', mmId: 91, wecoId: 0 },
//             // { name: 'democracy', mmId: 92, wecoId: 0 },
//             // { name: 'direct-democracy', mmId: 93, wecoId: 0 },
//             // { name: 'liquid-democracy', mmId: 94, wecoId: 0 },
//             // { name: 'metacrisis', mmId: 95, wecoId: 0 },
//         ]

//         Promise.all(
//             tagData.map(
//                 (tag) =>
//                     new Promise(async (resolve) => {
//                         // resolve(tag)
//                         const newSpace = await Space.create({
//                             creatorId: jamesId,
//                             handle: `mm-${tag.name}`,
//                             name: tag.name,
//                             description: tag.name,
//                             state: 'active',
//                             privacy: 'public',
//                         })

//                         const createModRelationshipJames = await SpaceUser.create({
//                             relationship: 'moderator',
//                             state: 'active',
//                             spaceId: newSpace.id,
//                             userId: jamesId,
//                         })

//                         const createModRelationshipLCC = SpaceUser.create({
//                             relationship: 'moderator',
//                             state: 'active',
//                             spaceId: newSpace.id,
//                             userId: 8,
//                         })

//                         const createParentRelationship = await SpaceParent.create({
//                             spaceAId: mmSpaceId, // parent (metamodern forum id)
//                             spaceBId: newSpace.id, // child
//                             state: 'open',
//                         })

//                         const createAncestorRelationship = await SpaceAncestor.create({
//                             spaceAId: mmSpaceId, // ancestor (metamodern forum id)
//                             spaceBId: newSpace.id, // descendent
//                             state: 'open',
//                         })

//                         Promise.all([
//                             createModRelationshipJames,
//                             createModRelationshipLCC,
//                             createParentRelationship,
//                             createAncestorRelationship,
//                         ])
//                             .then(() =>
//                                 resolve({
//                                     name: tag.name,
//                                     mmId: tag.mmId,
//                                     wecoId: newSpace.id,
//                                 })
//                             )
//                             .catch((error) => resolve('error'))
//                     })
//             )
//         )
//             .then(async (newTagData) => {
//                 // get posts
//                 const posts = await new Promise((resolve) => {
//                     client.query(
//                         `SELECT * FROM topics WHERE archetype = 'regular' AND user_id > 0 ORDER BY created_at ASC`,
//                         (error, result) => {
//                             if (error) resolve('error')
//                             else
//                                 resolve(
//                                     result.rows.map((post) => {
//                                         return {
//                                             mm_id: post.id,
//                                             mm_creator_id: post.user_id,
//                                             text: post.title,
//                                             deleted: post.deleted_at,
//                                             created_at: post.created_at,
//                                         }
//                                     })
//                                 )
//                         }
//                     )
//                 })
//                 // add posts
//                 Promise.all(
//                     posts
//                         .filter((p) => !p.deleted)
//                         .map(
//                             (post) =>
//                                 new Promise(async (resolve) => {
//                                     // get weco user
//                                     const user = await User.findOne({
//                                         where: { mmId: post.mm_creator_id },
//                                     })
//                                     // get first comment
//                                     const firstComment = await new Promise(async (reso) => {
//                                         client.query(
//                                             `SELECT * FROM posts WHERE topic_id = ${post.mm_id} AND post_number = 1`,
//                                             (error, result) => {
//                                                 if (error || !result.rows[0]) reso('')
//                                                 else reso(result.rows[0].raw)
//                                             }
//                                         )
//                                     })
//                                     // get tags
//                                     const tags = await new Promise(async (reso) => {
//                                         client.query(
//                                             `SELECT * FROM topic_tags WHERE topic_id = ${post.mm_id} `,
//                                             (error, result) => {
//                                                 if (error || !result.rows[0]) reso([])
//                                                 else {
//                                                     let matchedTags = []
//                                                     result.rows.forEach((r) => {
//                                                         const match = newTagData.find(
//                                                             (t) => t.mmId === r.tag_id
//                                                         )
//                                                         if (match) matchedTags.push(match)
//                                                     })
//                                                     reso(matchedTags)
//                                                 }
//                                             }
//                                         )
//                                     })
//                                     // create post
//                                     Post.create(
//                                         {
//                                             creatorId: user.id,
//                                             text: `**${post.text}** <br/> <br/> ${firstComment}`,
//                                             createdAt: post.created_at,
//                                             updatedAt: post.created_at,
//                                             type: 'text',
//                                             state: 'visible',
//                                             mmId: post.mm_id,
//                                         },
//                                         { silent: true }
//                                     )
//                                         .then(async (newPost) => {
//                                             // attach to spaces
//                                             const createMMSP = await SpacePost.create({
//                                                 type: 'post',
//                                                 relationship: 'direct',
//                                                 creatorId: user.id,
//                                                 postId: newPost.id,
//                                                 spaceId: mmSpaceId,
//                                             })
//                                             const createTagSP = await Promise.all(
//                                                 tags.map(
//                                                     async (tag) =>
//                                                         await new Promise((reso) => {
//                                                             SpacePost.create({
//                                                                 type: 'post',
//                                                                 relationship: 'direct',
//                                                                 creatorId: user.id,
//                                                                 postId: newPost.id,
//                                                                 spaceId: tag.wecoId,
//                                                             })
//                                                                 .then(() => reso())
//                                                                 .catch(() => reso())
//                                                         })
//                                                 )
//                                             )
//                                             Promise.all([createMMSP, createTagSP])
//                                                 .then(() => resolve())
//                                                 .catch((error) => resolve())
//                                         })
//                                         .catch((error) => {
//                                             resolve('error')
//                                         })
//                                 })
//                         )
//                 )
//                     .then(() => res.json('success'))
//                     .catch((error) => res.json('error'))
//                 // // res.json(data)
//             })
//             .catch((error) => res.json('error'))
//     }

//         // Step 3: Add comments
//         const comments = await new Promise((resolve) => {
//             client.query(
//                 `SELECT * FROM posts WHERE user_id > 0 ORDER BY created_at ASC`,
//                 (error, result) => {
//                     if (error) resolve('error')
//                     else
//                         resolve(
//                             // result.rows
//                             result.rows.map((comment) => {
//                                 return {
//                                     mm_post_id: comment.topic_id,
//                                     mm_creator_id: comment.user_id,
//                                     text: comment.raw,
//                                     deleted: comment.deleted_at,
//                                     created_at: comment.created_at,
//                                     comment_number: comment.post_number,
//                                     reply_to_comment_number: comment.reply_to_post_number,
//                                 }
//                             })
//                         )
//                 }
//             )
//         })

//         Promise.all(
//             comments
//                 .filter((c) => !c.reply_to_comment_number && c.comment_number > 1)
//                 .map(
//                     async (comment) =>
//                         await new Promise(async (resolve) => {
//                             const matchingUser = await User.findOne({
//                                 where: { mmId: comment.mm_creator_id },
//                             })
//                             const matchingPost = await Post.findOne({
//                                 where: { mmId: comment.mm_post_id },
//                             })
//                             if (matchingUser && matchingPost) {
//                                 Comment.create(
//                                     {
//                                         state: 'visible',
//                                         creatorId: matchingUser.id,
//                                         spaceId: mmSpaceId,
//                                         postId: matchingPost.id,
//                                         // parentCommentId,
//                                         text: comment.text,
//                                         createdAt: comment.created_at,
//                                         updatedAt: comment.created_at,
//                                         mmId: comment.mm_post_id,
//                                         mmCommentNumber: comment.comment_number,
//                                     },
//                                     { silent: true }
//                                 )
//                                     .then(() => resolve())
//                                     .catch(() => resolve())
//                             } else resolve()
//                         })
//                 )
//         )
//             .then(() => {
//                 Promise.all(
//                     comments
//                         .filter((c) => c.reply_to_comment_number)
//                         .map(s
//                             async (comment) =>
//                                 await new Promise(async (resolve) => {
//                                     const matchingUser = await User.findOne({
//                                         where: { mmId: comment.mm_creator_id },
//                                     })
//                                     const matchingPost = await Post.findOne({
//                                         where: { mmId: comment.mm_post_id },
//                                     })
//                                     if (matchingUser && matchingPost) {
//                                         const parentComment = await Comment.findOne({
//                                             where: {
//                                                 postId: matchingPost.id,
//                                                 mmCommentNumber: comment.reply_to_comment_number,
//                                             },
//                                         })
//                                         Comment.create(
//                                             {
//                                                 state: 'visible',
//                                                 creatorId: matchingUser.id,
//                                                 spaceId: mmSpaceId,
//                                                 postId: matchingPost.id,
//                                                 parentCommentId: parentComment
//                                                     ? parentComment.parentCommentId ||
//                                                       parentComment.id
//                                                     : null,
//                                                 text: comment.text,
//                                                 createdAt: comment.created_at,
//                                                 updatedAt: comment.created_at,
//                                                 mmId: comment.mm_post_id,
//                                                 mmCommentNumber: comment.comment_number,
//                                             },
//                                             { silent: true }
//                                         )
//                                             .then(() => resolve())
//                                             .catch(() => resolve())
//                                     } else resolve()
//                                 })
//                         )
//                 )
//                     .then(() => res.json('success'))
//                     .catch(() => res.json('error'))
//             })
//             .catch((error) => {
//                 res.json('error')
//             })
//     }
// })
