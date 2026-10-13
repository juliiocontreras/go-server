import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRemotePort,
  normalizeTunnelName,
  cloudflareQuickArgs,
  tailscaleServeArgs,
  extractTryCloudflareUrl,
  extractTailscaleHttpsUrl,
  cloudflareHostnameGuide,
  validateShareUrl
} from '../src/remote.js';

test('validateRemotePort accepts user ports and rejects unsafe values', () => {
  assert.equal(validateRemotePort(3100), 3100);
  assert.throws(() => validateRemotePort(80), /invalid_port/);
  assert.throws(() => validateRemotePort('abc'), /invalid_port/);
  assert.throws(() => validateRemotePort(70000), /invalid_port/);
});

test('normalizeTunnelName produces safe process names', () => {
  assert.equal(normalizeTunnelName('Mi App Demo'), 'mi-app-demo');
  assert.equal(normalizeTunnelName('Hubie_01'), 'hubie_01');
  assert.throws(() => normalizeTunnelName('../oops'), /invalid_tunnel_name/);
});

test('cloudflare quick tunnel args are closed and localhost-only', () => {
  assert.deepEqual(cloudflareQuickArgs(3200), ['tunnel','--no-autoupdate','--url','http://127.0.0.1:3200']);
});

test('tailscale serve args configure private HTTPS in background', () => {
  assert.deepEqual(tailscaleServeArgs(8787), ['serve','--bg','--yes','http://127.0.0.1:8787']);
});

test('extractTryCloudflareUrl finds generated public URL', () => {
  assert.equal(extractTryCloudflareUrl('INF https://small-tree.trycloudflare.com ready'), 'https://small-tree.trycloudflare.com');
  assert.equal(extractTryCloudflareUrl('no url'), null);
});

test('extractTailscaleHttpsUrl finds tailnet URL', () => {
  assert.equal(extractTailscaleHttpsUrl('Available within your tailnet: https://go-server.example.ts.net'), 'https://go-server.example.ts.net');
  assert.equal(extractTailscaleHttpsUrl('{}'), null);
});

test('cloudflare hostname guide validates host and returns localhost origin', () => {
  const guide = cloudflareHostnameGuide('app.example.com', 3200);
  assert.equal(guide.hostname, 'app.example.com');
  assert.equal(guide.service, 'http://127.0.0.1:3200');
  assert.match(guide.summary, /app\.example\.com/);
  assert.throws(() => cloudflareHostnameGuide('https://bad.example.com', 3200), /invalid_hostname/);
});

test('validateShareUrl only allows http(s) URLs', () => {
  assert.equal(validateShareUrl('https://app.example.com/x'), 'https://app.example.com/x');
  assert.equal(validateShareUrl('http://192.168.1.2:3200'), 'http://192.168.1.2:3200/');
  assert.throws(() => validateShareUrl('javascript:alert(1)'), /invalid_share_url/);
});
