const sequelize = require('sequelize')

const postAttributes = [
    'id',
    'type',
    'state',
    'color',
    'text',
    'url',
    'urlImage',
    'urlDomain',
    'urlTitle',
    'urlDescription',
    'createdAt',
    'updatedAt',
    [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Comments AS Comment WHERE Comment.state = 'visible' AND Comment.postId = Post.id)`
        ),
        'totalComments',
    ],
    // [
    //     sequelize.literal(
    //         `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type != 'vote' AND Reaction.state = 'active')
    //     + (SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND (Link.itemAId = Post.id OR Link.itemBId = Post.id) AND Link.type = 'post-post')`
    //     ),
    //     'totalReactions',
    // ],
    [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'like' AND Reaction.state = 'active')`
        ),
        'totalLikes',
    ],
    [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'repost' AND Reaction.state = 'active')`
        ),
        'totalReposts',
    ],
    [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatings',
    ],
    [
        sequelize.literal(
            `(SELECT SUM(value) FROM Reactions AS Reaction WHERE Reaction.postId = Post.id AND Reaction.type = 'rating' AND Reaction.state = 'active')`
        ),
        'totalRatingPoints',
    ],
    [
        sequelize.literal(
            `(SELECT COUNT(*) FROM Links AS Link WHERE Link.state = 'visible' AND Link.type != 'string-post' AND (Link.itemAId = Post.id OR Link.itemBId = Post.id))`
        ),
        'totalLinks',
    ],
]

// Space

const totalSpaceFollowers = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Users
        WHERE Users.id IN (
            SELECT SpaceUsers.userId
            FROM SpaceUsers
            RIGHT JOIN Users
            ON SpaceUsers.userId = Users.id
            WHERE SpaceUsers.spaceId = Space.id
            AND SpaceUsers.relationship = 'follower'
            AND SpaceUsers.state = 'active'
        )
    )`),
    'totalFollowers',
]

const totalSpaceComments = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Comments
        WHERE Comments.state = 'visible'
        AND Comments.postId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalComments',
]

const totalSpaceReactions = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.type != 'vote'
        AND Reactions.postId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalReactions',
]

const totalSpaceLikes = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.type = 'like'
        AND Reactions.postId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalLikes',
]

const totalSpaceRatings = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Reactions
        WHERE Reactions.state = 'active'
        AND Reactions.type = 'rating'
        AND Reactions.postId IN (
            SELECT SpacePosts.postId
            FROM SpacePosts
            RIGHT JOIN Posts
            ON SpacePosts.postId = Posts.id
            WHERE SpacePosts.spaceId = Space.id
        )
    )`),
    'totalRatings',
]

const totalSpacePosts = [
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

const totalSpaceChildren = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM SpaceParents
        AS VHR
        WHERE VHR.spaceAId = Space.id
        AND VHR.state = 'open'
    )`),
    'totalChildren',
]

const totalUserPosts = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Posts
        WHERE Posts.state = 'visible'
        AND Posts.type IN ('text', 'url', 'images', 'audio', 'event', 'string', 'glass-bead-game', 'prism')
        AND Posts.creatorId = User.id
    )`),
    'totalPosts',
]

const totalUserComments = [
    sequelize.literal(`(
    SELECT COUNT(*)
        FROM Comments
        WHERE Comments.creatorId = User.id
    )`),
    'totalComments',
]

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }
}

module.exports = {
    postAttributes,
    // Space
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
}
