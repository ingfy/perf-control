'use strict';

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const crawlr = require('crawlr');

app.get('/', function (req, res) {
	res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

app.use(express.static(path.relative(__dirname, '../client/build')));

const DUMMY = false;

function work(baseUrl, ignorePaths, ignoreQuery) {
	if (!DUMMY) {
		return crawlr(baseUrl, {
			ignorePaths: ignorePaths, 
			ignoreQuery: ignoreQuery
		});
	} else {
		let EventEmitter = require('events');
		
		let output = new EventEmitter();
		
		var i = 0;
		
		let interval = setInterval(() => {
			if (i > 10 && Math.random() > .90) {
				output.emit('end');
				clearInterval(interval);
			} else {
				output.emit('data', {
					url: `/URL #${++i}`,
					date: new Date(),
					remaining: 1000 - i,
					time: ~~(Math.random() * 1000),
					errorCode: Math.random() > .95 ? ~~(201 + Math.random() * 200) : null
				});
			}
		}, 500);
		
		return {stream: output, stop: () => clearInterval(interval)};
	}
}

io.on('connection', socket => {
	var worker;
		
	function info(text, data) {
		console.info(`[${socket.id}|${new Date().toISOString().slice(11, 11+12)}] ${text}`, data || '');
	}
	
	socket.on('start', data => {
		data = JSON.parse(data);
		worker = work(data.baseUrl, data.ignorePaths, data.ignoreQuery);
				
		worker.stream.on('data', data => {
			info('->', JSON.stringify(data));
			socket.emit('data', data)
		});
		
		worker.stream.on('end', () => {
			info('Ending');
			socket.emit('end');
		});
	});
	
	socket.on('disconnect', () => {
		info('Client disconnected.');
		
		if (worker) worker.stop();
	});
	
	socket.on('end', () => {
		info('Received end command');
		
		if (worker) worker.stop();
	});
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});