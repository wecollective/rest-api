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
    players: BaseUser[]
}

export type BaseUser = {
    id: number
    handle: string
    name: string
    flagImagePath: string
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

type PlayVariables = Record<string, string | number | boolean | BaseUser>

export type Play = {
    variables: PlayVariables
} & (
        | { status: 'waiting' | 'stopped' | 'ended' }
        | { status: 'paused'; step: MoveStep; moveId?: number }
        | { status: 'started' | 'paused'; step: MoveStep; moveId: number }
    )

async function getPost(id: number): Promise<Post> {
    const post = await Post.findOne({
        raw: true,
        nest: true,
        where: {
            state: 'active',
            id
        },
    })

    if (!post) {
        throw new Error(`Post ${id}  not found`)
    }

    return post;
}

async function updatePost(post: Post, data: Partial<Post>): Promise<Post> {
    await Post.update(data, { where: { id: post.id } })
    return {
        ...post,
        ...data,
    }
}

const getFirstMove = (
    step: Step | undefined,
    variables: PlayVariables,
    players: BaseUser[]
): undefined | { step: MoveStep; variables: PlayVariables } => {
    if (!step) {
        return undefined
    }
    switch (step.type) {
        case 'move':
            return { step, variables }
        case 'sequence': {
            if (step.repeat && ((step.repeat.type === 'rounds' && step.repeat.amount === 0) || (step.repeat.type === 'turns' && players.length === 0))) {
                return undefined
            }

            const firstStep = getFirstMove(step.steps[0], variables, players)
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
                    [step.name]: firstStep.variables[step.name] ?? (step.repeat.type === 'rounds' ? 1 : players[0]),
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
    players: BaseUser[]
): undefined | { current: MoveStep; next?: MoveStep; variables: PlayVariables } => {
    let current: MoveStep | undefined
    let currentVariables = variables
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i]

        if (current) {
            const nextStep = getFirstMove(step, currentVariables, players)
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
                    const result = getTransition(step.steps, stepId, currentVariables, players)
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
                            const player = currentVariables[step.name] as BaseUser
                            const playerIndex = players.findIndex(p => p.id === player.id)
                            nextValue = players[playerIndex + 1]
                        }
                        if (nextValue) {
                            const firstStep = getFirstMove(
                                step,
                                {
                                    ...result.variables,
                                    [step.name]: nextValue,
                                },
                                players
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


async function createChild(data: any, parent: Post): Promise<Post> {
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
            const value = variables[variableName]
            if (typeof value === 'object') {
                return `@${value.name}`
            }
            return `${variables[variableName]}`
        }
        return substring
    })
}

type Changes = { changedGamePost: Post, changedMoves?: Post[] }

async function startNewMove(gamePost: Post, step: MoveStep, variables: PlayVariables, io: Server): Promise<Changes> {
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
    scheduleMoveTimeout(movePost, io)

    const changedGamePost = await updatePost(gamePost, {
        game: {
            ...game,
            play: {
                status: 'started',
                step,
                moveId: movePost.id,
                variables: variables,
            }
        }
    })

    return { changedGamePost, changedMoves: [movePost] }
}

async function nextMove(gamePost: Post, io: Server): Promise<Changes | undefined> {
    const game = gamePost.game!;
    const play = game.play!;
    if (play.status !== 'started' && play.status !== 'paused') {
        return;
    }
    const transition = getTransition(
        game.steps,
        play.step.id,
        play.variables,
        game.players
    )

    if (transition?.next) {
        if (play.status === 'started') {
            return await startNewMove(gamePost, transition.next, transition.variables, io)
        } else {
            const changedGamePost = await updatePost(gamePost, {
                game: {
                    ...game,
                    play: {
                        status: 'paused',
                        step: transition.next,
                        variables: transition.variables,
                    }
                }
            })
            return {
                changedGamePost,
            }
        }
    } else {
        const changedGamePost = await updatePost(gamePost, {
            game: {
                ...game,
                play: {
                    status: 'ended',
                    variables: transition?.variables ?? play.variables
                }
            }
        })
        return { changedGamePost }
    }
}


async function moveTimeout(movePost: Post, io: Server) {
    const move = movePost.move!
    const newMovePost = await updatePost(movePost, {
        move: {
            ...move,
            status: 'ended'
        }
    })
    if (move.gameId) {
        const gamePost = await getPost(move.gameId);
        const changes = await nextMove(gamePost, io)
        if (changes) {
            emitChanges(io, { ...changes!, changedMoves: [newMovePost, ...changes.changedMoves ?? []] })
        }
    }
}

function scheduleMoveTimeout(movePost: Post, io: Server) {
    schedule.scheduleJob((movePost.move! as Extract<Move, { status: 'started' }>).timeout, async () => {
        const currentMovePost = await getPost(movePost.id)
        if (!isEqual(currentMovePost.move, movePost.move)) {
            console.log('The state of the move has changed, skipping job.')
            return
        }
        await moveTimeout(currentMovePost, io)
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
            await moveTimeout(post, io)
        } else {
            scheduleMoveTimeout(post, io)
        }
    }
}

function emitChanges(io: Server, { changedGamePost, changedMoves }: Changes) {
    io.in(changedGamePost.id as any).emit(EVENTS.incoming.updated, { game: changedGamePost.game!, changedChildren: changedMoves })
}

export async function registerGameServerEvents(socket: Socket, io: Server) {
    socket.on(EVENTS.outgoing.update, async ({ id, game }: { id: number, game: Game }) => {
        const post = await getPost(id)
        const changedGamePost = await updatePost(post, {
            game
        })

        emitChanges(io, { changedGamePost })
    })

    socket.on(EVENTS.outgoing.start, async ({ id }: { id: number }) => {
        const gamePost: Post = await getPost(id)
        const game = gamePost.game!
        const play = game.play;

        if (play.status === 'started') {
            return
        }

        let changes: Changes;
        if (play.status === 'paused') {
            const moveId = play.moveId;
            if (!moveId) {
                changes = await startNewMove(gamePost, play.step, play.variables, io)
            } else {
                const changedGamePost = await updatePost(gamePost, {
                    game: {
                        ...game,
                        play: {
                            status: 'started',
                            moveId,
                            step: play.step,
                            variables: play.variables,
                        }
                    }
                })
                const movePost = await getPost(moveId);
                const move = movePost.move!;
                if (move.status === 'paused') {
                    const now = + new Date();
                    const timeout = now + parseDuration(play.step.timeout)! - move.elapsedTime;
                    const newMovePost = await updatePost(movePost, {
                        move: {
                            ...move,
                            status: 'started',
                            elapsedTime: move.elapsedTime,
                            startedAt: now,
                            timeout,
                        }
                    })
                    scheduleMoveTimeout(newMovePost, io)
                    changes = {
                        changedGamePost,
                        changedMoves: [newMovePost]
                    }
                } else {
                    changes = {
                        changedGamePost
                    }
                }
            }
        } else {
            const variables = {}
            const step = getFirstMove(game.steps[0], variables, game.players);
            if (step) {
                changes = await startNewMove(gamePost, step.step, step.variables, io)
            } else {
                const changedGamePost = await updatePost(gamePost, {
                    game: {
                        ...game,
                        play: {
                            status: 'ended',
                            variables
                        }
                    }
                })
                changes = {
                    changedGamePost
                }
            }
        }
        emitChanges(io, changes)
    })

    socket.on(EVENTS.outgoing.skip, async ({ id }: { id: number }) => {
        const gamePost = await getPost(id);
        const play = gamePost.game!.play
        let skippedMovePost: Post | undefined;
        if ((play.status === 'started' || play.status === 'paused') && play.moveId) {
            const movePost = await getPost(play.moveId);
            const move = movePost.move!;
            if (move.status === 'started' || move.status === 'paused') {
                skippedMovePost = await updatePost(movePost, {
                    move: {
                        ...move,
                        status: 'skipped',
                    }
                })
            }
        }
        const changes = await nextMove(gamePost, io)
        emitChanges(io, { ...changes!, changedMoves: skippedMovePost && [skippedMovePost] })
    })

    socket.on(EVENTS.outgoing.pause, async ({ id }: { id: number }) => {
        const post = await getPost(id)
        const game = post.game!
        const play = game.play;

        if (play.status !== 'started') {
            return;
        }

        const changedGamePost = await updatePost(post, {
            game: {
                ...game,
                play: {
                    status: 'paused',
                    step: play.step,
                    variables: play.variables,
                    moveId: play.moveId,
                }
            }
        })

        const movePost = await getPost(play.moveId);
        const move = movePost.move!;
        let pausedMovePost: Post | undefined;
        if (move.status === 'started') {
            const now = + new Date();
            pausedMovePost = await updatePost(movePost, {
                move: {
                    ...move,
                    status: 'paused',
                    elapsedTime: move.elapsedTime + now - move.startedAt,
                    remainingTime: move.timeout - now
                }
            })
        }

        emitChanges(io, { changedGamePost, changedMoves: pausedMovePost && [pausedMovePost] })
    })

    socket.on(EVENTS.outgoing.stop, async ({ id }: { id: number }) => {
        const post = await getPost(id)
        const game = post.game!
        const play = game.play;

        if (play.status !== 'started' && play.status !== 'paused') {
            return
        }

        const changedGamePost = await updatePost(post, {
            game: {
                ...game,
                play: {
                    status: 'stopped',
                    variables: play.variables,
                }
            }
        })

        let stoppedMovePost: Post | undefined;
        if (play.moveId) {
            const movePost = await getPost(play.moveId);
            const move = movePost.move!;
            if (move.status === 'started' || move.status === 'paused') {
                stoppedMovePost = await updatePost(movePost, {
                    move: {
                        ...move,
                        status: 'stopped',
                    }
                })
            }
        }

        emitChanges(io, { changedGamePost, changedMoves: stoppedMovePost && [stoppedMovePost] })
    })
}
