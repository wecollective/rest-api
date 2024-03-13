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
            where: {
                state: 'active',
                id
            }
        });
        if (!post) {
            throw new Error(`Post ${id}  not found`);
        }
        return post;
    });
}
function updatePost(id, data) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield Post.update(data, { where: { id } });
    });
}
const getFirstMove = (step, variables, playerIds) => {
    var _a, _b;
    if (!step) {
        return undefined;
    }
    switch (step.type) {
        case 'game':
            throw new Error('TODO');
        case 'move':
            return { step, variables };
        case 'rounds': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds);
            if (!firstStep) {
                return undefined;
            }
            return {
                step: firstStep.step,
                variables: Object.assign(Object.assign({}, firstStep.variables), { [step.name]: (_a = firstStep.variables[step.name]) !== null && _a !== void 0 ? _a : 1 }),
            };
        }
        case 'turns': {
            const firstStep = getFirstMove(step.steps[0], variables, playerIds);
            if (!firstStep) {
                return undefined;
            }
            return {
                step: firstStep.step,
                variables: Object.assign(Object.assign({}, firstStep.variables), { [step.name]: (_b = firstStep.variables[step.name]) !== null && _b !== void 0 ? _b : playerIds[0] }),
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
                case 'game':
                    throw new Error('TODO');
                case 'move':
                    if (step.id === stepId) {
                        current = step;
                    }
                    break;
                case 'rounds':
                case 'turns': {
                    const result = getTransition(step.steps, stepId, currentVariables, playerIds);
                    if (!result) {
                        break;
                    }
                    if (result.next) {
                        return result;
                    }
                    let next;
                    if (step.type === 'rounds') {
                        const round = currentVariables[step.name];
                        next = round < +step.amount ? round + 1 : undefined;
                    }
                    else {
                        const playerId = currentVariables[step.name];
                        const playerIndex = playerIds.indexOf(playerId);
                        next = playerIds[playerIndex + 1];
                    }
                    if (next) {
                        const firstStep = getFirstMove(step, Object.assign(Object.assign({}, result.variables), { [step.name]: next }), playerIds);
                        if (firstStep) {
                            return {
                                current: result.current,
                                next: firstStep.step,
                                variables: firstStep.variables,
                            };
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
    return text === null || text === void 0 ? void 0 : text.replace(/\(([^)]+)\)/, (substring, variableName) => {
        if (variableName in variables) {
            return `${variables[variableName]}`;
        }
        return substring;
    });
}
function startStep(gamePost, step, variables, io) {
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
        const newGame = Object.assign(Object.assign({}, game), { play: Object.assign(Object.assign({}, play), { status: 'started', step, moveId: movePost.id, variables: variables }) });
        yield updatePost(gamePost.id, { game: newGame });
        scheduleMoveTimeout(movePost.id, move, timeout, io);
        console.log('hu');
        io.in(gamePost.id).emit(EVENTS.incoming.updated, { game: newGame });
    });
}
function moveTimeout(id, move, io) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('move timeout!');
        const newMove = Object.assign(Object.assign({}, move), { status: 'ended' });
        yield updatePost(id, {
            move: newMove
        });
        if (move.gameId) {
            const gamePost = yield getPost(move.gameId);
            console.log(gamePost);
            nextStep(gamePost, io);
        }
    });
}
function nextStep(gamePost, io) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const game = gamePost.game;
        const play = game.play;
        if (play.status !== 'started') {
            return;
        }
        const transition = getTransition(game.steps, play.step.id, play.variables, play.playerIds);
        if (transition === null || transition === void 0 ? void 0 : transition.next) {
            yield startStep(gamePost, transition.next, transition.variables, io);
        }
        else {
            const newGame = Object.assign(Object.assign({}, game), { play: {
                    playerIds: play.playerIds,
                    status: 'ended',
                    variables: (_a = transition === null || transition === void 0 ? void 0 : transition.variables) !== null && _a !== void 0 ? _a : play.variables
                } });
            // await createChild({
            //     type: 'post',
            //     mediaTypes: '',
            //     text: 'Play ended!',
            // }, playPost)
            yield updatePost(gamePost.id, { game: newGame });
            io.in(gamePost.id).emit(EVENTS.incoming.updated, { game: newGame });
        }
    });
}
function scheduleMoveTimeout(id, move, timeout, io) {
    node_schedule_1.default.scheduleJob(timeout, () => __awaiter(this, void 0, void 0, function* () {
        const currentPost = yield getPost(id);
        if (!(0, lodash_1.isEqual)(currentPost.move, move)) {
            console.log(currentPost.move, move);
            // The state of the move has changed, this job is outdated.
            return;
        }
        moveTimeout(id, move, io);
    }));
}
const EVENTS = {
    outgoing: {
        update: 'gs:outgoing-update-game',
        start: 'gs:outgoing-start-game',
        stop: 'gs:outgoing-stop-game',
        skip: 'gs:outgoing-skip-move',
        pause: 'gs:outgoing-pause-move',
    },
    incoming: {
        updated: 'gs:incoming-updated-game'
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
                moveTimeout(post.id, move, io);
            }
            else {
                scheduleMoveTimeout(post.id, move, move.timeout, io);
            }
        }
    });
}
exports.initializeGameServerTasks = initializeGameServerTasks;
function registerGameServerEvents(socket, io) {
    return __awaiter(this, void 0, void 0, function* () {
        socket.on(EVENTS.outgoing.update, (_a) => __awaiter(this, [_a], void 0, function* ({ id, game }) {
            yield updatePost(id, {
                game
            });
            io.in(id).emit(EVENTS.incoming.updated, { game });
        }));
        socket.on(EVENTS.outgoing.start, (_b) => __awaiter(this, [_b], void 0, function* ({ id }) {
            const gamePost = yield Post.findOne({
                where: {
                    id
                }
            });
            const game = gamePost.game;
            const play = game.play;
            if (play.status === 'started') {
                return;
            }
            if (play.status === 'paused') {
                const newGame = Object.assign(Object.assign({}, game), { play: Object.assign(Object.assign({}, play), { status: 'started' }) });
                yield updatePost(id, {
                    game: newGame
                });
                const movePost = yield getPost(play.moveId);
                const move = movePost.move;
                if (move.status === 'paused') {
                    const now = +new Date();
                    const timeout = now + (0, parse_duration_1.default)(play.step.timeout) - move.elapsedTime;
                    const newMove = Object.assign(Object.assign({}, move), { status: 'started', elapsedTime: move.elapsedTime, startedAt: now, timeout });
                    yield updatePost(play.moveId, {
                        move: newMove
                    });
                    scheduleMoveTimeout(play.moveId, newMove, timeout, io);
                }
                io.in(id).emit(EVENTS.incoming.updated, { game: newGame });
            }
            else {
                const step = getFirstMove(game.steps[0], play.variables, play.playerIds);
                if (!step) {
                    throw new Error('No step.');
                }
                yield startStep(gamePost, step.step, step.variables, io);
            }
        }));
        socket.on(EVENTS.outgoing.skip, (_c) => __awaiter(this, [_c], void 0, function* ({ id }) {
            const post = yield getPost(id);
            const game = post.game;
            const play = game.play;
            if (play.status !== 'started') {
                return;
            }
            const transition = getTransition(game.steps, play.step.id, play.variables, play.playerIds);
            const newGame = Object.assign(Object.assign({}, game), { play: (transition === null || transition === void 0 ? void 0 : transition.next) ? Object.assign(Object.assign({}, play), { step: transition.next, variables: transition.variables }) : {
                    playerIds: play.playerIds,
                    status: 'ended',
                    variables: {}
                } });
            yield updatePost(id, {
                game: newGame
            });
            io.in(id).emit(EVENTS.incoming.updated, { game: newGame });
        }));
        socket.on(EVENTS.outgoing.pause, (_d) => __awaiter(this, [_d], void 0, function* ({ id }) {
            const post = yield getPost(id);
            const game = post.game;
            const play = game.play;
            if (play.status !== 'started') {
                return;
            }
            const newGame = Object.assign(Object.assign({}, game), { play: Object.assign(Object.assign({}, play), { status: 'paused' }) });
            yield updatePost(id, { game: newGame });
            const movePost = yield getPost(play.moveId);
            const move = movePost.move;
            if (move.status === 'started') {
                const now = +new Date();
                const newMove = Object.assign(Object.assign({}, move), { status: 'paused', elapsedTime: move.elapsedTime + now - move.startedAt, remainingTime: move.timeout - now });
                yield updatePost(play.moveId, {
                    move: newMove
                });
            }
            io.in(id).emit(EVENTS.incoming.updated, { game: newGame });
        }));
        socket.on(EVENTS.outgoing.stop, (_e) => __awaiter(this, [_e], void 0, function* ({ id }) {
            const post = yield getPost(id);
            const game = post.game;
            const play = game.play;
            if (play.status !== 'started' && play.status !== 'paused') {
                return;
            }
            const newGame = Object.assign(Object.assign({}, game), { play: Object.assign(Object.assign({}, play), { status: 'stopped' }) });
            yield updatePost(id, { game: newGame });
            const movePost = yield getPost(play.moveId);
            const move = movePost.move;
            if (move.status === 'started' || move.status === 'paused') {
                const newMove = Object.assign(Object.assign({}, move), { status: 'stopped' });
                yield updatePost(play.moveId, {
                    move: newMove
                });
            }
            io.in(id).emit(EVENTS.incoming.updated, { game: newGame });
        }));
    });
}
exports.registerGameServerEvents = registerGameServerEvents;
