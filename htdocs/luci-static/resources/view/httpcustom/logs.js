'use strict';
'use ui';

var fs = require('fs');
var view = require('view');
var poll = require('poll');

return view.extend({
	render: function() {
		var logTextarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width: 100%; font-family: monospace; min-height: 400px; resize: vertical;',
			'readonly': 'readonly',
			'wrap': 'off'
		}, _('Loading logs...'));

		poll.add(function() {
			return L.resolveDefault(fs.read('/var/log/httpcustom.log'), _('No connection log found. Start the service first.'))
				.then(function(log_content) {
					var isAtBottom = (logTextarea.scrollHeight - logTextarea.scrollTop <= logTextarea.clientHeight + 50);
					logTextarea.value = log_content || _('Log file is empty.');
					if (isAtBottom) {
						logTextarea.scrollTop = logTextarea.scrollHeight;
					}
				});
		}, 3);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('HTTP Custom Connection Logs')),
			E('div', { 'class': 'cbi-map-descr' }, _('Real-time core engine outputs and injection status. Auto-refreshing.')),
			logTextarea
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
