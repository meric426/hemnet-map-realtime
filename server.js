'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var socketio = require('socket.io'),
    adapter = require('socket.io-redis'),
    util = require('util'),
    duration = require('duration'),
    colors = require('colors'), // jshint ignore:line
    winston = require('winston');

/**
 * Winston (for logging)
 */
var winston = new(winston.Logger)({
    transports: [
        new(winston.transports.Console)({
            timestamp: true
        })
    ]
});

var io = socketio(4000);
io.adapter(adapter({ host: '127.0.0.1', port: 6379 }));

winston.log('info', 'server listening on port', 4000);

io.on('connection', function(socket) {
    winston.log('info', 'client connected'.green, socket.id);

    socket.on('disconnect', function() {
        var dur = duration(new Date(socket.handshake.time), new Date()),
            session_length_str = util.format('(session length: %s)', dur.toString(1, 1));

        winston.log('info', 'client disconnected'.red, socket.id, session_length_str);
    });
});
