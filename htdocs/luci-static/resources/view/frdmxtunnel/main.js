'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require poll';
'require ui';
'require network';

function fmtBytes(b) {
	if (!b || b <= 0) return '0 B';
	var u = ['B', 'KB', 'MB', 'GB', 'TB'];
	var i = Math.floor(Math.log(b) / Math.log(1024));
	return (b / Math.pow(1024, i)).toFixed(2) + ' ' + u[i];
}
function fmtSpeed(bps) {
	if (!bps || bps <= 0) return '0 bps';
	var bits = bps * 8;
	if (bits >= 1000000) return (bits / 1000000).toFixed(1) + ' Mbps';
	if (bits >= 1000) return (bits / 1000).toFixed(1) + ' Kbps';
	return Math.round(bits) + ' bps';
}

return view.extend({
	load: function() {
		return Promise.all([ L.resolveDefault(uci.load('frdmxtunnel'), {}), L.resolveDefault(network.getDevices(), []) ]);
	},
	render: function(data) {
		var m, s, o, lastRx = null, lastTx = null, lastTime = null;
		var rxHist = new Array(30).fill(0), txHist = new Array(30).fill(0);

		var style = E('style', {}, `
			.ft-wrap { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; }
			.ft-banner { background: linear-gradient(90deg, #0039a6 0%, #005bea 45%, #d63031 78%, #b71c1c 100%); color: #fff; border-radius: 10px; padding: 18px 22px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; box-shadow: 0 3px 10px rgba(0,0,0,0.08); }
			.ft-tabs { display: flex; gap: 6px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; flex-wrap: wrap; }
			.ft-tab { background: #ffffff; border: 1px solid #cbd5e1; color: #475569; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: all .15s; }
			.ft-tab.active { background: #0284c7; color: #ffffff; border-color: #0284c7; }
			.ft-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.03); }
			.ft-grid4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 14px; }
			.ft-stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
			.ft-acc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-top: 10px; }
			.ft-acc-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; cursor: pointer; transition: all .15s; }
			.ft-acc-card.active { border: 2px solid #0284c7; background: #f0f9ff; }
			.ft-log-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-family: monospace; font-size: 12px; color: #334155; white-space: pre-wrap; max-height: 150px; overflow-y: auto; }
		`);
		var elDot     = E('span', { 'style': 'display:inline-block; width:10px; height:10px; border-radius:50%; background:#94a3b8; margin-right:8px;' });
		var elState   = E('span', { 'style': 'font-weight:700; font-size:15px; color:#475569;' }, 'Checking...');
		var elSubInfo = E('div', { 'style': 'font-size:12px; color:#64748b; margin-top:2px;' }, 'Waiting for engine...');
		var elBigDown = E('span', { 'style': 'font-size:32px; font-weight:800; color:#0f172a;' }, '0.0 Mbps');
		var elSubUp   = E('div', { 'style': 'font-size:12px; color:#64748b; margin-top:2px;' }, 'upload 0 bps');
		var elValRx   = E('div', { 'style': 'font-size:18px; font-weight:700; color:#0f172a;' }, '0 B');
		var elValTx   = E('div', { 'style': 'font-size:18px; font-weight:700; color:#0f172a;' }, '0 B');
		var elValPing = E('div', { 'style': 'font-size:18px; font-weight:700; color:#0284c7;' }, '- ms');
		var elValIp   = E('div', { 'style': 'font-size:16px; font-weight:700; color:#0f172a;' }, '-');
		var elAccList = E('div', { 'class': 'ft-acc-grid' }, 'Loading accounts...');
				var elFullLog = E('textarea', { 'class': 'cbi-input-textarea', 'style': 'width:100%; font-family:monospace; min-height:380px; background:#f8fafc; color:#1e293b;', 'readonly': 'readonly' }, 'Loading...');

		var svgEl = E('div', { 'style': 'width:100%; max-width:320px; margin:6px auto 2px;' });
		svgEl.innerHTML = '<svg viewBox="0 0 280 160" style="width:100%; height:165px; display:block;">' +
			'<defs>' +
				'<linearGradient id="ftGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
					'<stop offset="0%" stop-color="#d63031"/>' +
					'<stop offset="50%" stop-color="#e17055"/>' +
					'<stop offset="100%" stop-color="#0984e3"/>' +
				'</linearGradient>' +
			'</defs>' +
			'<path d="M 35 135 A 105 105 0 0 1 245 135" fill="none" stroke="url(#ftGrad)" stroke-opacity="0.22" stroke-width="16" stroke-linecap="round"/>' +
			'<path id="ft-arc" d="M 35 135 A 105 105 0 0 1 245 135" fill="none" stroke="url(#ftGrad)" stroke-width="16" stroke-linecap="round" stroke-dasharray="329.9" stroke-dashoffset="329.9" style="transition:stroke-dashoffset 0.45s ease;"/>' +
			'<text x="16" y="140" font-size="10" font-weight="800" fill="#d63031">0</text>' +
			'<text x="20" y="96" font-size="10" font-weight="800" fill="#d63031">5</text>' +
			'<text x="41" y="57" font-size="10" font-weight="800" fill="#e17055">10</text>' +
			'<text x="80" y="28" font-size="10" font-weight="800" fill="#e17055">15</text>' +
			'<text x="133" y="18" font-size="10" font-weight="800" fill="#2980b9">20</text>' +
			'<text x="186" y="28" font-size="10" font-weight="800" fill="#0984e3">35</text>' +
			'<text x="225" y="57" font-size="10" font-weight="800" fill="#0984e3">50</text>' +
			'<text x="247" y="96" font-size="10" font-weight="800" fill="#0284c7">75</text>' +
			'<text x="251" y="140" font-size="10" font-weight="800" fill="#0284c7">100+</text>' +
			'<line id="ft-needle" x1="140" y1="135" x2="52" y2="135" stroke="#d63031" stroke-width="3.5" stroke-linecap="round" style="transform-origin:140px 135px; transition:transform 0.45s ease;"/>' +
			'<circle cx="140" cy="135" r="7.5" fill="#0984e3" stroke="#ffffff" stroke-width="2"/>' +
		'</svg>';

		function updateChart(rxBytesPerSec) {
			var mbps = ((rxBytesPerSec || 0) * 8) / 1000000;
			var marks = new Array(0, 5, 10, 15, 20, 35, 50, 75, 100);
			var ratio = 0;
			if (mbps >= 100) { ratio = 1; }
			else if (mbps > 0) {
				for (var i = 0; i < marks.length - 1; i++) {
					if (mbps <= marks[i + 1]) {
						var seg = (mbps - marks[i]) / (marks[i + 1] - marks[i]);
						ratio = (i + seg) / (marks.length - 1);
						break;
					}
				}
			}
			var arc = svgEl.querySelector('#ft-arc');
			var ndl = svgEl.querySelector('#ft-needle');
			if (arc) arc.setAttribute('stroke-dashoffset', (329.9 * (1 - ratio)).toFixed(1));
			if (ndl) ndl.style.transform = 'rotate(' + (ratio * 180).toFixed(1) + 'deg)';
		}

		function sendCtrl(act, arg, msg) {
			fs.exec('/usr/bin/frdmxtunnel_ctrl', arg ? [act, String(arg)] : [act]).then(function() {
				ui.addNotification(null, E('p', _('Frdmx Tunnel: ') + msg), 'info');
			});
		}

		var dashView = E('div', {}, [
			E('div', { 'class': 'ft-card', 'style': 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;' }, [
				E('div', {}, [
					E('div', {}, [ elDot, elState ]),
					elSubInfo
				]),
				E('div', { 'style': 'display:flex; gap:6px;' }, [
					E('button', { 'class': 'cbi-button cbi-button-action', 'click': function(e) { e.preventDefault(); sendCtrl('restart', null, 'Restarting service...'); } }, _('Restart')),
					E('button', { 'class': 'cbi-button cbi-button-reset', 'click': function(e) { e.preventDefault(); sendCtrl('stop', null, 'Stopping service...'); } }, _('Stop'))
				])
			]),
			E('div', { 'class': 'ft-card' }, [
				E('div', { 'style': 'font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:4px;' }, _('Live Speed & Status')),
				E('div', {}, [ elBigDown, E('span', { 'style': 'font-size:13px; color:#64748b; margin-left:6px;' }, 'download') ]),
				elSubUp,
				E('div', { 'class': 'ft-grid4' }, [
					E('div', { 'class': 'ft-stat-box' }, [ E('small', { 'style': 'color:#64748b;' }, 'Downloaded'), elValRx ]),
					E('div', { 'class': 'ft-stat-box' }, [ E('small', { 'style': 'color:#64748b;' }, 'Uploaded'), elValTx ]),
					E('div', { 'class': 'ft-stat-box' }, [ E('small', { 'style': 'color:#64748b;' }, 'Ping'), elValPing ]),
					E('div', { 'class': 'ft-stat-box' }, [ E('small', { 'style': 'color:#64748b;' }, 'Public IP'), elValIp ])
				])
			]),
			E('div', { 'class': 'ft-card', 'style': 'text-align:center;' }, [
				E('strong', { 'style': 'font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;' }, _('Speed Meter (Mbps)')),
				svgEl
			]),
			E('div', { 'class': 'ft-card' }, [
				E('div', { 'style': 'display:flex; justify-content:space-between; align-items:center;' }, [
					E('strong', { 'style': 'font-size:14px;' }, _('Accounts (Pilih kolom untuk berpindah akun / bug)')),
					E('small', { 'style': 'color:#64748b;' }, _('Auto-Fallback Enabled'))
				]),
				elAccList
			])
		]);
		var logView = E('div', { 'class': 'ft-card', 'style': 'display:none;' }, [
			E('div', { 'style': 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;' }, [
				E('strong', {}, _('Full Connection Logs')),
				E('button', { 'class': 'cbi-button cbi-button-reset', 'click': function(e) { e.preventDefault(); sendCtrl('clearlog', null, 'Log cleared'); elFullLog.value = ''; } }, _('Clear Log'))
			]),
			elFullLog
		]);

		setTimeout(function() {
			poll.add(function() {
				return fs.exec('/usr/bin/frdmxtunnel_stat').then(function(res) {
					if (res.code === 0 && res.stdout) {
						var st = JSON.parse(res.stdout.trim());
						var now = Date.now();
						elValIp.textContent = st.ip || '-';
						elSubInfo.textContent = (st.proto || '-') + ' · ' + (st.host || '-');

						if (st.status === 'CONNECTED') {
							elDot.style.background = '#16a34a';
							elState.textContent = 'Connected · ' + (st.host || '');
							elState.style.color = '#16a34a';
							elValPing.textContent = st.ping + ' ms';
							elValPing.style.color = st.ping < 300 ? '#16a34a' : (st.ping < 700 ? '#d97706' : '#dc2626');
						} else {
							elDot.style.background = '#dc2626';
							elState.textContent = 'Disconnected';
							elState.style.color = '#dc2626';
							elValPing.textContent = 'Timeout';
							elValPing.style.color = '#dc2626';
						}

						var rxSpd = 0, txSpd = 0;
						if (lastRx !== null && lastTime !== null) {
							var dt = (now - lastTime) / 1000;
							if (dt > 0) {
								rxSpd = Math.max(0, st.rx - lastRx) / dt;
								txSpd = Math.max(0, st.tx - lastTx) / dt;
							}
						}
						lastRx = st.rx; lastTx = st.tx; lastTime = now;
						elBigDown.textContent = fmtSpeed(rxSpd);
						elSubUp.textContent = 'upload ' + fmtSpeed(txSpd) + ' · ' + (st.proto || '');
						elValRx.textContent = fmtBytes(st.rx);
						elValTx.textContent = fmtBytes(st.tx);

						rxHist.push(rxSpd); rxHist.shift();
						txHist.push(txSpd); txHist.shift();
						updateChart(rxSpd);

						if (st.profiles && st.profiles.length > 0) {
							elAccList.innerHTML = '';
							st.profiles.forEach(function(p) {
								var isAct = (p.idx === st.active_idx);
								elAccList.appendChild(E('div', {
									'class': 'ft-acc-card' + (isAct ? ' active' : ''),
									'click': function() { if (!isAct) sendCtrl('switch', p.idx, 'Switching to #' + p.idx + ' (' + p.server + ')'); }
								}, [
									E('div', { 'style': 'font-weight:700; font-size:14px; color:#0f172a;' }, '#' + p.idx + ' · ' + p.server),
									E('div', { 'style': 'font-size:12px; color:#64748b; margin-top:2px;' }, p.proto),
									E('div', { 'style': 'font-size:11px; font-weight:600; margin-top:6px; color:' + (isAct ? '#16a34a' : '#64748b') + ';' }, isAct ? '● Active Tunnel' : '○ Standby (Fallback)')
								]));
							});
						} else {
							elAccList.textContent = 'No accounts configured. Open "Accounts & Settings" tab to add.';
						}

					}
				}).catch(function() {});
			}, 1);
		}, 500);

		m = new form.Map('frdmxtunnel', '', '');
		s = m.section(form.NamedSection, 'main', 'global', _('Global Settings'));
		s.anonymous = true;
		o = s.option(form.Flag, 'enabled', _('Enable Service'));
		o.rmempty = false;
		o = s.option(form.Value, 'dns_server', _('Primary DNS Server'));
		o.default = '1.1.1.1';

		o = s.option(form.Flag, 'block_ads', _('Block Ads & Trackers'), _('Memblokir iklan aplikasi dan situs secara otomatis.'));
		o.default = '0';

		o = s.option(form.Flag, 'block_porn', _('Block Adult / 18+ Sites'), _('Memblokir akses situs dewasa (18+) di seluruh jaringan Wi-Fi.'));
		o.default = '0';

		o = s.option(form.Flag, 'direct_bank', _('Direct M-Banking & Indonesia (.id)'), _('Mengarahkan M-Banking (BCA, BRI, Mandiri, BNI, E-Wallet) langsung lewat modem agar tidak terblokir.'));
		o.default = '0';

		o = s.option(form.ListValue, 'route_game', _('Game Online Traffic'));
		o.value('proxy', _('Via Tunnel (Proxy)'));
		o.value('direct', _('Direct Modem (Low Ping)'));
		o.default = 'proxy';

		o = s.option(form.ListValue, 'route_stream', _('Streaming (YouTube / Netflix / TikTok)'));
		o.value('proxy', _('Via Tunnel (Proxy)'));
		o.value('direct', _('Direct Modem'));
		o.default = 'proxy';

		o = s.option(form.ListValue, 'route_conf', _('Video Conference (Zoom / Meet / Teams)'));
		o.value('proxy', _('Via Tunnel (Proxy)'));
		o.value('direct', _('Direct Modem (Stabil)'));
		o.default = 'proxy';

		o = s.option(form.TextValue, 'custom_rules', _('Custom Rules (Nikki / OpenClash / Xray)'), _('Opsional: Tempel baris rules dari config.yaml (contoh: DOMAIN-SUFFIX,bankcapital.co.id,DIRECT). Satu baris per aturan.'));
		o.rows = 5;

		s = m.section(form.TypedSection, 'profile', _('Accounts & Tunnel Configurations'));
		s.anonymous = true;
		s.addremove = true;

		o = s.option(form.ListValue, 'proto', _('Protocol'));
		o.value('ssh', 'SSH Tunnel');
		o.value('vless', 'VLESS (Xray)');
		o.value('vmess', 'VMess (Xray)');
		o.value('trojan', 'Trojan (Xray)');
		o.value('zivpn', 'ZiVPN (UDP)');
		o.value('ovpn', 'OpenVPN');
		o.default = 'vless';

		o = s.option(form.ListValue, 'mode', _('Connection Mode'));
		o.value('direct', 'Direct');
		o.value('payload', 'HTTP Payload Injector (HTTP WS)');
		o.value('ssl', 'SSL/TLS (SNI)');
		o.value('ssl_payload', 'SSL + Payload (Enhanced / WSS)');
		o.value('slowdns', 'SlowDNS (DNSTT / QSSH)');
		o.default = 'payload';
		o.depends('proto', 'ssh');

		o = s.option(form.ListValue, 'xray_mode', _('Connection Mode'));
		o.value('ws_tls', 'WebSocket + TLS (Port 443 / CDN / SNI)');
		o.value('ws_none', 'WebSocket Non-TLS (Port 80 / HTTP)');
		o.value('tcp_tls', 'TCP + TLS (Direct SNI)');
                o.value('slowdns', 'SlowDNS (DNSTT / QSSH)');
		o.default = 'ws_tls';
		o.depends('proto', 'vless'); o.depends('proto', 'vmess'); o.depends('proto', 'trojan');

		o = s.option(form.Value, 'server', _('Server Host / IP'));
		o.rmempty = false; o.datatype = 'host';

		o = s.option(form.Value, 'wan_if', _('WAN Interface (Multi-Modem)'), _('Pilih Auto, interface terdeteksi aktif, atau ketik manual nama interface (misal: usb0, wwan0).'));
                o.value('', _('Auto (Default / mwan3)'));
                (data[1] || []).forEach(function(dev) {
                        var name = dev.getName();
                        if (dev.isUp() && !/^(lo|br-|ifb|sit|gre|ip6|docker|veth|wlan)/.test(name)) {
                                o.value(name, name + ' (Terhubung)');
                        }
                });
                o.placeholder = 'Auto (kosong) atau ketik manual...';
                o.default = '';
o = s.option(form.Value, 'port', _('Port'));
		o.default = '443';
		o.depends('proto', 'ssh'); o.depends('proto', 'vless'); o.depends('proto', 'vmess'); o.depends('proto', 'trojan'); o.depends('proto', 'ovpn');

		o = s.option(form.Value, 'port_range', _('UDP Port Range'));
		o.default = '6000-19999';
		o.depends('proto', 'zivpn');

		o = s.option(form.Value, 'username', _('Username'));
		o.depends('proto', 'ssh'); o.depends('proto', 'ovpn');

		o = s.option(form.Value, 'password', _('Password / UUID / Auth'));
		o.password = true;

                o = s.option(form.Value, 'ssh_user', _('SlowDNS SSH Username'));
                o.depends({ proto: 'vless', xray_mode: 'slowdns' });
                o.depends({ proto: 'vmess', xray_mode: 'slowdns' });
                o.depends({ proto: 'trojan', xray_mode: 'slowdns' });

                o = s.option(form.Value, 'ssh_pass', _('SlowDNS SSH Password'));
                o.password = true;
                o.depends({ proto: 'vless', xray_mode: 'slowdns' });
                o.depends({ proto: 'vmess', xray_mode: 'slowdns' });
                o.depends({ proto: 'trojan', xray_mode: 'slowdns' });

		o = s.option(form.Value, 'ns_domain', _('Nameserver (NS Domain)'));
		o.depends({ proto: 'ssh', mode: 'slowdns' });
                o.depends({ proto: 'vless', xray_mode: 'slowdns' });
                o.depends({ proto: 'vmess', xray_mode: 'slowdns' });
                o.depends({ proto: 'trojan', xray_mode: 'slowdns' });

		o = s.option(form.Value, 'pubkey', _('SlowDNS Public Key'));
		o.depends({ proto: 'ssh', mode: 'slowdns' });
                o.depends({ proto: 'vless', xray_mode: 'slowdns' });
                o.depends({ proto: 'vmess', xray_mode: 'slowdns' });
                o.depends({ proto: 'trojan', xray_mode: 'slowdns' });

		o = s.option(form.Value, 'dns_resolver', _('DNS Resolver'));
		o.default = '1.1.1.1:53';
		o.depends({ proto: 'ssh', mode: 'slowdns' });
                o.depends({ proto: 'vless', xray_mode: 'slowdns' });
                o.depends({ proto: 'vmess', xray_mode: 'slowdns' });
                o.depends({ proto: 'trojan', xray_mode: 'slowdns' });
		o.depends('proto', 'zivpn');

		o = s.option(form.Value, 'obfs', _('ZiVPN Obfs Key'));
		o.default = 'hu``hqb`c';
		o.depends('proto', 'zivpn');

		o = s.option(form.Value, 'payload', _('Payload'));
                o.placeholder = 'WS: GET / HTTP/1.1[crlf]Host: [host][crlf]Upgrade: websocket[crlf][crlf]  |  HTTP: CONNECT [host_port] HTTP/1.1[crlf]Host: [sni][crlf][crlf]';
		o.depends({ proto: 'ssh', mode: 'payload' });
		o.depends({ proto: 'ssh', mode: 'ssl_payload' });

		o = s.option(form.Value, 'sni', _('SNI / Server Name'));
                o.placeholder = 'Contoh: ://tiktokv.com';
		o.depends({ proto: 'ssh', mode: 'ssl' }); o.depends({ proto: 'ssh', mode: 'ssl_payload' });
		o.depends({ proto: 'vless', xray_mode: 'ws_tls' }); o.depends({ proto: 'vless', xray_mode: 'tcp_tls' });
		o.depends({ proto: 'vmess', xray_mode: 'ws_tls' }); o.depends({ proto: 'vmess', xray_mode: 'tcp_tls' });
		o.depends({ proto: 'trojan', xray_mode: 'ws_tls' }); o.depends({ proto: 'trojan', xray_mode: 'tcp_tls' });

		o = s.option(form.Value, 'ws_host', _('WebSocket Host'));
                o.placeholder = 'Contoh: server-anda.myssh.web.id';
		o.depends({ proto: 'vless', xray_mode: 'ws_tls' }); o.depends({ proto: 'vless', xray_mode: 'ws_none' });
		o.depends({ proto: 'vmess', xray_mode: 'ws_tls' }); o.depends({ proto: 'vmess', xray_mode: 'ws_none' });
		o.depends({ proto: 'trojan', xray_mode: 'ws_tls' }); o.depends({ proto: 'trojan', xray_mode: 'ws_none' });

		o = s.option(form.Flag, 'mux', _('Enable Mux (Concurrency 8)'), _('ON : Tuneup koneksi agar anti putus-sambung (anti-reset DPI) & ringan di CPU. OFF : Untuk speedtest / download besar maksimal.'));
                o.default = '1';
                o.rmempty = false;
                o.depends('proto', 'vless'); o.depends('proto', 'vmess'); o.depends('proto', 'trojan');

                o = s.option(form.Value, 'path', _('WebSocket Path'));
                o.placeholder = 'Contoh: / atau /vless';
		o.default = '/';
		o.depends({ proto: 'vless', xray_mode: 'ws_tls' }); o.depends({ proto: 'vless', xray_mode: 'ws_none' });
		o.depends({ proto: 'vmess', xray_mode: 'ws_tls' }); o.depends({ proto: 'vmess', xray_mode: 'ws_none' });
		o.depends({ proto: 'trojan', xray_mode: 'ws_tls' }); o.depends({ proto: 'trojan', xray_mode: 'ws_none' });

		return m.render().then(function(mapEl) {
			var accView = E('div', { 'class': 'ft-card', 'style': 'display:none;' }, [mapEl]);
			var tDash = E('button', { 'class': 'ft-tab active' }, _('Dashboard'));
			var tAcc  = E('button', { 'class': 'ft-tab' }, _('Accounts & Settings'));
			var tLog  = E('button', { 'class': 'ft-tab' }, _('Logs'));

			function setTab(t) {
				[tDash, tAcc, tLog].forEach(function(b) { b.classList.remove('active'); });
				t.classList.add('active');
				dashView.style.display = (t === tDash) ? 'block' : 'none';
				accView.style.display  = (t === tAcc) ? 'block' : 'none';
				logView.style.display  = (t === tLog) ? 'block' : 'none';
				if (t === tLog) {
					fs.read('/tmp/frdmxtunnel.log').then(function(c) { elFullLog.value = c || 'Log empty.'; }).catch(function() {});
				}
			}
			tDash.onclick = function(e) { e.preventDefault(); setTab(tDash); };
			tAcc.onclick  = function(e) { e.preventDefault(); setTab(tAcc); };
			tLog.onclick  = function(e) { e.preventDefault(); setTab(tLog); };

			var banner = E('div', { 'class': 'ft-banner' }, [
				E('div', {}, [
					E('div', { 'style': 'font-size:24px; font-weight:900; letter-spacing:0.5px; color:#fde047; text-shadow: 0 1px 2px rgba(0,0,0,0.45), 0 0 10px rgba(253,224,71,0.65);' }, 'FRDMX Tunneling'),
					E('div', { 'style': 'font-size:13px; font-weight:600; color:#ccff00; margin-top:3px; text-shadow: 0 1px 2px rgba(0,0,0,0.35);' }, 'Make Your Simple Inject Tunneling for Impressive Connection')
				])
			]);

			return E('div', { 'class': 'ft-wrap' }, [
				style,
				banner,
				E('div', { 'class': 'ft-tabs' }, [tDash, tAcc, tLog]),
				dashView,
				accView,
				logView
			]);
		});
	}
});
