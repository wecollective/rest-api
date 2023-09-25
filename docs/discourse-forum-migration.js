// General purpose discourse forum migration script

const { Client } = require('pg')
const client = new Client({
    host: 'localhost',
    user: 'postgres',
    port: 5432,
    password: 'root',
    database: 'dbname',
})
client.connect()

// check space and user prefixes not in use
// decide which categories or tags to skip and add their ids to the spacesIdsToSkip array below

// todo:
// + currently creates some comments with no text so need to remove after (on pinned posts?)
// + check if user handle present before adding and only use user prefix if required
// + look further into image handling
// + test private space setup (need to handle closed ancestors)

const creatorId = 1
const spaceId = 735
const public = true
const useTagsAsSpaces = false
const spacesIdsToSkip = [1, 4] // 'Uncategorized', 'General'
const spaceHandlePrefix = 'mc'
const userHandlePrefix = 'mc'
const ancestors = await SpaceAncestor.findAll({
    where: { spaceBId: spaceId },
    attributes: ['spaceAId'],
})

function removeQuotes(text) {
    text = text.replaceAll(/\[quote=.*\]\n/g, '> ')
    text = text.replaceAll(`\n[/quote]`, '')
    return text
}

const spaces = useTagsAsSpaces
    ? await new Promise((resolve) => {
          // get tags
          client.query(`SELECT * FROM tags`, (error, result) => {
              if (error) resolve(error)
              else {
                  resolve(
                      result.rows
                          .filter((tag) => !spacesIdsToSkip.includes(tag.id))
                          .map((tag) => {
                              return {
                                  id: tag.id,
                                  name: tag.name,
                                  description: tag.description,
                                  private: false,
                              }
                          })
                  )
              }
          })
      })
    : await new Promise((resolve) => {
          // get categories
          client.query(`SELECT * FROM categories`, (error, result) => {
              if (error) resolve(error)
              else
                  resolve(
                      result.rows
                          .filter((c) => !spacesIdsToSkip.includes(c.id))
                          .map((c) => {
                              return {
                                  id: c.id,
                                  name: c.name,
                                  handle: c.slug,
                                  private: c.read_restricted,
                                  // trim html from string
                                  description: c.description
                                      ? c.description.substring(3, c.description.length - 4)
                                      : null,
                              }
                          })
                  )
          })
      })

const users = await new Promise((resolve1) => {
    client.query(`SELECT * FROM users WHERE users.id > 0`, async (error, result) => {
        if (error) resolve1(error)
        else {
            Promise.all(
                result.rows.map(
                    (user) =>
                        // attach user data
                        new Promise(async (resolve2) => {
                            // get email
                            const email = await new Promise(async (resolve3) => {
                                client.query(
                                    `SELECT * FROM user_emails WHERE user_emails.user_id = ${user.id} `,
                                    (error, result) => {
                                        if (error || !result.rows[0]) resolve3(null)
                                        else resolve3(result.rows[0].email)
                                    }
                                )
                            })
                            // get bio
                            const bio = await new Promise(async (resolve3) => {
                                client.query(
                                    `SELECT * FROM user_profiles WHERE user_profiles.user_id = ${user.id} `,
                                    (error, result) => {
                                        if (error || !result.rows[0]) resolve3(null)
                                        else resolve3(result.rows[0].bio_raw)
                                    }
                                )
                            })
                            // check for matching weco user
                            const wecoId = await new Promise(async (resolve3) => {
                                const match = await User.findOne({ where: { email } })
                                resolve3(match ? match.id : null)
                            })
                            // return user
                            resolve2({
                                id: user.id,
                                name: user.name || user.username,
                                handle: user.username,
                                email,
                                bio,
                                wecoId,
                            })
                        })
                )
            )
                .then((usersWithData) => resolve1(usersWithData))
                .catch((err) => resolve1(err))
        }
    })
})

const posts = await new Promise((resolve1) => {
    client.query(
        `SELECT * FROM topics WHERE archetype = 'regular' AND user_id > 0 AND deleted_at IS NULL ORDER BY created_at ASC`,
        (error, result) => {
            if (error) resolve('error')
            else {
                Promise.all(
                    result.rows.map(
                        (post) =>
                            // attach post data
                            new Promise(async (resolve2) => {
                                // first comment used as post text
                                const firstComment = await new Promise(async (resolve3) => {
                                    client.query(
                                        `SELECT * FROM posts WHERE topic_id = ${post.id} AND post_number = 1`,
                                        (error, result) => {
                                            if (error || !result.rows[0]) resolve3('')
                                            else resolve3(result.rows[0].raw)
                                        }
                                    )
                                })
                                // find post spaces
                                const postSpaces = useTagsAsSpaces
                                    ? await new Promise(async (resolve3) => {
                                          client.query(
                                              `SELECT * FROM topic_tags WHERE topic_id = ${post.id} `,
                                              (error, result) => {
                                                  if (error || !result.rows[0]) resolve3([])
                                                  else {
                                                      // check for space matches incase some have been removed
                                                      let matches = []
                                                      result.rows.forEach((tag) => {
                                                          const match = spaces.find(
                                                              (s) => s.id === tag.tag_id
                                                          )
                                                          if (match) matches.push(match.id)
                                                      })
                                                      resolve3(matches)
                                                  }
                                              }
                                          )
                                      })
                                    : [post.category_id]
                                // return post
                                resolve2({
                                    id: post.id,
                                    creatorId: post.user_id,
                                    title: post.title,
                                    text: firstComment,
                                    createdAt: post.created_at,
                                    postSpaces,
                                })
                            })
                    )
                )
                    .then((postsWithData) => resolve1(postsWithData))
                    .catch((err) => resolve1(err))
            }
        }
    )
})

const comments = await new Promise((resolve) => {
    client.query(
        `SELECT * FROM posts WHERE user_id > 0 AND deleted_at IS NULL ORDER BY created_at ASC`,
        (error, result) => {
            if (error) resolve(error)
            else
                resolve(
                    result.rows.map((comment) => {
                        return {
                            postId: comment.topic_id,
                            creatorId: comment.user_id,
                            text: removeQuotes(comment.raw),
                            createdAt: comment.created_at,
                            commentNumber: comment.post_number,
                            replyToCommentNumber: comment.reply_to_post_number,
                        }
                    })
                )
        }
    )
})

const createSpaces = Promise.all(
    spaces.map(
        (space) =>
            new Promise(async (resolve) => {
                const handle = space.handle || space.name
                // todo: set up space stats
                const newSpace = await Space.create({
                    creatorId,
                    handle: `${spaceHandlePrefix}-${handle
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '-')}`,
                    name: space.name,
                    description: space.description || null,
                    state: 'active',
                    privacy: space.private ? 'private' : 'public',
                })
                // add weco space id to space
                space.wecoId = newSpace.id

                const createModRelationship = await SpaceUser.create({
                    relationship: 'moderator',
                    state: 'active',
                    spaceId: newSpace.id,
                    userId: creatorId,
                })

                const createParentRelationship = await SpaceParent.create({
                    spaceAId: spaceId, // parent
                    spaceBId: newSpace.id, // child
                    state: 'open',
                })

                // add parent to ancestors and create SpaceAncestor relationships
                const ancestorsAndParent = [...ancestors]
                ancestorsAndParent.push({ spaceAId: spaceId })
                const createAncestorRelationships = await Promise.all(
                    ancestorsAndParent.map(
                        async (ancestor) =>
                            await SpaceAncestor.create({
                                spaceAId: ancestor.spaceAId, // ancestor
                                spaceBId: newSpace.id, // descendent
                                state: 'open', // todo: handle private ancestors
                            })
                    )
                )

                Promise.all([
                    createModRelationship,
                    createParentRelationship,
                    createAncestorRelationships,
                ])
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            })
    )
)

const createUsers = await Promise.all(
    users.map(
        (user) =>
            new Promise(async (resolve) => {
                const newUser = user.wecoId
                    ? null
                    : await User.create({
                          name: user.name,
                          handle: `${userHandlePrefix}-${user.handle
                              .toLowerCase()
                              .replace(/[^a-z0-9]/g, '-')}`,
                          email: user.email,
                          bio: user.bio,
                          emailVerified: false,
                          state: 'unclaimed',
                      })
                if (!user.wecoId) user.wecoId = newUser.id
                const followSpace = await SpaceUser.create({
                    spaceId,
                    userId: user.wecoId,
                    relationship: 'follower',
                    state: 'active',
                })
                const grantAccess = public
                    ? null
                    : await SpaceUser.create({
                          spaceId,
                          userId: user.wecoId,
                          relationship: 'access',
                          state: 'active',
                      })
                Promise.all([newUser, followSpace, grantAccess])
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            })
    )
)

const createPosts = await Promise.all(
    posts.map(
        (post) =>
            new Promise(async (resolve) => {
                const creator = users.find((u) => u.id === post.creatorId)
                const totalComments = comments.filter((c) => c.postId === post.id).length - 1
                const newPost = await Post.create(
                    {
                        ...defaultPostValues,
                        creatorId: creator.wecoId,
                        type: 'text',
                        title: post.title,
                        text: post.text,
                        totalComments,
                        createdAt: post.createdAt,
                        updatedAt: post.createdAt,
                        lastActivity: post.createdAt,
                    },
                    { silent: true }
                )
                post.wecoId = newPost.id
                // create indirect relationships
                const indirectSpaces = ancestors.map((a) => a.spaceAId)
                const createIndirectRelationships = await Promise.all(
                    indirectSpaces.map((spaceId) =>
                        SpacePost.create({
                            type: 'post',
                            relationship: 'indirect',
                            creatorId: creator.wecoId,
                            postId: newPost.id,
                            spaceId,
                            state: 'active',
                        })
                    )
                )
                // create direct relationships
                const directSpaces = [spaceId]
                // add local post spaces
                post.postSpaces.forEach((spaceId) => {
                    const match = spaces.find((s) => s.id === spaceId)
                    if (match) directSpaces.push(match.wecoId)
                })
                const createDirectRelationships = await Promise.all(
                    directSpaces.map((spaceId) =>
                        SpacePost.create({
                            type: 'post',
                            relationship: 'direct',
                            creatorId: creator.wecoId,
                            postId: newPost.id,
                            spaceId,
                            state: 'active',
                        })
                    )
                )
                Promise.all([createIndirectRelationships, createDirectRelationships])
                    .then(() => resolve())
                    .catch((error) => resolve(error))
            })
    )
)

const createComments = await new Promise(async (resolve1) => {
    const createParentComments = await Promise.all(
        comments
            .filter((c) => !c.replyToCommentNumber && c.commentNumber > 1)
            .map(
                async (comment) =>
                    await new Promise(async (resolve2) => {
                        const creator = users.find((u) => u.id === comment.creatorId)
                        const post = posts.find((p) => p.id === comment.postId)
                        if (creator && post) {
                            const newComment = await Comment.create(
                                {
                                    state: 'visible',
                                    creatorId: creator.wecoId,
                                    spaceId,
                                    itemId: post.wecoId,
                                    itemType: 'post',
                                    text: comment.text,
                                    totalLikes: 0,
                                    totalReposts: 0,
                                    totalRatings: 0,
                                    totalLinks: 0,
                                    totalGlassBeadGames: 0,
                                    createdAt: comment.createdAt,
                                    updatedAt: comment.createdAt,
                                },
                                { silent: true }
                            )
                            comment.wecoId = newComment.id
                            Promise.all([newComment])
                                .then(() => resolve2())
                                .catch((error) => resolve2(error))
                        } else resolve2()
                    })
            )
    )

    const createReplies = await new Promise((resolve2) => {
        // compress parent comment ids to remove fractal nesting
        const replies = comments.filter((c) => c.replyToCommentNumber)
        replies.sort((a, b) => a.replyToCommentNumber - b.replyToCommentNumber)
        for (let i = 0; i < replies.length; i += 1) {
            const post = posts.find((p) => p.id === replies[i].postId)
            if (post) {
                const parent = replies.find(
                    (r) =>
                        r.postId === post.id && r.commentNumber === replies[i].replyToCommentNumber
                )
                // if parent comment, pass down parent comments replyToCommentNumber
                if (parent) replies[i].replyToCommentNumber = parent.replyToCommentNumber
            }
        }
        // create replies
        Promise.all(
            replies.map(
                async (reply) =>
                    await new Promise(async (resolve3) => {
                        const creator = users.find((u) => u.id === reply.creatorId)
                        const post = posts.find((p) => p.id === reply.postId)
                        if (creator && post) {
                            const parentComment = comments.find(
                                (c) =>
                                    c.postId === post.id &&
                                    c.commentNumber === reply.replyToCommentNumber
                            )
                            Comment.create(
                                {
                                    state: 'visible',
                                    creatorId: creator.wecoId,
                                    spaceId,
                                    itemId: post.wecoId,
                                    itemType: 'post',
                                    parentCommentId: parentComment
                                        ? parentComment.wecoId || null
                                        : null, // parentComment undefined
                                    text: reply.text,
                                    totalLikes: 0,
                                    totalReposts: 0,
                                    totalRatings: 0,
                                    totalLinks: 0,
                                    totalGlassBeadGames: 0,
                                    createdAt: reply.createdAt,
                                    updatedAt: reply.createdAt,
                                },
                                { silent: true }
                            )
                                .then(() => resolve3())
                                .catch(() => resolve3())
                        } else resolve3()
                    })
            )
        )
            .then(() => resolve2())
            .catch(() => resolve2())
    })

    for (const task of [createParentComments, createReplies]) await task
    resolve1()
})

const tasks = [createSpaces, createUsers, createPosts, createComments]
for (const task of tasks) await task
res.status(200).json({ message: 'Success' })
