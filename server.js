'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

var socketio = require('socket.io'),
    util = require('util'),
    duration = require('duration'),
    colors = require('colors'), // jshint ignore:line
    winston = require('winston'),
    sockets = {};

var pg = require('pg');
var conString = "postgres://meric426@127.0.0.1/hemnet_dev";

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

winston.log('info', 'server listening on port', 4000);

io.on('connection', function(socket) {
    winston.log('info', 'client connected'.green, socket.id);

    sockets[socket.id] = socket;

    socket.on('disconnect', function() {
        delete sockets[socket.id];

        var dur = duration(new Date(socket.handshake.time), new Date()),
            session_length_str = util.format('(session length: %s)', dur.toString(1, 1));

        winston.log('info', 'client disconnected'.red, socket.id, session_length_str);
    });
});

var broadcast = function(event, data) {
  for (var id in sockets) {
    sockets[id].emit(event, data);
  }
};

var amqp = require('amqp');
var msgpack = require('msgpack');

var searches_connection = amqp.createConnection({ host: '127.0.0.1', port: 5673 });

searches_connection.on('error', function(e) {
  console.log('Error from amqp: ', e);
});

var center_sql = "ST_Transform(ST_SetSRID(ST_PointOnSurface(lg.the_geom),3006),4326)"

searches_connection.on('ready', function() {
  searches_connection.queue('realtime-viz', {
    durable: true,
    autoDelete: false,
    arguments: {
      'x-message-ttl': 10000
    }
  }, function(q) {
    q.bind('#');
    q.subscribe(function(message) {
      var msg = msgpack.unpack(message.data);
      var search = msg.search;

      if (search.location_ids) {
        var ids = search.location_ids;

        pg.connect(conString, function(err, client, done) {
          if (err) {
            return console.error('error fetching client from pool', err);
          }

          client.query('SELECT ST_Y('+ center_sql +') AS lat, ST_X('+ center_sql +') AS lng FROM locations l JOIN location_geometries lg ON lg.location_id = l.id WHERE l.id IN ('+ ids.join(',') +')', function(err, result) {
            done();

            if (err) {
              return console.error('error running query', err);
            }

            for (var i in result.rows) {
              var coord = result.rows[i];
              if (coord.lat && coord.lng) {
                broadcast('coords', {
                  type: msg.event_name,
                  lat: coord.lat,
                  lng: coord.lng
                });
              }
            }
          });
        });
      }
    });
  });
});

var tally_connection = amqp.createConnection({ host: '127.0.0.1', port: 5674 });

tally_connection.on('error', function(e) {
  console.log('Error from amqp: ', e);
});

tally_connection.on('ready', function() {
  tally_connection.queue('tally_queue_dup_ttl', {
    durable: true,
    autoDelete: false,
    arguments: {
      'x-message-ttl': 5000
    }
  }, function(q) {
    q.bind('#');
    q.subscribe(function(message) {
      var tally = JSON.parse(message.data).key;

      if (tally.tallied_type != "Objekt"){ return }


      pg.connect(conString, function(err, client, done) {
        if (err) {
          return console.error('error fetching client from pool', err);
        }

        client.query('SELECT ST_Y(ST_Transform(ST_SetSRID(ST_Point(xkoordinat, ykoordinat),3006),4326)) AS lat, ST_X(ST_Transform(ST_SetSRID(ST_Point(xkoordinat, ykoordinat),3006),4326)) AS lng FROM objekts WHERE id = '+ tally.tallied_id, function(err, result) {
          done();

          if (err) {
            return console.error('error running query', err);
          }

          if (result.rows.length) {
            var row = result.rows[0];

            if (row.lat && row.lng) {
              broadcast('coords', {
                type: 'objekt',
                lat: row.lat,
                lng: row.lng
              })
            }
          }
        });
      });
    });
  });
});
