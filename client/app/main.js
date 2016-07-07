var ko = require('knockout');
var io = require('socket.io-client');
var chart = require('chart.js');

require('./string-list/string-list.component');

ko.bindingHandlers.timestamp = {
	update: function (element, valueAccessor) {
		element.innerText = new Date(ko.unwrap(valueAccessor())).toTimeString().slice(0, 8);
	}
};

ko.bindingHandlers.seconds = {
	update: function (element, valueAccessor) {
		element.innerText = (ko.unwrap(valueAccessor()) / 1000).toFixed(4);
	}
};

ko.bindingHandlers.relativeLink = {
	update: function (element, valueAccessor) {
		var data = ko.unwrap(valueAccessor());
		element.innerHTML = '<a href="' + data.base + data.path + '" target="_blank">' + data.path + '</a>';
	}
};

ko.bindingHandlers.chart = {
	init: function (element, valueAccessor, allBindingsAccessor) {
		var data = ko.unwrap(valueAccessor());

		element.chartController = new Chart(element, {
			type: 'line',
			data: data,
			options: {
				responsive : true,
				maintainAspectRatio: false
			}
		});

		var allBindings = allBindingsAccessor();
		if (allBindings.resizeOn && allBindings.resizeOn.subscribe) {
			allBindings.resizeOn.subscribe(function () {
				element.chartController.resize();
			});
		}
	},
	update: function (element, valueAccessor) {
		var data = ko.unwrap(valueAccessor());
		var chart = element.chartController;
		if (chart) {
			chart.config.data.labels = data.labels;

			for (var i = 0; i < chart.data.datasets.length; i++) {
				chart.data.datasets[i].data = data.datasets[i].data;
			}

			chart.update();
		}
	}
};

function Stats(values) {
	this.total = values.reduce(function (sum, value) { return sum + value; }, 0);
	this.mean = this.total / values.length;
	var sorted = values.slice(0).sort();
	this.median = values.length % 2 === 0 ? 
		values[values.length / 2] : 
		(values[(values.length - 1) / 2] + values[(values.length + 1) / 2]) / 2;
	this.max = values.length ? Math.max.apply(Math, values) : 0;
}

function AppViewModel() {
	var storedSettings = localStorage["settings"];
	storedSettings = storedSettings ? JSON.parse(storedSettings) : {crawling: {}, run: {}};

	this.baseUrl = ko.observable(storedSettings.crawling.baseUrl);
	this.ignorePaths = ko.observableArray(storedSettings.crawling.ignorePaths);
	this.ignoreQuery = ko.observable(storedSettings.crawling.ignoreQuery !== undefined ? storedSettings.crawling.ignoreQuery : true);
	this.runForever = ko.observable(storedSettings.run.runForever || false);
	this.numRuns = ko.observable(storedSettings.run.numRuns !== undefined ? storedSettings.run.numRuns : 1);
	this.numRunsStored = ko.observable(storedSettings.run.numRunsStored || 20);
	this.graphsFullscreen = ko.observable(false);
	this.state = ko.observable();

	this.running = ko.observable(false);
	this.socket = io();

	this.data = ko.observableArray();

	this.run = ko.observable(-1);

	var vm = this;

	this.settings = ko.pureComputed(function () {
		return {
			crawling: {
				baseUrl: vm.baseUrl(),
				ignorePaths: vm.ignorePaths(),
				ignoreQuery: vm.ignoreQuery()
			},
			run: {
				numRuns: vm.numRuns(),
				runForever: vm.runForever(),
				numRunsStored: vm.numRunsStored()
			}
		};
	});

	this.settings.subscribe(function (settings) {
		localStorage["settings"] = JSON.stringify(settings);
	});

	this.hasRun = ko.pureComputed(function () {
		return vm.run() > -1;
	});

	this.activeData = ko.pureComputed(function () {
		return vm.data()[vm.data().length - 1];
	});

	this.activeNumVisited = ko.pureComputed(function () {
		var active = vm.activeData();

		return active && active().length || 0;
	});

	this.activeRemaining = ko.pureComputed(function () {
		var active = vm.activeData();

		if (!active) return null;

		var last = active()[active().length - 1];

		if (!last) return null;

		return last.remaining;
	});

	this.stats = ko.pureComputed(function () {
		var data = vm.data();

		var startRun = vm.run() - data.length + 1;

		return ko.utils.arrayMap(data, function (data, i) {
			var rows = data();
			var times = ko.utils.arrayMap(rows, function (row) { return row.time; });
			var stats = new Stats(times);
			return {
				runIndex: startRun + i,
				numPages: rows.length,
				mean: stats.mean,
				median: stats.median || 0,
				total: stats.total,
				max: stats.max
			};
		});
	});

	this.graphs = [
		{
			title: 'Load Times (ms)',
			data: ko.pureComputed(function () {
				var stats = vm.stats();

				function pluck(propName) {
					return ko.utils.arrayMap(stats, function (stat) { return stat[propName]; });
				}

				var startRun = vm.run() - stats.length + 1;

				return {
					labels: ko.utils.arrayMap(stats, function (stat, i) { return 'Run ' + (1 + startRun + i); }),
					datasets: [
						{
							label: 'Average (mean)', 
							fill: false,
							borderColor: 'tomato',
							backgroundColor: 'tomato',
							data: pluck('mean')
						},
						{
							label: 'Median', 
							fill: false,
							borderColor: 'teal',
							backgroundColor: 'teal',
							data: pluck('median')
						}, 
						{
							label: 'Highest', 
							fill: false,
							borderColor: 'seagreen',
							backgroundColor: 'seagreen',
							data: pluck('max')
						}
					]
				};
			})
		}
	];

	this.chartAreaChanged = ko.pureComputed(function () {
		vm.graphsFullscreen();
		vm.data();
	});

	this.timesByPage = ko.pureComputed(function () {
		var data = vm.data();

		var pages = {};

		ko.utils.arrayForEach(data, function (run) {
			ko.utils.arrayForEach(run(), function (result) {
				if (!pages[result.url]) pages[result.url] = [];

				pages[result.url].push(result.time);
			});
		});

		return pages;
	});

	this.highlights = {
		slowestPages: ko.pureComputed(function () {
			var timesByPage = vm.timesByPage();

			var array = [];

			ko.utils.objectForEach(timesByPage, function (key, times) {
				array.push({times: times, url: key});
			});

			array = ko.utils.arrayMap(array, function (page) {
				var stats = new Stats(page.times);

				return {
					url: page.url,
					mean: stats.mean,
					max: stats.max
				};
			});

			array.sort(function (a, b) {
				return b.mean - a.mean;
			});

			return array.slice(0, 5);
		}),
		loadErrors: ko.pureComputed(function () {
			return Array.prototype.concat.apply([], ko.utils.arrayMap(vm.data(), function (run, i) {
				return ko.utils.arrayMap(ko.utils.arrayFilter(run(), function (result) {
					return result.errorCode;
				}), function (result) {
					result.run = i;
					return result;
				});
			}));
		})
	};

	this.socket.on('data', function(data) {
		if (!vm.running()) return;
		
		vm.pushData(data);
	});

	this.socket.on('end', function (data) {
		vm.state('Ended');
		
		if (!vm.running()) return;

		vm.running(false);
		if (vm.runForever()) vm.start();
		else {
			if (vm.numRuns() > 0) vm.numRuns(vm.numRuns() - 1);
			if (vm.numRuns() > 0) {				
				vm.start();
			} else {
				vm.numRuns(1);
			}
		}
	});

	this.socket.on('disconnect', function () {
		vm.running(false);
		vm.state('Disconnected');
	});
}

AppViewModel.prototype.nextRun = function () {
	this.run(this.run() + 1);
	
	while (this.data().length && this.data().length >= this.numRunsStored()) this.data.shift();

	this.data.push(ko.observableArray());
};

AppViewModel.prototype.pushData = function (data) {
	this.data()[this.data().length - 1].push(data);
};

AppViewModel.prototype.start = function () {
	this.nextRun();
	this.running(true);
	this.state('Running')
	this.socket.emit('start', JSON.stringify({
		baseUrl: this.baseUrl(),
		ignorePaths: this.ignorePaths(),
		ignoreQuery: this.ignoreQuery()
	}));
};

AppViewModel.prototype.stop = function () {
	this.running(false);
	this.socket.emit('end');
};

AppViewModel.prototype.clearData = function () {
	this.data([]);
	this.run(-1);
};

AppViewModel.prototype.toggleGraphsFullscreen = function () {
	this.graphsFullscreen(!this.graphsFullscreen());
};

window.app = {
	init: function () {
		ko.applyBindings(new AppViewModel(), document.body);
	}
};