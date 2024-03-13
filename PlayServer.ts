import { isEqual, omit } from 'lodash'
import schedule from 'node-schedule'
import parseDuration from 'parse-duration'
import sequelize from 'sequelize'
import { Server, Socket } from 'socket.io'

const { Post, Link } = require('./models')
const { createPost } = require('./Helpers')

const { Op } = sequelize

const POST_TYPE = [
    'post',
    'play',
    'comment',
    'bead',
    'poll-answer',
    'card-face',
    'gbg-room-comment',
    'url-block',
    'image-block',
    'audio-block',
] as const

type PostType = (typeof POST_TYPE)[number]

type Post = {
    id: number
    type: PostType
    mediaTypes: string
    title: string
    text: string
    createdAt: string
    updatedAt: string
    totalComments: number
    totalLikes: number
    totalRatings: number
    totalReposts: number
    totalLinks: number
    creatorId: number
    game?: Game
    play?: Play
    move?: Move
}

type Step = {
    id: string
} & (
        | {
            type: 'move'
            title: string
            text: string
            timeout: string
        }
        | {
            type: 'game'
            gameId: number
        }
        | {
            type: 'rounds'
            name: string
            amount: string
            steps: Step[]
        }
        | {
            type: 'turns'
            name: string
            steps: Step[]
        }
    )

type MoveStep = Extract<Step, { type: 'move' }>

type Game = {
    steps: Step[]
}

type Move = (
    | { status: 'skipped' | 'ended' }
    | { status: 'paused'; elapsedTime: number }
    | {
        status: 'started'
        startedAt: number
        timeout: number
    }
) & { playId?: number }

type PlayVariables = Record<string, string | number | boolean>

export type Play = {
    game: Game
    gameId: number
    playerIds: number[]
    variables: PlayVariables
} & (
        | { status: 'waiting' | 'stopped' | 'ended' }
        | { status: 'started'; stepId: string; moveId: number }
    )

async function getPost(id: number): Promise<Post> {
    const post = await Post.findOne({
        where: {
            state: 'active',
            id
        }
    })

    if (!post) {
        throw new Error(`Post ${id}  not found`)
    }

    return post;
}

async function updatePost(id: number, data: Partial<Post>) {
    return await Post.update(data, { where: { id } })
}

const getFirstMove = (
    step: Step | undefined,
    variables: PlayVariables,
    playerIds: number[]
): undefined | { step: MoveStep; variables: PlayVariables } => {
    if (!step) {
        return undefined
    }
    switch (step.type) {
        case 'game':
            throw new Error('TODO')
        case 'move':
            return { step, variables }
        case 'rounds': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [step.name]: firstStep.variables[step.name] ?? 1,
                },
            }
        }
        case 'turns': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [step.name]: firstStep.variables[step.name] ?? playerIds[0],
                },
            }
        }
        default: {
            const exhaustivenessCheck: never = step
            throw exhaustivenessCheck
        }
    }
}

const getTransition = (
    steps: Step[],
    stepId: string,
    variables: PlayVariables,
    playerIds: number[]
): undefined | { current: MoveStep; next?: MoveStep; variables: PlayVariables } => {
    let current: MoveStep | undefined
    let currentVariables = variables
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]

        if (current) {
            const nextStep = getFirstMove(step, currentVariables, playerIds)
            if (nextStep) {
                return { current, next: nextStep.step, variables: nextStep.variables }
            }
        } else {
            switch (step.type) {
                case 'game':
                    throw new Error('TODO')
                case 'move':
                    if (step.id === stepId) {
                        current = step
                    }
                    break
                case 'rounds':
                case 'turns': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    let next;
                    if (step.type === 'rounds') {
                        const round = currentVariables[step.name] as number
                        next = round < +step.amount ? round + 1 : undefined
                    } else {
                        const playerId = currentVariables[step.name] as number
                        const playerIndex = playerIds.indexOf(playerId)
                        next = playerIds[playerIndex + 1]
                    }
                    if (next) {
                        const firstStep = getFirstMove(
                            step,
                            {
                                ...result.variables,
                                [step.name]: next,
                            },
                            playerIds
                        )
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables,
                            }
                        }
                    }

                    current = result.current
                    currentVariables = omit(result.variables, step.name)
                    break
                }
                default: {
                    const exhaustivenessCheck: never = step
                    throw exhaustivenessCheck
                }
            }
        }
    }

    if (current) {
        return { current, variables: currentVariables }
    }

    return undefined
}


async function createChild(data: any, parent: Post) {
    const { post } = await createPost(data, [], parent.creatorId)
    await Link.create({
        creatorId: parent.creatorId,
        itemAId: parent.id,
        itemAType: parent.type,
        itemBId: post.id,
        itemBType: post.type,
        relationship: 'parent',
        state: 'active',
        totalLikes: 0,
        totalComments: 0,
        totalRatings: 0
    })
    return post
}

function insertVariables(text: string, variables: PlayVariables) {
    return text?.replace(/\(([^)]+)\)/, (substring, variableName) => {
        if (variableName in variables) {
            return `${variables[variableName]}`
        }
        return substring
    })
}

async function startStep(playPost: Post, step: MoveStep, variables: PlayVariables, io: Server) {
    const play = playPost.play!
    const now = +new Date();
    const timeout = now + parseDuration(step.timeout)!

    const move: Move = {
        status: 'started',
        startedAt: now,
        timeout,
        playId: playPost.id
    }
    const movePost = await createChild({
        type: 'post',
        mediaTypes: '',
        title: insertVariables(step.title, variables),
        text: insertVariables(step.text, variables),
        move
    }, playPost)

    const newPlay: Play = {
        ...play,
        status: 'started',
        stepId: step.id,
        moveId: movePost.id,
        variables: variables,
    }

    await updatePost(playPost.id, { play: newPlay })

    scheduleMoveTimeout(movePost, timeout, io)
    io.in(playPost.id as any).emit(EVENTS.incoming.updated, { play: newPlay })
}

async function moveTimeout(movePost: Post, io: Server) {
    const move = movePost.move!
    const newMove: Move = {
        ...move,
        status: 'ended'
    }
    updatePost(movePost.id, {
        move: newMove
    })
    if (move.playId) {
        const playPost = await getPost(move.playId);
        nextStep(playPost, io)
    }
}

async function nextStep(playPost: Post, io: Server) {
    const play = playPost.play!;
    if (play.status !== 'started') {
        return;
    }
    const transition = getTransition(
        play.game.steps,
        play.stepId,
        play.variables,
        play.playerIds
    )

    if (transition?.next) {
        console.log('next', transition.next, transition.variables)
        await startStep(playPost, transition.next, transition.variables, io)
    } else {
        const newPlay: Play = {
            game: play.game,
            gameId: play.gameId,
            playerIds: play.playerIds,
            status: 'ended',
            variables: transition?.variables ?? play.variables
        }
        // await createChild({
        //     type: 'post',
        //     mediaTypes: '',
        //     text: 'Play ended!',
        // }, playPost)
        await updatePost(playPost.id, { play: newPlay })
        io.in(playPost.id as any).emit(EVENTS.incoming.updated, { play: newPlay })
    }
}

function scheduleMoveTimeout(post: Post, timeout: number, io: Server) {
    schedule.scheduleJob(timeout, async () => {
        const currentPost = await getPost(post.id)
        if (!isEqual(currentPost.move, post.move)) {
            // The state of the move has changed, this job is outdated.
            return
        }
        moveTimeout(currentPost, io)
    })
}

const EVENTS = {
    outgoing: {
        updateGame: 'outgoing-update-play-game',
        start: 'outgoing-start-play',
        stop: 'outgoing-stop-play',

        skip: 'outgoing-skip-move',
        pause: 'outgoing-pause-move',
    },
    incoming: {
        updated: 'incoming-play-updated'
    }
}

export async function initializePlayServerTasks(io: Server) {
    const moves: Post[] = await Post.findAll({
        where: {
            state: 'active',
            'move': { [Op.not]: null }
        }
    })

    for (const post of moves) {
        const move = post.move!
        if (move.status !== 'started') {
            continue
        }

        console.log(move.timeout, +new Date())
        if (move.timeout < +new Date()) {
            moveTimeout(post, io)
        } else {
            scheduleMoveTimeout(post, move.timeout, io)
        }
    }
}

export async function registerPlayServerEvents(socket: Socket, io: Server) {
    socket.on(EVENTS.outgoing.updateGame, async ({ id, game }: { id: number, game: Game }) => {
        const post = await getPost(id)

        const newPlay: Play = {
            ...post.play!,
            game
        }

        await updatePost(id, {
            play: newPlay
        })

        io.in(id as any).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.start, async ({ id }: { id: number }) => {
        const playPost: Post = await Post.findOne({
            where: {
                id
            }
        })
        const play = playPost.play!

        if (play.status === 'started') {
            return
        }

        const step = getFirstMove(play.game.steps[0], play.variables, play.playerIds);
        if (!step) {
            throw new Error('No step.')
        }

        await startStep(playPost, step.step, step.variables, io)
    })

    socket.on(EVENTS.outgoing.skip, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })
        const play = post.play;
        const transition = getTransition(
            play.game.steps,
            play.step.id,
            play.variables,
            play.playerIds
        )
        const newPlay = transition?.next ? {
            ...play,
            step: transition.next,
            variables: transition.variables
        } : {
            game: play.game,
            gameId: play.gameId,
            playerIds: play.playerIds,
            status: 'ended',
            variables: {}
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(id as any).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.pause, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

        const newPlay = {
            ...post.play,
            status: 'paused'
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(id as any).emit(EVENTS.incoming.updated, { play: newPlay })
    })

    socket.on(EVENTS.outgoing.stop, async ({ id }: { id: number }) => {
        const post = await Post.findOne({
            where: {
                id
            }
        })

        const newPlay = {
            ...post.play,
            status: 'stopped'
        }

        await Post.update({
            play: newPlay
        }, {
            where: {
                id
            }
        })
        io.in(id as any).emit(EVENTS.incoming.updated, { play: newPlay })
    })
}
