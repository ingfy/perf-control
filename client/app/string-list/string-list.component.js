var ko = require('knockout');

function StringListViewModel(params) {
	this.array = params.array;
	this.currentValue = ko.observable();
	this.id = params.id || 'stringList';
	this.addText = params.addText || '+';
	this.removeText = params.removeText || '-';
}

StringListViewModel.prototype.add = function () {
	this.array.push(this.currentValue());
	this.currentValue('');
};

StringListViewModel.prototype.remove = function (index) {
	this.array.remove(this.array()[index()]);
};

ko.components.register('string-list', {
	viewModel: StringListViewModel,
	template: require('./string-list.template.html')
});