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
    move?: Move
}

export type Step = {
    id: string
    name: string
    originalStep?: { gameId: number; stepId: string }
} & (
        | {
            type: 'move'
            title?: string
            text: string
            timeout: string
        }
        | {
            type: 'sequence'
            repeat?: { type: 'rounds'; amount: number } | { type: 'turns' }
            steps: Step[]
        }
    )

type MoveStep = Extract<Step, { type: 'move' }>

type Game = {
    steps: Step[]
    play: Play
}

type Move = (
    | { status: 'skipped' | 'ended' | 'stopped' }
    | { status: 'paused'; elapsedTime: number; remainingTime: number }
    | {
        status: 'started'
        elapsedTime: number
        startedAt: number
        timeout: number
    }
) & { gameId?: number }

type PlayVariables = Record<string, string | number | boolean>

export type Play = {
    playerIds: number[]
    variables: PlayVariables
} & (
        | { status: 'waiting' | 'stopped' | 'ended' }
        | { status: 'paused'; step: MoveStep; moveId?: number }
        | { status: 'started' | 'paused'; step: MoveStep; moveId: number }
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
        case 'move':
            return { step, variables }
        case 'sequence': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds)
            if (!firstStep) {
                return undefined
            }
            if (!step.repeat) {
                return firstStep
            }

            return {
                step: firstStep.step,
                variables: {
                    ...firstStep.variables,
                    [step.name]: firstStep.variables[step.name] ?? (step.repeat.type === 'rounds' ? 1 : playerIds[0]),
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
                case 'move':
                    if (step.id === stepId) {
                        current = step
                    }
                    break
                case 'sequence': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds)
                    if (!result) {
                        break
                    }

                    if (result.next) {
                        return result
                    }

                    if (step.repeat) {
                        let nextValue;
                        if (step.repeat.type === 'rounds') {
                            const round = currentVariables[step.name] as number
                            nextValue = round < +step.repeat.amount ? round + 1 : undefined
                        } else {
                            const playerId = currentVariables[step.name] as number
                            const playerIndex = playerIds.indexOf(playerId)
                            nextValue = playerIds[playerIndex + 1]
                        }
                        if (nextValue) {
                            const firstStep = getFirstMove(
                                step,
                                {
                                    ...result.variables,
                                    [step.name]: nextValue,
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

function insertVariables(text: string | undefined, variables: PlayVariables) {
    return text?.replace(/\[([^\]]+)\]/, (substring, variableName) => {
        if (variableName in variables) {
            return `${variables[variableName]}`
        }
        return substring
    })
}

async function startStep(gamePost: Post, step: MoveStep, variables: PlayVariables, io: Server) {
    const game = gamePost.game!
    const play = game.play
    const now = +new Date();
    const timeout = now + parseDuration(step.timeout)!

    const move: Move = {
        status: 'started',
        elapsedTime: 0,
        startedAt: now,
        timeout,
        gameId: gamePost.id
    }
    const movePost = await createChild({
        type: 'post',
        mediaTypes: '',
        title: insertVariables(step.title, variables),
        text: insertVariables(step.text, variables),
        move
    }, gamePost)

    const newGame: Game = {
        ...game,
        play: {
            status: 'started',
            step,
            moveId: movePost.id,
            variables: variables,
            playerIds: play.playerIds,
        }
    }

    await updatePost(gamePost.id, { game: newGame })

    scheduleMoveTimeout(movePost.id, move, timeout, io)
    io.in(gamePost.id as any).emit(EVENTS.incoming.updated, { game: newGame })
}

async function moveTimeout(id: number, move: Move, io: Server) {
    console.log('move timeout!')
    const newMove: Move = {
        ...move,
        status: 'ended'
    }
    await updatePost(id, {
        move: newMove
    })
    if (move.gameId) {
        const gamePost = await getPost(move.gameId);
        console.log(gamePost)
        nextStep(gamePost, io)
    }
}

async function nextStep(gamePost: Post, io: Server) {
    const game = gamePost.game!;
    const play = game.play!;
    if (play.status !== 'started' && play.status !== 'paused') {
        return;
    }
    const transition = getTransition(
        game.steps,
        play.step.id,
        play.variables,
        play.playerIds
    )

    if (transition?.next) {
        if (play.status === 'started') {
            await startStep(gamePost, transition.next, transition.variables, io)
        } else {
            const newGame: Game = {
                ...game,
                play: {
                    status: 'paused',
                    step: transition.next,
                    variables: transition.variables,
                    playerIds: play.playerIds,
                }
            }
            await updatePost(gamePost.id, { game: newGame })
            io.in(gamePost.id as any).emit(EVENTS.incoming.updated, { game: newGame })
        }
    } else {
        const newGame: Game = {
            ...game,
            play: {
                playerIds: play.playerIds,
                status: 'ended',
                variables: transition?.variables ?? play.variables
            }
        }
        await updatePost(gamePost.id, { game: newGame })
        io.in(gamePost.id as any).emit(EVENTS.incoming.updated, { game: newGame })
    }
}

function scheduleMoveTimeout(id: number, move: Move, timeout: number, io: Server) {
    schedule.scheduleJob(timeout, async () => {
        const currentPost = await getPost(id)
        if (!isEqual(currentPost.move, move)) {
            console.log(currentPost.move, move)
            // The state of the move has changed, this job is outdated.
            return
        }
        moveTimeout(id, move, io)
    })
}

const EVENTS = {
    outgoing: {
        update: 'gs:outgoing-update',
        start: 'gs:outgoing-start',
        stop: 'gs:outgoing-stop',

        skip: 'gs:outgoing-skip',
        pause: 'gs:outgoing-pause',
    },
    incoming: {
        updated: 'gs:incoming-updated'
    }
}

export async function initializeGameServerTasks(io: Server) {
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

        if (move.timeout < +new Date()) {
            moveTimeout(post.id, move, io)
        } else {
            scheduleMoveTimeout(post.id, move, move.timeout, io)
        }
    }
}

export async function registerGameServerEvents(socket: Socket, io: Server) {
    socket.on(EVENTS.outgoing.update, async ({ id, game }: { id: number, game: Game }) => {
        await updatePost(id, {
            game
        })

        io.in(id as any).emit(EVENTS.incoming.updated, { game })
    })

    socket.on(EVENTS.outgoing.start, async ({ id }: { id: number }) => {
        const gamePost: Post = await Post.findOne({
            where: {
                id
            }
        })
        const game = gamePost.game!
        const play = game.play;

        console.log(play)

        if (play.status === 'started') {
            return
        }

        if (play.status === 'paused') {
            const moveId = play.moveId;
            if (!moveId) {
                console.log('startstep')
                await startStep(gamePost, play.step, play.variables, io)
            } else {
                const newGame: Game = {
                    ...game,
                    play: {
                        status: 'started',
                        moveId,
                        playerIds: play.playerIds,
                        step: play.step,
                        variables: play.variables,
                    }
                }
                await updatePost(id, {
                    game: newGame
                })
                const movePost = await getPost(moveId);
                const move = movePost.move!;
                if (move.status === 'paused') {
                    const now = + new Date();
                    const timeout = now + parseDuration(play.step.timeout)! - move.elapsedTime;
                    const newMove: Move = {
                        ...move,
                        status: 'started',
                        elapsedTime: move.elapsedTime,
                        startedAt: now,
                        timeout,
                    }
                    await updatePost(moveId, {
                        move: newMove
                    })
                    scheduleMoveTimeout(moveId, newMove, timeout, io)
                }
                io.in(id as any).emit(EVENTS.incoming.updated, { game: newGame })
            }
        } else {
            const step = getFirstMove(game.steps[0], {}, play.playerIds);
            if (!step) {
                throw new Error('No step.')
            }

            await startStep(gamePost, step.step, step.variables, io)
        }
    })

    socket.on(EVENTS.outgoing.skip, async ({ id }: { id: number }) => {
        const gamePost = await getPost(id);
        const play = gamePost.game!.play
        if ((play.status === 'started' || play.status === 'paused') && play.moveId) {
            const movePost = await getPost(play.moveId);
            const move = movePost.move!;
            if (move.status === 'started' || move.status === 'paused') {
                const newMove: Move = {
                    ...move,
                    status: 'skipped',
                }
                await updatePost(play.moveId, {
                    move: newMove
                })
            }
        }
        await nextStep(gamePost, io)
    })

    socket.on(EVENTS.outgoing.pause, async ({ id }: { id: number }) => {
        const post = await getPost(id)
        const game = post.game!
        const play = game.play;

        if (play.status !== 'started') {
            return;
        }

        const newGame: Game = {
            ...game,
            play: {
                status: 'paused',
                step: play.step,
                variables: play.variables,
                moveId: play.moveId,
                playerIds: play.playerIds,
            }
        }
        await updatePost(id, { game: newGame })

        const movePost = await getPost(play.moveId);
        const move = movePost.move!;
        if (move.status === 'started') {
            const now = + new Date();
            const newMove: Move = {
                ...move,
                status: 'paused',
                elapsedTime: move.elapsedTime + now - move.startedAt,
                remainingTime: move.timeout - now
            }
            await updatePost(play.moveId, {
                move: newMove
            })
        }

        io.in(id as any).emit(EVENTS.incoming.updated, { game: newGame })
    })

    socket.on(EVENTS.outgoing.stop, async ({ id }: { id: number }) => {
        const post = await getPost(id)
        const game = post.game!
        const play = game.play;

        if (play.status !== 'started' && play.status !== 'paused') {
            return
        }

        const newGame: Game = {
            ...game,
            play: {
                status: 'stopped',
                variables: play.variables,
                playerIds: play.playerIds,
            }
        }
        await updatePost(id, { game: newGame })

        if (play.moveId) {
            const movePost = await getPost(play.moveId);
            const move = movePost.move!;
            if (move.status === 'started' || move.status === 'paused') {
                const newMove: Move = {
                    ...move,
                    status: 'stopped',
                }
                await updatePost(play.moveId, {
                    move: newMove
                })
            }
        }

        io.in(id as any).emit(EVENTS.incoming.updated, { game: newGame })
    })
}
