'use strict';
'require view';
'require fs';
'require poll';

return view.extend({
	render: function() {
		var logTextarea = E('textarea', {
			'class': 'cbi-input-textarea',
			'style': 'width: 100%; font-family: monospace; min-height: 400px; resize: vertical;',
			'readonly': 'readonly',
			'wrap': 'off'
		}, _('Loading logs...'));

		var clearBtn = E('button', {
			'class': 'cbi-button cbi-button-reset',
			'style': 'margin-bottom: 10px;',
			'click': function() {
				fs.write('/tmp/frdmxtunnel.log', '').then(function() {
					logTextarea.value = _('Log cleared.');
				}).catch(function(err) {
					logTextarea.value = _('Failed to clear log: ') + (err.message || err);
				});
			}
		}, _('Clear Log'));

		poll.add(function() {
			return fs.read('/tmp/frdmxtunnel.log').then(function(log_content) {
				var lines = (log_content || '').split('\n');
				if (lines.length > 200) {
					lines = lines.slice(-200);
					fs.write('/tmp/frdmxtunnel.log', lines.join('\n')).catch(function() {});
				}
				var isAtBottom = (logTextarea.scrollHeight - logTextarea.scrollTop <= logTextarea.clientHeight + 50);
				logTextarea.value = lines.join('\n') || _('Log file is empty.');
				if (isAtBottom) {
					logTextarea.scrollTop = logTextarea.scrollHeight;
				}
			}).catch(function(err) {
				logTextarea.value = _('Unable to read log: ') + (err.message || err);
			});
		}, 3);

		return E('div', { 'class': 'cbi-map' }, [
			E('h', {}, _('')),
			E('div', { 'class': 'cbi-map-descr' }, _('<strong>Real time core engine outputs (auto-trimmed to last 200 lines)<strong>')),
			clearBtn,
			logTextarea
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
