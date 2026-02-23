const express = require('express');
const async = require('async');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');

const app = express();
const server = http.Server(app);

// IMPORTANT: socket.io must match what the frontend loads → /socket.io
const io = require('socket.io')(server, { path: '/socket.io' });

const port = process.env.PORT || 80;

// Namespaces
const rootNamespace = io.of('/');
const resultNamespace = io.of('/result');

// Root namespace
rootNamespace.on('connection', socket => {
  console.log("Connected on root namespace");
  socket.emit('message', { text: 'Welcome from root!' });

  socket.on('subscribe', data => socket.join(data.channel));
});

// /result namespace
resultNamespace.on('connection', socket => {
  console.log("Connected on /result namespace");
  socket.emit('message', { text: 'Welcome from result!' });

  socket.on('subscribe', data => socket.join(data.channel));
});

// PostgreSQL connection
const pgHost = process.env.PG_HOST || 'db';
const pgPort = process.env.PG_PORT || 5432;
const pgUser = process.env.PG_USER || 'postgres';
const pgPassword = process.env.PG_PASSWORD || 'postgres';
const pgDatabase = process.env.PG_DATABASE || 'postgres';

const connectionString = `postgresql://${pgUser}:${pgPassword}@${pgHost}:${pgPort}/${pgDatabase}`;
console.log(connectionString);

const pool = new Pool({ connectionString });

async.retry(
  { times: 1000, interval: 1000 },
  callback => {
    pool.connect((err, client) => {
      if (err) console.error("Waiting for db");
      callback(err, client);
    });
  },
  (err, client) => {
    if (err) return console.error("Giving up");
    console.log("Connected to db");
    getVotes(client);
  }
);

function getVotes(client) {
  client.query('SELECT vote, COUNT(id) AS count FROM votes GROUP BY vote', [], (err, result) => {
    if (err) {
      console.error("Error performing query: " + err);
    } else {
      const votes = collectVotesFromResult(result);

      rootNamespace.emit("scores", JSON.stringify(votes));
      resultNamespace.emit("scores", JSON.stringify(votes));
    }

    setTimeout(() => getVotes(client), 1000);
  });
}

function collectVotesFromResult(result) {
  const votes = { a: 0, b: 0 };
  result.rows.forEach(row => {
    votes[row.vote] = parseInt(row.count);
  });
  return votes;
}

// Middleware
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Serve static AngularJS frontend from /views
app.use(express.static(path.join(__dirname, 'views')));

// Serve index.html for both "/" and "/result"
app.get(['/', '/result'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'views', 'index.html'));
});

// Start server
server.listen(port, () => {
  console.log('App running on port ' + port);
});

