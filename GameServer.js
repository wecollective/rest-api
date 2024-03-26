"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGameServerEvents = exports.initializeGameServerTasks = void 0;
const lodash_1 = require("lodash");
const node_schedule_1 = __importDefault(require("node-schedule"));
const parse_duration_1 = __importDefault(require("parse-duration"));
const sequelize_1 = __importDefault(require("sequelize"));
const { Post, Link } = require('./models');
const { createPost } = require('./Helpers');
const { Op } = sequelize_1.default;
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
];
function getPost(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const post = yield Post.findOne({
            raw: true,
            nest: true,
            where: {
                state: 'active',
                id
            },
        });
        if (!post) {
            throw new Error(`Post ${id}  not found`);
        }
        return post;
    });
}
function updatePost(post, data) {
    return __awaiter(this, void 0, void 0, function* () {
        yield Post.update(data, { where: { id: post.id } });
        return Object.assign(Object.assign({}, post), data);
    });
}
const getFirstMove = (step, variables, playerIds) => {
    var _a;
    if (!step) {
        return undefined;
    }
    switch (step.type) {
        case 'move':
            return { step, variables };
        case 'sequence': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds);
            if (!firstStep) {
                return undefined;
            }
            if (!step.repeat) {
                return firstStep;
            }
            return {
                step: firstStep.step,
                variables: Object.assign(Object.assign({}, firstStep.variables), { [step.name]: (_a = firstStep.variables[step.name]) !== null && _a !== void 0 ? _a : (step.repeat.type === 'rounds' ? 1 : playerIds[0]) }),
            };
        }
        default: {
            const exhaustivenessCheck = step;
            throw exhaustivenessCheck;
        }
    }
};
const getTransition = (steps, stepId, variables, playerIds) => {
    let current;
    let currentVariables = variables;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (current) {
            const nextStep = getFirstMove(step, currentVariables, playerIds);
            if (nextStep) {
                return { current, next: nextStep.step, variables: nextStep.variables };
            }
        }
        else {
            switch (step.type) {
                case 'move':
                    if (step.id === stepId) {
                        current = step;
                    }
                    break;
                case 'sequence': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds);
                    if (!result) {
                        break;
                    }
                    if (result.next) {
                        return result;
                    }
                    if (step.repeat) {
                        let nextValue;
                        if (step.repeat.type === 'rounds') {
                            const round = currentVariables[step.name];
                            nextValue = round < +step.repeat.amount ? round + 1 : undefined;
                        }
                        else {
                            const playerId = currentVariables[step.name];
                            const playerIndex = playerIds.indexOf(playerId);
                            nextValue = playerIds[playerIndex + 1];
                        }
                        if (nextValue) {
                            const firstStep = getFirstMove(step, Object.assign(Object.assign({}, result.variables), { [step.name]: nextValue }), playerIds);
                            if (firstStep) {
                                return {
                                    current: result.current,
                                    next: firstStep.step,
                                    variables: firstStep.variables,
                                };
                            }
                        }
                    }
                    current = result.current;
                    currentVariables = (0, lodash_1.omit)(result.variables, step.name);
                    break;
                }
                default: {
                    const exhaustivenessCheck = step;
                    throw exhaustivenessCheck;
                }
            }
        }
    }
    if (current) {
        return { current, variables: currentVariables };
    }
    return undefined;
};
function createChild(data, parent) {
    return __awaiter(this, void 0, void 0, function* () {
        const { post } = yield createPost(data, [], parent.creatorId);
        yield Link.create({
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
        });
        return post;
    });
}
function insertVariables(text, variables) {
    return text === null || text === void 0 ? void 0 : text.replace(/\[([^\]]+)\]/, (substring, variableName) => {
        if (variableName in variables) {
            return `${variables[variableName]}`;
        }
        return substring;
    });
}
function startNewMove(gamePost, step, variables, io) {
    return __awaiter(this, void 0, void 0, function* () {
        const game = gamePost.game;
        const play = game.play;
        const now = +new Date();
        const timeout = now + (0, parse_duration_1.default)(step.timeout);
        const move = {
            status: 'started',
            elapsedTime: 0,
            startedAt: now,
            timeout,
            gameId: gamePost.id
        };
        const movePost = yield createChild({
            type: 'post',
            mediaTypes: '',
            title: insertVariables(step.title, variables),
            text: insertVariables(step.text, variables),
            move
        }, gamePost);
        scheduleMoveTimeout(movePost, io);
        const changedGamePost = yield updatePost(gamePost, {
            game: Object.assign(Object.assign({}, game), { play: {
                    status: 'started',
                    step,
                    moveId: movePost.id,
                    variables: variables,
                    playerIds: play.playerIds,
                } })
        });
        return { changedGamePost, changedMoves: [movePost] };
    });
}
function nextMove(gamePost, io) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const game = gamePost.game;
        const play = game.play;
        if (play.status !== 'started' && play.status !== 'paused') {
            return;
        }
        const transition = getTransition(game.steps, play.step.id, play.variables, play.playerIds);
        if (transition === null || transition === void 0 ? void 0 : transition.next) {
            if (play.status === 'started') {
                return yield startNewMove(gamePost, transition.next, transition.variables, io);
            }
            else {
                const changedGamePost = yield updatePost(gamePost, {
                    game: Object.assign(Object.assign({}, game), { play: {
                            status: 'paused',
                            step: transition.next,
                            variables: transition.variables,
                            playerIds: play.playerIds,
                        } })
                });
                return {
                    changedGamePost,
                };
            }
        }
        else {
            const changedGamePost = yield updatePost(gamePost, {
                game: Object.assign(Object.assign({}, game), { play: {
                        playerIds: play.playerIds,
                        status: 'ended',
                        variables: (_a = transition === null || transition === void 0 ? void 0 : transition.variables) !== null && _a !== void 0 ? _a : play.variables
                    } })
            });
            return { changedGamePost };
        }
    });
}
function moveTimeout(movePost, io) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const move = movePost.move;
        const newMovePost = yield updatePost(movePost, {
            move: Object.assign(Object.assign({}, move), { status: 'ended' })
        });
        if (move.gameId) {
            const gamePost = yield getPost(move.gameId);
            const changes = yield nextMove(gamePost, io);
            if (changes) {
                emitChanges(io, Object.assign(Object.assign({}, changes), { changedMoves: [newMovePost, ...(_a = changes.changedMoves) !== null && _a !== void 0 ? _a : []] }));
            }
        }
    });
}
function scheduleMoveTimeout(movePost, io) {
    node_schedule_1.default.scheduleJob(movePost.move.timeout, () => __awaiter(this, void 0, void 0, function* () {
        const currentMovePost = yield getPost(movePost.id);
        if (!(0, lodash_1.isEqual)(currentMovePost.move, movePost.move)) {
            console.log('The state of the move has changed, skipping job.');
            return;
        }
        yield moveTimeout(currentMovePost, io);
    }));
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
};
function initializeGameServerTasks(io) {
    return __awaiter(this, void 0, void 0, function* () {
        const moves = yield Post.findAll({
            where: {
                state: 'active',
                'move': { [Op.not]: null }
            }
        });
        for (const post of moves) {
            const move = post.move;
            if (move.status !== 'started') {
                continue;
            }
            if (move.timeout < +new Date()) {
                yield moveTimeout(post, io);
            }
            else {
                scheduleMoveTimeout(post, io);
            }
        }
    });
}
exports.initializeGameServerTasks = initializeGameServerTasks;
function emitChanges(io, { changedGamePost, changedMoves }) {
    io.in(changedGamePost.id).emit(EVENTS.incoming.updated, { game: changedGamePost.game, changedChildren: changedMoves });
}
function registerGameServerEvents(socket, io) {
    return __awaiter(this, void 0, void 0, function* () {
        socket.on(EVENTS.outgoing.update, (_a) => __awaiter(this, [_a], void 0, function* ({ id, game }) {
            const post = yield getPost(id);
            const changedGamePost = yield updatePost(post, {
                game
            });
            emitChanges(io, { changedGamePost });
        }));
        socket.on(EVENTS.outgoing.start, (_b) => __awaiter(this, [_b], void 0, function* ({ id }) {
            const gamePost = yield getPost(id);
            const game = gamePost.game;
            const play = game.play;
            if (play.status === 'started') {
                return;
            }
            let changes;
            if (play.status === 'paused') {
                const moveId = play.moveId;
                if (!moveId) {
                    changes = yield startNewMove(gamePost, play.step, play.variables, io);
                }
                else {
                    const changedGamePost = yield updatePost(gamePost, {
                        game: Object.assign(Object.assign({}, game), { play: {
                                status: 'started',
                                moveId,
                                playerIds: play.playerIds,
                                step: play.step,
                                variables: play.variables,
                            } })
                    });
                    const movePost = yield getPost(moveId);
                    const move = movePost.move;
                    if (move.status === 'paused') {
                        const now = +new Date();
                        const timeout = now + (0, parse_duration_1.default)(play.step.timeout) - move.elapsedTime;
                        const newMovePost = yield updatePost(movePost, {
                            move: Object.assign(Object.assign({}, move), { status: 'started', elapsedTime: move.elapsedTime, startedAt: now, timeout })
                        });
                        scheduleMoveTimeout(newMovePost, io);
                        changes = {
                            changedGamePost,
                            changedMoves: [newMovePost]
                        };
                    }
                    else {
                        changes = {
                            changedGamePost
                        };
                    }
                }
            }
            else {
                const step = getFirstMove(game.steps[0], {}, play.playerIds);
                if (!step) {
                    throw new Error('No step.');
                }
                changes = yield startNewMove(gamePost, step.step, step.variables, io);
            }
            emitChanges(io, changes);
        }));
        socket.on(EVENTS.outgoing.skip, (_c) => __awaiter(this, [_c], void 0, function* ({ id }) {
            const gamePost = yield getPost(id);
            const play = gamePost.game.play;
            let skippedMovePost;
            if ((play.status === 'started' || play.status === 'paused') && play.moveId) {
                const movePost = yield getPost(play.moveId);
                const move = movePost.move;
                if (move.status === 'started' || move.status === 'paused') {
                    skippedMovePost = yield updatePost(movePost, {
                        move: Object.assign(Object.assign({}, move), { status: 'skipped' })
                    });
                }
            }
            const changes = yield nextMove(gamePost, io);
            emitChanges(io, Object.assign(Object.assign({}, changes), { changedMoves: skippedMovePost && [skippedMovePost] }));
        }));
        socket.on(EVENTS.outgoing.pause, (_d) => __awaiter(this, [_d], void 0, function* ({ id }) {
            const post = yield getPost(id);
            const game = post.game;
            const play = game.play;
            if (play.status !== 'started') {
                return;
            }
            const changedGamePost = yield updatePost(post, {
                game: Object.assign(Object.assign({}, game), { play: {
                        status: 'paused',
                        step: play.step,
                        variables: play.variables,
                        moveId: play.moveId,
                        playerIds: play.playerIds,
                    } })
            });
            const movePost = yield getPost(play.moveId);
            const move = movePost.move;
            let pausedMovePost;
            if (move.status === 'started') {
                const now = +new Date();
                pausedMovePost = yield updatePost(movePost, {
                    move: Object.assign(Object.assign({}, move), { status: 'paused', elapsedTime: move.elapsedTime + now - move.startedAt, remainingTime: move.timeout - now })
                });
            }
            emitChanges(io, { changedGamePost, changedMoves: pausedMovePost && [pausedMovePost] });
        }));
        socket.on(EVENTS.outgoing.stop, (_e) => __awaiter(this, [_e], void 0, function* ({ id }) {
            const post = yield getPost(id);
            const game = post.game;
            const play = game.play;
            if (play.status !== 'started' && play.status !== 'paused') {
                return;
            }
            const changedGamePost = yield updatePost(post, {
                game: Object.assign(Object.assign({}, game), { play: {
                        status: 'stopped',
                        variables: play.variables,
                        playerIds: play.playerIds,
                    } })
            });
            let stoppedMovePost;
            if (play.moveId) {
                const movePost = yield getPost(play.moveId);
                const move = movePost.move;
                if (move.status === 'started' || move.status === 'paused') {
                    stoppedMovePost = yield updatePost(movePost, {
                        move: Object.assign(Object.assign({}, move), { status: 'stopped' })
                    });
                }
            }
            emitChanges(io, { changedGamePost, changedMoves: stoppedMovePost && [stoppedMovePost] });
        }));
    });
}
exports.registerGameServerEvents = registerGameServerEvents;
